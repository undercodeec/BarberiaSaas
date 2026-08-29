import {
  CashRegisterStatus,
  CashMovementType,
  CommissionSettlementStatus,
  AppointmentPaymentStatus,
  AppointmentStatus,
  CommissionEntryStatus,
  CommissionRuleType,
  MembershipRole,
  MembershipStatus,
  PaymentMethod,
  ProfessionalAdvanceStatus,
  SettlementAdvanceStatus,
  type DatabaseClient,
  type Prisma,
} from '@barber-saas/database';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { zonedDateTimeToUtc } from './agenda';
import { ApiError } from './errors';

interface CommissionRuleCandidate {
  readonly createdAt: Date;
  readonly id: string;
  readonly priority: number;
  readonly serviceId: string | null;
  readonly type: CommissionRuleType;
  readonly value: number;
}

function selectRule(
  rules: readonly CommissionRuleCandidate[],
  serviceId: string,
) {
  return [...rules].sort((left, right) => {
    const specificity =
      Number(right.serviceId === serviceId) -
      Number(left.serviceId === serviceId);
    if (specificity !== 0) return specificity;
    if (right.priority !== left.priority) return right.priority - left.priority;
    return right.createdAt.getTime() - left.createdAt.getTime();
  })[0];
}

function commissionAmount(
  rule: CommissionRuleCandidate,
  baseAmountCents: number,
) {
  if (rule.type === CommissionRuleType.SERVICE_PERCENTAGE) {
    return Math.round((baseAmountCents * rule.value) / 100);
  }
  return rule.value;
}

async function applicableRules(
  transaction: Prisma.TransactionClient,
  input: {
    occurredAt: Date;
    organizationId: string;
    professionalMembershipId: string;
    serviceId: string;
  },
) {
  return transaction.commissionRule.findMany({
    where: {
      effectiveFrom: { lte: input.occurredAt },
      organizationId: input.organizationId,
      professionalMembershipId: input.professionalMembershipId,
      AND: [
        { OR: [{ serviceId: input.serviceId }, { serviceId: null }] },
        {
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: input.occurredAt } },
          ],
        },
      ],
    },
  });
}

export async function reconcileAppointmentCommissions(
  transaction: Prisma.TransactionClient,
  appointmentId: string,
) {
  const appointment = await transaction.appointment.findUnique({
    include: { services: { orderBy: { sortOrder: 'asc' } } },
    where: { id: appointmentId },
  });
  if (
    !appointment ||
    appointment.status !== AppointmentStatus.COMPLETED ||
    appointment.paymentStatus !== AppointmentPaymentStatus.PAID
  ) {
    return [];
  }

  const entries = [];
  for (const service of appointment.services) {
    const existing = await transaction.commissionEntry.findUnique({
      where: { appointmentServiceId: service.id },
    });
    if (existing) {
      entries.push(existing);
      continue;
    }
    const rule = selectRule(
      await applicableRules(transaction, {
        occurredAt: appointment.startsAt,
        organizationId: appointment.organizationId,
        professionalMembershipId: appointment.professionalMembershipId,
        serviceId: service.serviceId,
      }),
      service.serviceId,
    );
    if (!rule) continue;

    const amount = commissionAmount(rule, service.priceCents);
    const entry = await transaction.commissionEntry.upsert({
      create: {
        appointmentId: appointment.id,
        appointmentServiceId: service.id,
        baseAmountCents: service.priceCents,
        calculationSnapshot: {
          baseAmountCents: service.priceCents,
          commissionAmountCents: amount,
          professionalMembershipId: appointment.professionalMembershipId,
          ruleId: rule.id,
          ruleType: rule.type,
          ruleValue: rule.value,
          serviceId: service.serviceId,
          serviceName: service.serviceName,
          source: 'appointment',
        },
        commissionAmountCents: amount,
        locationId: appointment.locationId,
        organizationId: appointment.organizationId,
        professionalMembershipId: appointment.professionalMembershipId,
        ruleId: rule.id,
        status: CommissionEntryStatus.PENDING,
        occurredAt: appointment.startsAt,
      },
      update: {},
      where: { appointmentServiceId: service.id },
    });
    entries.push(entry);
  }
  return entries;
}

export async function createManualSaleCommission(
  transaction: Prisma.TransactionClient,
  input: {
    amountCents: number;
    cashMovementId: string;
    locationId: string;
    occurredAt: Date;
    organizationId: string;
    professionalMembershipId: string;
    serviceId: string;
    serviceName: string;
  },
) {
  const existing = await transaction.commissionEntry.findUnique({
    where: { cashMovementId: input.cashMovementId },
  });
  if (existing) return existing;

  const rule = selectRule(
    await applicableRules(transaction, input),
    input.serviceId,
  );
  if (!rule) return null;
  const amount = commissionAmount(rule, input.amountCents);
  return transaction.commissionEntry.upsert({
    create: {
      baseAmountCents: input.amountCents,
      calculationSnapshot: {
        baseAmountCents: input.amountCents,
        cashMovementId: input.cashMovementId,
        commissionAmountCents: amount,
        professionalMembershipId: input.professionalMembershipId,
        ruleId: rule.id,
        ruleType: rule.type,
        ruleValue: rule.value,
        serviceId: input.serviceId,
        serviceName: input.serviceName,
        source: 'manual_sale',
      },
      cashMovementId: input.cashMovementId,
      commissionAmountCents: amount,
      locationId: input.locationId,
      organizationId: input.organizationId,
      professionalMembershipId: input.professionalMembershipId,
      ruleId: rule.id,
      status: CommissionEntryStatus.PENDING,
      occurredAt: input.occurredAt,
    },
    update: {},
    where: { cashMovementId: input.cashMovementId },
  });
}

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{ readonly user: { readonly id: string } }>;

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const paymentMethodSchema = z.enum(['cash', 'transfer', 'other']);
const advanceSchema = z.object({
  amountCents: z.number().int().min(1).max(100_000_000),
  notes: z.string().trim().max(500).optional(),
  occurredAt: z.iso.datetime().optional(),
  paymentMethod: paymentMethodSchema,
  professionalMembershipId: z.uuid(),
  reference: z.string().trim().max(120).optional(),
});
const settlementSchema = z
  .object({
    notes: z.string().trim().max(500).optional(),
    periodEnd: localDateSchema,
    periodStart: localDateSchema,
    professionalMembershipId: z.uuid(),
  })
  .refine((value) => value.periodStart <= value.periodEnd, {
    message: 'La fecha final debe ser igual o posterior a la inicial.',
    path: ['periodEnd'],
  });
const reasonSchema = z.object({
  reason: z.string().trim().min(3).max(240),
});
const paySettlementSchema = z.object({
  paymentMethod: paymentMethodSchema.optional(),
  reference: z.string().trim().max(120).optional(),
});
const recordParamsSchema = z.object({ id: z.uuid() });
const overviewQuerySchema = z.object({
  periodEnd: localDateSchema.optional(),
  periodStart: localDateSchema.optional(),
  professionalMembershipId: z.uuid().optional(),
});

async function commissionContext(database: DatabaseClient, userId: string) {
  const membership = await database.membership.findFirst({
    include: { organization: true, user: { select: { fullName: true } } },
    where: { status: MembershipStatus.ACTIVE, userId },
  });
  if (!membership)
    throw new ApiError(
      403,
      'ORGANIZATION_REQUIRED',
      'Tu cuenta no pertenece a una barbería activa.',
    );
  return membership;
}

function requireFinancialPermission(
  role: MembershipRole,
  permission:
    | 'cash.manage'
    | 'commission.approve'
    | 'commission.manage'
    | 'commission.pay',
) {
  const allowed =
    permission === 'commission.approve' || permission === 'commission.pay'
      ? role === MembershipRole.OWNER
      : role === MembershipRole.OWNER || role === MembershipRole.MANAGER;
  if (!allowed)
    throw new ApiError(
      403,
      'FORBIDDEN',
      'No tienes permiso para realizar esta acción.',
    );
}

async function professionalInOrganization(
  database: DatabaseClient | Prisma.TransactionClient,
  organizationId: string,
  professionalMembershipId: string,
  requireActive = false,
) {
  const professional = await database.membership.findFirst({
    include: { user: true },
    where: {
      id: professionalMembershipId,
      organizationId,
      role: MembershipRole.BARBER,
      ...(requireActive ? { status: MembershipStatus.ACTIVE } : {}),
    },
  });
  if (!professional)
    throw new ApiError(
      404,
      'PROFESSIONAL_NOT_FOUND',
      'El profesional no existe o no está activo.',
    );
  return professional;
}

function advanceRecord(advance: {
  createdAt: Date;
  deductedAmountCents: number;
  id: string;
  notes: string | null;
  occurredAt: Date;
  originalAmountCents: number;
  paymentMethod: PaymentMethod;
  professionalMembershipId: string;
  reference: string | null;
  reservedAmountCents: number;
  reversalReason: string | null;
  reversedAt: Date | null;
  status: ProfessionalAdvanceStatus;
}) {
  return {
    availableAmountCents:
      advance.originalAmountCents -
      advance.deductedAmountCents -
      advance.reservedAmountCents,
    createdAt: advance.createdAt.toISOString(),
    deductedAmountCents: advance.deductedAmountCents,
    id: advance.id,
    notes: advance.notes,
    occurredAt: advance.occurredAt.toISOString(),
    originalAmountCents: advance.originalAmountCents,
    outstandingAmountCents:
      advance.originalAmountCents - advance.deductedAmountCents,
    paymentMethod: advance.paymentMethod.toLowerCase(),
    professionalMembershipId: advance.professionalMembershipId,
    reference: advance.reference,
    reservedAmountCents: advance.reservedAmountCents,
    reversalReason: advance.reversalReason,
    reversedAt: advance.reversedAt?.toISOString() ?? null,
    status: advance.status.toLowerCase(),
  };
}

function settlementRecord(settlement: {
  advanceDeductionCents: number;
  adjustmentCents: number;
  approvedAt: Date | null;
  cancelledAt: Date | null;
  commissionAmountCents: number;
  createdAt: Date;
  grossGeneratedCents: number;
  id: string;
  notes: string | null;
  paidAt: Date | null;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  periodEnd: Date;
  periodStart: Date;
  professionalMembershipId: string;
  status: CommissionSettlementStatus;
  totalPayableCents: number;
}) {
  return {
    ...settlement,
    approvedAt: settlement.approvedAt?.toISOString() ?? null,
    cancelledAt: settlement.cancelledAt?.toISOString() ?? null,
    createdAt: settlement.createdAt.toISOString(),
    paidAt: settlement.paidAt?.toISOString() ?? null,
    paymentMethod: settlement.paymentMethod?.toLowerCase() ?? null,
    periodEnd: settlement.periodEnd.toISOString().slice(0, 10),
    periodStart: settlement.periodStart.toISOString().slice(0, 10),
    status: settlement.status.toLowerCase(),
  };
}

async function openCashRegister(
  database: DatabaseClient | Prisma.TransactionClient,
  organizationId: string,
) {
  const session = await database.cashRegisterSession.findFirst({
    orderBy: { openedAt: 'desc' },
    where: { organizationId, status: CashRegisterStatus.OPEN },
  });
  if (!session)
    throw new ApiError(
      409,
      'CASH_REGISTER_CLOSED',
      'Abre una caja antes de entregar o pagar en efectivo.',
    );
  return session;
}

async function auditCommissionEvent(
  transaction: Prisma.TransactionClient,
  input: {
    action: string;
    actorUserId: string;
    afterData: Record<string, unknown>;
    beforeData?: Record<string, unknown>;
    entityId: string;
    entityType: string;
    locationId?: string | null;
    organizationId: string;
  },
) {
  await transaction.auditLog.create({
    data: {
      action: input.action,
      actorUserId: input.actorUserId,
      afterData: input.afterData as never,
      beforeData: input.beforeData as never,
      entityId: input.entityId,
      entityType: input.entityType,
      locationId: input.locationId ?? null,
      organizationId: input.organizationId,
    },
  });
}

export function registerCommissionRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
) {
  app.get('/v1/commissions/overview', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await commissionContext(database, user.id);
    const input = overviewQuerySchema.parse(request.query);
    const canReadAll =
      current.role === MembershipRole.OWNER ||
      current.role === MembershipRole.MANAGER;
    const requestedProfessionalId = input.professionalMembershipId;
    if (!canReadAll && requestedProfessionalId !== current.id)
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Solo puedes consultar tus propias comisiones.',
      );
    const professionalIds = requestedProfessionalId
      ? [requestedProfessionalId]
      : canReadAll
        ? undefined
        : [current.id];
    const timeZone = current.organization.defaultTimezone;
    const occurredAt =
      input.periodStart && input.periodEnd
        ? {
            gte: zonedDateTimeToUtc(input.periodStart, 0, timeZone),
            lt: zonedDateTimeToUtc(input.periodEnd, 1440, timeZone),
          }
        : undefined;
    const [professionals, entries, advances, settlements] = await Promise.all([
      database.membership.findMany({
        include: { user: true },
        where: {
          ...(professionalIds ? { id: { in: professionalIds } } : {}),
          organizationId: current.organizationId,
          role: MembershipRole.BARBER,
        },
      }),
      database.commissionEntry.findMany({
        orderBy: { occurredAt: 'desc' },
        where: {
          ...(occurredAt ? { occurredAt } : {}),
          organizationId: current.organizationId,
          ...(professionalIds
            ? { professionalMembershipId: { in: professionalIds } }
            : {}),
        },
      }),
      database.professionalAdvance.findMany({
        orderBy: { occurredAt: 'desc' },
        where: {
          organizationId: current.organizationId,
          ...(professionalIds
            ? { professionalMembershipId: { in: professionalIds } }
            : {}),
        },
      }),
      database.commissionSettlement.findMany({
        orderBy: { createdAt: 'desc' },
        where: {
          organizationId: current.organizationId,
          ...(professionalIds
            ? { professionalMembershipId: { in: professionalIds } }
            : {}),
        },
      }),
    ]);
    const rows = professionals.map((professional) => {
      const ownEntries = entries.filter(
        (entry) => entry.professionalMembershipId === professional.id,
      );
      const ownAdvances = advances.filter(
        (advance) => advance.professionalMembershipId === professional.id,
      );
      return {
        availableAdvanceCents: ownAdvances.reduce(
          (total, advance) =>
            total +
            (advance.status === ProfessionalAdvanceStatus.REVERSED
              ? 0
              : advance.originalAmountCents -
                advance.deductedAmountCents -
                advance.reservedAmountCents),
          0,
        ),
        commissionPendingCents: ownEntries.reduce(
          (total, entry) =>
            total +
            (entry.status === CommissionEntryStatus.PENDING &&
            !entry.settlementId
              ? entry.commissionAmountCents
              : 0),
          0,
        ),
        id: professional.id,
        name: professional.user.fullName,
        outstandingAdvanceCents: ownAdvances.reduce(
          (total, advance) =>
            total +
            (advance.status === ProfessionalAdvanceStatus.REVERSED
              ? 0
              : advance.originalAmountCents - advance.deductedAmountCents),
          0,
        ),
      };
    });
    return {
      advances: advances.map(advanceRecord),
      entries: entries.map((entry) => ({
        amountCents: entry.commissionAmountCents,
        baseAmountCents: entry.baseAmountCents,
        calculationSnapshot: entry.calculationSnapshot,
        id: entry.id,
        occurredAt: entry.occurredAt.toISOString(),
        professionalMembershipId: entry.professionalMembershipId,
        reversalOfEntryId: entry.reversalOfEntryId,
        settlementId: entry.settlementId,
        status: entry.status.toLowerCase(),
      })),
      professionals: rows,
      settlements: settlements.map(settlementRecord),
    };
  });

  app.post('/v1/commissions/entries/:id/reverse', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await commissionContext(database, user.id);
    requireFinancialPermission(current.role, 'commission.manage');
    const { id } = recordParamsSchema.parse(request.params);
    const { reason } = reasonSchema.parse(request.body);
    const reversal = await database.$transaction(async (transaction) => {
      const original = await transaction.commissionEntry.findFirst({
        where: { id, organizationId: current.organizationId },
      });
      if (!original)
        throw new ApiError(
          404,
          'COMMISSION_ENTRY_NOT_FOUND',
          'La comisión no existe.',
        );
      if (original.reversalOfEntryId)
        throw new ApiError(
          409,
          'COMMISSION_REVERSAL_NOT_REVERSIBLE',
          'Una reversión no puede volver a revertirse.',
        );
      const existing = await transaction.commissionEntry.findUnique({
        where: { reversalOfEntryId: original.id },
      });
      if (existing) return existing;
      if (original.settlementId) {
        const settlement = await transaction.commissionSettlement.findUnique({
          where: { id: original.settlementId },
        });
        if (settlement && settlement.status !== CommissionSettlementStatus.PAID)
          throw new ApiError(
            409,
            'COMMISSION_ENTRY_LOCKED',
            'Cancela la liquidación en borrador o completa el pago antes de registrar el reverso.',
          );
      }
      const claimed = await transaction.commissionEntry.updateMany({
        data: { status: CommissionEntryStatus.REVERSED },
        where: {
          id: original.id,
          status: { not: CommissionEntryStatus.REVERSED },
        },
      });
      if (claimed.count !== 1) {
        const concurrent = await transaction.commissionEntry.findUnique({
          where: { reversalOfEntryId: original.id },
        });
        if (concurrent) return concurrent;
        throw new ApiError(
          409,
          'COMMISSION_REVERSAL_CONFLICT',
          'La comisión cambió mientras se registraba el reverso.',
        );
      }
      const created = await transaction.commissionEntry.create({
        data: {
          appointmentId: original.appointmentId,
          baseAmountCents: -original.baseAmountCents,
          calculationSnapshot: {
            originalEntryId: original.id,
            originalSnapshot: original.calculationSnapshot,
            reason,
            source: 'reversal',
          },
          commissionAmountCents: -original.commissionAmountCents,
          locationId: original.locationId,
          occurredAt: new Date(),
          organizationId: original.organizationId,
          professionalMembershipId: original.professionalMembershipId,
          reversalOfEntryId: original.id,
          ruleId: original.ruleId,
          status: CommissionEntryStatus.PENDING,
        },
      });
      await auditCommissionEvent(transaction, {
        action: 'commission_entry.reversed',
        actorUserId: user.id,
        afterData: {
          reason,
          reversalEntryId: created.id,
          reversalAmountCents: created.commissionAmountCents,
        },
        beforeData: {
          amountCents: original.commissionAmountCents,
          settlementId: original.settlementId,
          status: original.status,
        },
        entityId: original.id,
        entityType: 'commission_entry',
        locationId: original.locationId,
        organizationId: current.organizationId,
      });
      return created;
    });
    return {
      reversal: {
        amountCents: reversal.commissionAmountCents,
        id: reversal.id,
        occurredAt: reversal.occurredAt.toISOString(),
        originalEntryId: reversal.reversalOfEntryId,
        status: reversal.status.toLowerCase(),
      },
    };
  });

  app.post('/v1/commissions/advances', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await commissionContext(database, user.id);
    requireFinancialPermission(current.role, 'commission.manage');
    const input = advanceSchema.parse(request.body);
    const advance = await database.$transaction(async (transaction) => {
      const professional = await professionalInOrganization(
        transaction,
        current.organizationId,
        input.professionalMembershipId,
        true,
      );
      let cashMovementId: string | null = null;
      let locationId: string | null = null;
      if (input.paymentMethod === 'cash') {
        requireFinancialPermission(current.role, 'cash.manage');
        const cashRegister = await openCashRegister(
          transaction,
          current.organizationId,
        );
        locationId = cashRegister.locationId;
        const movement = await transaction.cashMovement.create({
          data: {
            amountCents: input.amountCents,
            cashRegisterSessionId: cashRegister.id,
            createdByUserId: user.id,
            description: `Anticipo de comisión · ${professional.user.fullName}`,
            paymentMethod: PaymentMethod.CASH,
            professionalMembershipId: professional.id,
            professionalNameSnapshot: professional.user.fullName,
            recordedByNameSnapshot: current.user.fullName,
            type: CashMovementType.PROFESSIONAL_ADVANCE,
          },
        });
        cashMovementId = movement.id;
      }
      const created = await transaction.professionalAdvance.create({
        data: {
          cashMovementId,
          createdByUserId: user.id,
          notes: input.notes || null,
          occurredAt: input.occurredAt
            ? new Date(input.occurredAt)
            : new Date(),
          organizationId: current.organizationId,
          originalAmountCents: input.amountCents,
          paymentMethod: input.paymentMethod.toUpperCase() as PaymentMethod,
          professionalMembershipId: professional.id,
          reference: input.reference || null,
        },
      });
      await auditCommissionEvent(transaction, {
        action: 'professional_advance.created',
        actorUserId: user.id,
        afterData: {
          amountCents: input.amountCents,
          paymentMethod: input.paymentMethod,
          professionalMembershipId: professional.id,
          reference: input.reference || null,
        },
        entityId: created.id,
        entityType: 'professional_advance',
        locationId,
        organizationId: current.organizationId,
      });
      return created;
    });
    return reply.code(201).send({ advance: advanceRecord(advance) });
  });

  app.post('/v1/commissions/advances/:id/reverse', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await commissionContext(database, user.id);
    requireFinancialPermission(current.role, 'commission.manage');
    const { id } = recordParamsSchema.parse(request.params);
    const { reason } = reasonSchema.parse(request.body);
    const advance = await database.$transaction(async (transaction) => {
      const existing = await transaction.professionalAdvance.findFirst({
        where: { id, organizationId: current.organizationId },
      });
      if (!existing)
        throw new ApiError(404, 'ADVANCE_NOT_FOUND', 'El anticipo no existe.');
      if (existing.status === ProfessionalAdvanceStatus.REVERSED)
        return existing;
      if (existing.deductedAmountCents > 0)
        throw new ApiError(
          409,
          'ADVANCE_ALREADY_DEDUCTED',
          'El anticipo ya tiene descuentos aprobados; registra un ajuste compensatorio.',
        );
      if (existing.reservedAmountCents > 0)
        throw new ApiError(
          409,
          'ADVANCE_RESERVED',
          'Cancela primero la liquidación en borrador que reservó este anticipo.',
        );
      let reversalCashMovementId: string | null = null;
      let locationId: string | null = null;
      if (existing.paymentMethod === PaymentMethod.CASH) {
        requireFinancialPermission(current.role, 'cash.manage');
        const cashRegister = await openCashRegister(
          transaction,
          current.organizationId,
        );
        locationId = cashRegister.locationId;
        const movement = await transaction.cashMovement.create({
          data: {
            amountCents: existing.originalAmountCents,
            cashRegisterSessionId: cashRegister.id,
            createdByUserId: user.id,
            description: 'Reverso de anticipo de comisión',
            paymentMethod: PaymentMethod.CASH,
            recordedByNameSnapshot: current.user.fullName,
            type: CashMovementType.PROFESSIONAL_ADVANCE_REVERSAL,
          },
        });
        reversalCashMovementId = movement.id;
      }
      const reversed = await transaction.professionalAdvance.update({
        data: {
          reversalCashMovementId,
          reversalReason: reason,
          reversedAt: new Date(),
          reversedByUserId: user.id,
          status: ProfessionalAdvanceStatus.REVERSED,
        },
        where: { id },
      });
      await auditCommissionEvent(transaction, {
        action: 'professional_advance.reversed',
        actorUserId: user.id,
        afterData: { reason, reversalCashMovementId },
        entityId: id,
        entityType: 'professional_advance',
        locationId,
        organizationId: current.organizationId,
      });
      return reversed;
    });
    return { advance: advanceRecord(advance) };
  });

  app.post('/v1/commissions/settlements', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await commissionContext(database, user.id);
    requireFinancialPermission(current.role, 'commission.manage');
    const input = settlementSchema.parse(request.body);
    const result = await database.$transaction(async (transaction) => {
      await professionalInOrganization(
        transaction,
        current.organizationId,
        input.professionalMembershipId,
      );
      const start = zonedDateTimeToUtc(
        input.periodStart,
        0,
        current.organization.defaultTimezone,
      );
      const end = zonedDateTimeToUtc(
        input.periodEnd,
        1440,
        current.organization.defaultTimezone,
      );
      const entries = await transaction.commissionEntry.findMany({
        orderBy: { occurredAt: 'asc' },
        where: {
          occurredAt: { gte: start, lt: end },
          organizationId: current.organizationId,
          professionalMembershipId: input.professionalMembershipId,
          settlementId: null,
          status: CommissionEntryStatus.PENDING,
        },
      });
      if (!entries.length)
        throw new ApiError(
          409,
          'NO_PENDING_COMMISSIONS',
          'No existen comisiones pendientes para el período seleccionado.',
        );
      const grossGeneratedCents = entries.reduce(
        (total, entry) => total + entry.baseAmountCents,
        0,
      );
      const commissionAmountCents = entries.reduce(
        (total, entry) => total + entry.commissionAmountCents,
        0,
      );
      const advances = await transaction.professionalAdvance.findMany({
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
        where: {
          organizationId: current.organizationId,
          professionalMembershipId: input.professionalMembershipId,
          status: {
            in: [
              ProfessionalAdvanceStatus.PENDING,
              ProfessionalAdvanceStatus.PARTIALLY_DEDUCTED,
            ],
          },
        },
      });
      let remaining = commissionAmountCents;
      const allocations = advances
        .map((advance) => {
          const available =
            advance.originalAmountCents -
            advance.deductedAmountCents -
            advance.reservedAmountCents;
          const amountCents = Math.min(remaining, available);
          remaining -= amountCents;
          return { advance, amountCents };
        })
        .filter((allocation) => allocation.amountCents > 0);
      const advanceDeductionCents = allocations.reduce(
        (total, allocation) => total + allocation.amountCents,
        0,
      );
      const settlement = await transaction.commissionSettlement.create({
        data: {
          advanceDeductionCents,
          commissionAmountCents,
          createdByUserId: user.id,
          grossGeneratedCents,
          notes: input.notes || null,
          organizationId: current.organizationId,
          periodEnd: new Date(`${input.periodEnd}T00:00:00.000Z`),
          periodStart: new Date(`${input.periodStart}T00:00:00.000Z`),
          professionalMembershipId: input.professionalMembershipId,
          totalPayableCents: Math.max(
            0,
            commissionAmountCents - advanceDeductionCents,
          ),
        },
      });
      const assigned = await transaction.commissionEntry.updateMany({
        data: { settlementId: settlement.id },
        where: {
          id: { in: entries.map((entry) => entry.id) },
          settlementId: null,
          status: CommissionEntryStatus.PENDING,
        },
      });
      if (assigned.count !== entries.length)
        throw new ApiError(
          409,
          'SETTLEMENT_CONFLICT',
          'Otra liquidación tomó una de las comisiones. Actualiza e intenta nuevamente.',
        );
      for (const allocation of allocations) {
        const reserved = await transaction.professionalAdvance.updateMany({
          data: {
            reservedAmountCents: {
              increment: allocation.amountCents,
            },
          },
          where: {
            deductedAmountCents: allocation.advance.deductedAmountCents,
            id: allocation.advance.id,
            reservedAmountCents: allocation.advance.reservedAmountCents,
            status: allocation.advance.status,
          },
        });
        if (reserved.count !== 1)
          throw new ApiError(
            409,
            'ADVANCE_RESERVATION_CONFLICT',
            'Otra liquidación reservó el anticipo. Actualiza e intenta nuevamente.',
          );
        await transaction.commissionSettlementAdvance.create({
          data: {
            advanceId: allocation.advance.id,
            amountCents: allocation.amountCents,
            settlementId: settlement.id,
          },
        });
      }
      await auditCommissionEvent(transaction, {
        action: 'commission_settlement.created',
        actorUserId: user.id,
        afterData: {
          advanceDeductionCents,
          commissionAmountCents,
          entryIds: entries.map((entry) => entry.id),
          periodEnd: input.periodEnd,
          periodStart: input.periodStart,
          totalPayableCents: settlement.totalPayableCents,
        },
        entityId: settlement.id,
        entityType: 'commission_settlement',
        organizationId: current.organizationId,
      });
      return settlement;
    });
    return reply.code(201).send({ settlement: settlementRecord(result) });
  });

  app.post('/v1/commissions/settlements/:id/approve', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await commissionContext(database, user.id);
    requireFinancialPermission(current.role, 'commission.approve');
    const { id } = recordParamsSchema.parse(request.params);
    const result = await database.$transaction(async (transaction) => {
      const settlement = await transaction.commissionSettlement.findFirst({
        where: { id, organizationId: current.organizationId },
      });
      if (!settlement)
        throw new ApiError(
          404,
          'SETTLEMENT_NOT_FOUND',
          'La liquidación no existe.',
        );
      if (settlement.status === CommissionSettlementStatus.APPROVED)
        return settlement;
      if (settlement.status !== CommissionSettlementStatus.DRAFT)
        throw new ApiError(
          409,
          'SETTLEMENT_NOT_DRAFT',
          'Solo una liquidación en borrador puede aprobarse.',
        );
      const appliedAt = new Date();
      const claimed = await transaction.commissionSettlement.updateMany({
        data: {
          approvedAt: appliedAt,
          approvedByUserId: user.id,
          status: CommissionSettlementStatus.APPROVED,
        },
        where: { id, status: CommissionSettlementStatus.DRAFT },
      });
      if (claimed.count !== 1)
        throw new ApiError(
          409,
          'SETTLEMENT_STATE_CONFLICT',
          'La liquidación cambió mientras se aprobaba. Actualiza e intenta nuevamente.',
        );
      const allocations =
        await transaction.commissionSettlementAdvance.findMany({
          where: { settlementId: id, status: SettlementAdvanceStatus.RESERVED },
        });
      for (const allocation of allocations) {
        const advance = await transaction.professionalAdvance.findUniqueOrThrow(
          {
            where: { id: allocation.advanceId },
          },
        );
        if (advance.reservedAmountCents < allocation.amountCents)
          throw new ApiError(
            409,
            'ADVANCE_RESERVATION_MISSING',
            'La reserva del anticipo ya no está disponible.',
          );
        const deductedAmountCents =
          advance.deductedAmountCents + allocation.amountCents;
        await transaction.professionalAdvance.update({
          data: {
            deductedAmountCents,
            reservedAmountCents: {
              decrement: allocation.amountCents,
            },
            status:
              deductedAmountCents === advance.originalAmountCents
                ? ProfessionalAdvanceStatus.FULLY_DEDUCTED
                : ProfessionalAdvanceStatus.PARTIALLY_DEDUCTED,
          },
          where: { id: advance.id },
        });
      }
      await transaction.commissionSettlementAdvance.updateMany({
        data: { appliedAt, status: SettlementAdvanceStatus.APPLIED },
        where: { settlementId: id, status: SettlementAdvanceStatus.RESERVED },
      });
      await transaction.commissionEntry.updateMany({
        data: { status: CommissionEntryStatus.APPROVED },
        where: {
          settlementId: id,
          status: CommissionEntryStatus.PENDING,
        },
      });
      const approved = await transaction.commissionSettlement.findUniqueOrThrow(
        {
          where: { id },
        },
      );
      await auditCommissionEvent(transaction, {
        action: 'commission_settlement.approved',
        actorUserId: user.id,
        afterData: { approvedAt: appliedAt.toISOString() },
        entityId: id,
        entityType: 'commission_settlement',
        organizationId: current.organizationId,
      });
      return approved;
    });
    return { settlement: settlementRecord(result) };
  });

  app.post('/v1/commissions/settlements/:id/cancel', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await commissionContext(database, user.id);
    requireFinancialPermission(current.role, 'commission.manage');
    const { id } = recordParamsSchema.parse(request.params);
    const { reason } = reasonSchema.parse(request.body);
    const result = await database.$transaction(async (transaction) => {
      const settlement = await transaction.commissionSettlement.findFirst({
        where: { id, organizationId: current.organizationId },
      });
      if (!settlement)
        throw new ApiError(
          404,
          'SETTLEMENT_NOT_FOUND',
          'La liquidación no existe.',
        );
      if (settlement.status === CommissionSettlementStatus.CANCELLED)
        return settlement;
      if (settlement.status !== CommissionSettlementStatus.DRAFT)
        throw new ApiError(
          409,
          'SETTLEMENT_NOT_DRAFT',
          'Solo una liquidación en borrador puede cancelarse.',
        );
      const releasedAt = new Date();
      const claimed = await transaction.commissionSettlement.updateMany({
        data: {
          cancellationReason: reason,
          cancelledAt: releasedAt,
          cancelledByUserId: user.id,
          status: CommissionSettlementStatus.CANCELLED,
        },
        where: { id, status: CommissionSettlementStatus.DRAFT },
      });
      if (claimed.count !== 1)
        throw new ApiError(
          409,
          'SETTLEMENT_STATE_CONFLICT',
          'La liquidación cambió mientras se cancelaba. Actualiza e intenta nuevamente.',
        );
      const allocations =
        await transaction.commissionSettlementAdvance.findMany({
          where: { settlementId: id, status: SettlementAdvanceStatus.RESERVED },
        });
      for (const allocation of allocations) {
        await transaction.professionalAdvance.update({
          data: {
            reservedAmountCents: { decrement: allocation.amountCents },
          },
          where: { id: allocation.advanceId },
        });
      }
      await transaction.commissionSettlementAdvance.updateMany({
        data: { releasedAt, status: SettlementAdvanceStatus.RELEASED },
        where: { settlementId: id, status: SettlementAdvanceStatus.RESERVED },
      });
      await transaction.commissionEntry.updateMany({
        data: { settlementId: null },
        where: { settlementId: id, status: CommissionEntryStatus.PENDING },
      });
      const cancelled =
        await transaction.commissionSettlement.findUniqueOrThrow({
          where: { id },
        });
      await auditCommissionEvent(transaction, {
        action: 'commission_settlement.cancelled',
        actorUserId: user.id,
        afterData: { reason },
        entityId: id,
        entityType: 'commission_settlement',
        organizationId: current.organizationId,
      });
      return cancelled;
    });
    return { settlement: settlementRecord(result) };
  });

  app.post('/v1/commissions/settlements/:id/pay', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await commissionContext(database, user.id);
    requireFinancialPermission(current.role, 'commission.pay');
    const { id } = recordParamsSchema.parse(request.params);
    const input = paySettlementSchema.parse(request.body);
    const result = await database.$transaction(async (transaction) => {
      const settlement = await transaction.commissionSettlement.findFirst({
        where: { id, organizationId: current.organizationId },
      });
      if (!settlement)
        throw new ApiError(
          404,
          'SETTLEMENT_NOT_FOUND',
          'La liquidación no existe.',
        );
      if (settlement.status === CommissionSettlementStatus.PAID)
        return settlement;
      if (settlement.status !== CommissionSettlementStatus.APPROVED)
        throw new ApiError(
          409,
          'SETTLEMENT_NOT_APPROVED',
          'Aprueba la liquidación antes de registrar el pago.',
        );
      if (settlement.totalPayableCents > 0 && !input.paymentMethod)
        throw new ApiError(
          400,
          'PAYMENT_METHOD_REQUIRED',
          'Selecciona el método de pago.',
        );
      const paidAt = new Date();
      const claimed = await transaction.commissionSettlement.updateMany({
        data: {
          paidAt,
          paidByUserId: user.id,
          paymentMethod: input.paymentMethod
            ? (input.paymentMethod.toUpperCase() as PaymentMethod)
            : null,
          paymentReference: input.reference || null,
          status: CommissionSettlementStatus.PAID,
        },
        where: { id, status: CommissionSettlementStatus.APPROVED },
      });
      if (claimed.count !== 1)
        throw new ApiError(
          409,
          'SETTLEMENT_STATE_CONFLICT',
          'La liquidación cambió mientras se pagaba. Actualiza e intenta nuevamente.',
        );
      let cashMovementId: string | null = null;
      let locationId: string | null = null;
      if (settlement.totalPayableCents > 0 && input.paymentMethod === 'cash') {
        requireFinancialPermission(current.role, 'cash.manage');
        const cashRegister = await openCashRegister(
          transaction,
          current.organizationId,
        );
        locationId = cashRegister.locationId;
        const movement = await transaction.cashMovement.create({
          data: {
            amountCents: settlement.totalPayableCents,
            cashRegisterSessionId: cashRegister.id,
            createdByUserId: user.id,
            description: 'Pago de liquidación de comisiones',
            paymentMethod: PaymentMethod.CASH,
            recordedByNameSnapshot: current.user.fullName,
            type: CashMovementType.COMMISSION_SETTLEMENT,
          },
        });
        cashMovementId = movement.id;
      }
      await transaction.commissionEntry.updateMany({
        data: { status: CommissionEntryStatus.SETTLED },
        where: {
          settlementId: id,
          status: CommissionEntryStatus.APPROVED,
        },
      });
      const paid = await transaction.commissionSettlement.update({
        data: { cashMovementId },
        where: { id },
      });
      await auditCommissionEvent(transaction, {
        action: 'commission_settlement.paid',
        actorUserId: user.id,
        afterData: {
          cashMovementId,
          paymentMethod: input.paymentMethod || null,
          reference: input.reference || null,
          totalPayableCents: paid.totalPayableCents,
        },
        entityId: id,
        entityType: 'commission_settlement',
        locationId,
        organizationId: current.organizationId,
      });
      return paid;
    });
    return { settlement: settlementRecord(result) };
  });
}
