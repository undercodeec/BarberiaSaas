import {
  CashRegisterStatus,
  CashMovementType,
  PaymentMethod,
  AppointmentPaymentStatus,
  MembershipStatus,
  StockDirection,
  StockMovementType,
  type DatabaseClient,
} from '@barber-saas/database';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import {
  createManualSaleCommission,
  reconcileAppointmentCommissions,
} from './commissions';
import { ApiError } from './errors';
import {
  assertCanUseProfessional,
  getEntitlements,
} from './subscription-policy';

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{
  readonly user: { readonly email: string; readonly id: string };
}>;

const createMovementSchema = z.object({
  amountCents: z.number().int().min(1).max(100_000_000),
  appointmentId: z.uuid().optional(),
  description: z.string().trim().min(2).max(240),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'other']).optional(),
  productId: z.uuid().optional(),
  productQuantity: z.number().int().min(1).max(10_000).optional(),
  professionalMembershipId: z.uuid().optional(),
  serviceId: z.uuid().optional(),
  type: z.enum(['sale', 'deposit', 'other_income', 'expense', 'withdrawal']),
});
const closeCashRegisterSchema = z.object({
  closingAmountCents: z.number().int().min(0).max(100_000_000),
  note: z.string().trim().max(500).optional(),
});
const openCashRegisterSchema = z.object({
  openingAmountCents: z.number().int().min(0).max(100_000_000),
  responsibleMembershipId: z.string().uuid().optional(),
});

async function scope(database: DatabaseClient, userId: string) {
  const membership = await database.membership.findFirst({
    include: { memberLocations: { take: 1 } },
    where: { status: MembershipStatus.ACTIVE, userId },
  });
  return {
    locationId: membership?.memberLocations[0]?.locationId ?? null,
    organizationId: membership?.organizationId ?? null,
  };
}

function publicSession(session: {
  closedAt?: Date | null;
  closingNote?: string | null;
  closingAmountCents?: number | null;
  differenceCents?: number | null;
  expectedAmountCents?: number | null;
  id: string;
  openedAt: Date;
  openingAmountCents: number;
  responsibleName: string;
  status: CashRegisterStatus;
}) {
  return {
    closedAt: session.closedAt?.toISOString() ?? null,
    closingNote: session.closingNote ?? null,
    closingAmountCents: session.closingAmountCents ?? null,
    differenceCents: session.differenceCents ?? null,
    expectedAmountCents: session.expectedAmountCents ?? null,
    id: session.id,
    openedAt: session.openedAt.toISOString(),
    openingAmountCents: session.openingAmountCents,
    responsibleName: session.responsibleName,
    status: session.status.toLowerCase(),
  };
}

function totalsFor(
  openingAmountCents: number,
  movements: ReadonlyArray<{
    amountCents: number;
    paymentMethod: PaymentMethod | null;
    reversedAt: Date | null;
    type: CashMovementType;
  }>,
) {
  return movements.reduce(
    (totals, movement) => {
      if (movement.reversedAt) return totals;
      const isCash = movement.paymentMethod === PaymentMethod.CASH;
      const isIncome =
        movement.type === CashMovementType.SALE ||
        movement.type === CashMovementType.DEPOSIT ||
        movement.type === CashMovementType.OTHER_INCOME;
      if (isIncome) {
        if (movement.type === CashMovementType.SALE)
          totals.sales += movement.amountCents;
        if (movement.type === CashMovementType.DEPOSIT)
          totals.deposits += movement.amountCents;
        if (movement.type === CashMovementType.OTHER_INCOME)
          totals.otherIncome += movement.amountCents;
        if (isCash) totals.cash += movement.amountCents;
        if (isCash && movement.type === CashMovementType.SALE)
          totals.cashSales += movement.amountCents;
        if (movement.paymentMethod === PaymentMethod.CARD)
          totals.card += movement.amountCents;
        if (movement.paymentMethod === PaymentMethod.TRANSFER)
          totals.transfers += movement.amountCents;
        if (movement.paymentMethod === PaymentMethod.OTHER)
          totals.other += movement.amountCents;
      } else {
        if (movement.type === CashMovementType.EXPENSE)
          totals.expenses += movement.amountCents;
        if (movement.type === CashMovementType.WITHDRAWAL)
          totals.withdrawals += movement.amountCents;
        if (movement.type === CashMovementType.PROFESSIONAL_ADVANCE)
          totals.professionalAdvances += movement.amountCents;
        if (movement.type === CashMovementType.COMMISSION_SETTLEMENT)
          totals.commissionSettlements += movement.amountCents;
        if (movement.type === CashMovementType.PROFESSIONAL_ADVANCE_REVERSAL)
          totals.advanceReversals += movement.amountCents;
        if (isCash) {
          totals.cash +=
            movement.type === CashMovementType.PROFESSIONAL_ADVANCE_REVERSAL
              ? movement.amountCents
              : -movement.amountCents;
        }
      }
      return totals;
    },
    {
      advanceReversals: 0,
      card: 0,
      cash: openingAmountCents,
      cashSales: 0,
      commissionSettlements: 0,
      deposits: 0,
      expenses: 0,
      other: 0,
      otherIncome: 0,
      professionalAdvances: 0,
      sales: 0,
      transfers: 0,
      withdrawals: 0,
    },
  );
}

function publicMovement(movement: {
  amountCents: number;
  appointmentId: string | null;
  createdAt: Date;
  description: string;
  id: string;
  paymentMethod: PaymentMethod | null;
  productId: string | null;
  productQuantity: number | null;
  professionalMembershipId: string | null;
  reversalReason: string | null;
  reversedAt: Date | null;
  serviceId: string | null;
  type: CashMovementType;
}) {
  return {
    amountCents: movement.amountCents,
    appointmentId: movement.appointmentId,
    createdAt: movement.createdAt.toISOString(),
    description: movement.description,
    id: movement.id,
    paymentMethod: movement.paymentMethod?.toLowerCase() ?? null,
    productId: movement.productId,
    productQuantity: movement.productQuantity,
    professionalMembershipId: movement.professionalMembershipId,
    reversalReason: movement.reversalReason,
    reversedAt: movement.reversedAt?.toISOString() ?? null,
    serviceId: movement.serviceId,
    type: movement.type.toLowerCase(),
  };
}

async function recordAudit(
  database: DatabaseClient,
  currentScope: Awaited<ReturnType<typeof scope>>,
  userId: string,
  entityType: string,
  entityId: string,
  action: string,
  afterData: Record<string, unknown>,
) {
  if (!currentScope.organizationId) return;
  await database.auditLog.create({
    data: {
      action,
      actorUserId: userId,
      afterData: afterData as never,
      entityId,
      entityType,
      locationId: currentScope.locationId,
      organizationId: currentScope.organizationId,
    },
  });
}

export function registerCashRegisterRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
) {
  app.get('/v1/cash-register/current', async (request) => {
    const { user } = await authenticate(database, request);
    const currentScope = await scope(database, user.id);
    const session = await database.cashRegisterSession.findFirst({
      orderBy: { openedAt: 'desc' },
      where: {
        status: CashRegisterStatus.OPEN,
        ...(currentScope.organizationId
          ? { organizationId: currentScope.organizationId }
          : { ownerUserId: user.id }),
      },
    });
    return { session: session ? publicSession(session) : null };
  });

  app.post('/v1/cash-register/open', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = openCashRegisterSchema.parse(request.body);
    const currentScope = await scope(database, user.id);
    const existing = await database.cashRegisterSession.findFirst({
      where: {
        status: CashRegisterStatus.OPEN,
        ...(currentScope.organizationId
          ? { organizationId: currentScope.organizationId }
          : { ownerUserId: user.id }),
      },
    });
    if (existing)
      throw new ApiError(
        409,
        'CASH_REGISTER_ALREADY_OPEN',
        'Ya existe una caja abierta.',
      );

    let responsibleName: string;
    if (input.responsibleMembershipId) {
      if (!currentScope.organizationId)
        throw new ApiError(
          400,
          'RESPONSIBLE_UNAVAILABLE',
          'No hay equipo configurado.',
        );
      const responsible = await database.membership.findFirst({
        include: { user: true },
        where: {
          id: input.responsibleMembershipId,
          organizationId: currentScope.organizationId,
          status: MembershipStatus.ACTIVE,
        },
      });
      if (!responsible)
        throw new ApiError(
          404,
          'RESPONSIBLE_NOT_FOUND',
          'El responsable no existe.',
        );
      await assertCanUseProfessional(
        database,
        currentScope.organizationId,
        responsible.id,
      );
      responsibleName = responsible.user.fullName;
    } else {
      const currentUser = await database.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      responsibleName = currentUser.fullName;
    }

    const session = await database.cashRegisterSession.create({
      data: {
        locationId: currentScope.locationId,
        openingAmountCents: input.openingAmountCents,
        organizationId: currentScope.organizationId,
        ownerUserId: user.id,
        responsibleMembershipId: input.responsibleMembershipId ?? null,
        responsibleName,
      },
    });
    await recordAudit(
      database,
      currentScope,
      user.id,
      'cash_register_session',
      session.id,
      'cash_register.opened',
      { openingAmountCents: input.openingAmountCents, responsibleName },
    );
    return reply.code(201).send({ session: publicSession(session) });
  });
  app.get('/v1/cash-register/summary', async (request) => {
    const { user } = await authenticate(database, request);
    const currentScope = await scope(database, user.id);
    const session = await database.cashRegisterSession.findFirst({
      include: { movements: { orderBy: { createdAt: 'desc' } } },
      orderBy: { openedAt: 'desc' },
      where: {
        status: CashRegisterStatus.OPEN,
        ...(currentScope.organizationId
          ? { organizationId: currentScope.organizationId }
          : { ownerUserId: user.id }),
      },
    });
    if (!session) return { session: null, movements: [], totals: null };
    const totals = totalsFor(session.openingAmountCents, session.movements);
    return {
      session: publicSession(session),
      movements: session.movements.map(publicMovement),
      totals: { ...totals, expectedCash: totals.cash },
    };
  });

  app.get('/v1/cash-register/history', async (request) => {
    const { user } = await authenticate(database, request);
    const currentScope = await scope(database, user.id);
    const sessions = await database.cashRegisterSession.findMany({
      include: { movements: true },
      orderBy: { openedAt: 'desc' },
      take: 60,
      where: {
        status: CashRegisterStatus.CLOSED,
        ...(currentScope.organizationId
          ? { organizationId: currentScope.organizationId }
          : { organizationId: null, ownerUserId: user.id }),
      },
    });
    return {
      sessions: sessions.map((session) => {
        const totals = totalsFor(session.openingAmountCents, session.movements);
        return {
          ...publicSession(session),
          totals: { ...totals, expectedCash: totals.cash },
        };
      }),
    };
  });

  app.get('/v1/cash-register/sessions/:sessionId', async (request) => {
    const { user } = await authenticate(database, request);
    const { sessionId } = z
      .object({ sessionId: z.uuid() })
      .parse(request.params);
    const currentScope = await scope(database, user.id);
    const session = await database.cashRegisterSession.findFirst({
      include: { movements: { orderBy: { createdAt: 'desc' } } },
      where: {
        id: sessionId,
        ...(currentScope.organizationId
          ? { organizationId: currentScope.organizationId }
          : { organizationId: null, ownerUserId: user.id }),
      },
    });
    if (!session)
      throw new ApiError(404, 'CASH_REGISTER_NOT_FOUND', 'La caja no existe.');
    const calculated = totalsFor(session.openingAmountCents, session.movements);
    const expectedCash = session.expectedAmountCents ?? calculated.cash;
    return {
      movements: session.movements.map(publicMovement),
      session: publicSession(session),
      totals: { ...calculated, cash: expectedCash, expectedCash },
    };
  });

  app.post('/v1/cash-register/movements', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = createMovementSchema.parse(request.body);
    if (input.appointmentId && input.type !== 'sale')
      throw new ApiError(
        400,
        'APPOINTMENT_REQUIRES_SALE',
        'Una cita solo puede vincularse a una venta.',
      );
    const hasCommissionService = Boolean(input.serviceId);
    const hasCommissionProfessional = Boolean(input.professionalMembershipId);
    const hasProduct = Boolean(input.productId);
    const hasProductQuantity = input.productQuantity !== undefined;
    if (
      input.type === 'sale' &&
      !input.appointmentId &&
      !hasProduct &&
      !hasCommissionService &&
      !hasCommissionProfessional
    )
      throw new ApiError(
        400,
        'SALE_SOURCE_REQUIRED',
        'Selecciona un servicio o producto para registrar la venta.',
      );
    if (hasProduct !== hasProductQuantity)
      throw new ApiError(
        400,
        'PRODUCT_SOURCE_INCOMPLETE',
        'Selecciona el producto y su cantidad para registrar la venta.',
      );
    if (hasProduct && input.type !== 'sale')
      throw new ApiError(
        400,
        'PRODUCT_REQUIRES_SALE',
        'Solo una venta puede descontar existencias de producto.',
      );
    if (
      hasProduct &&
      (input.appointmentId || hasCommissionService || hasCommissionProfessional)
    )
      throw new ApiError(
        400,
        'DUPLICATE_SALE_SOURCE',
        'Una venta de producto no puede vincularse a una cita o servicio.',
      );
    if (hasCommissionService !== hasCommissionProfessional)
      throw new ApiError(
        400,
        'COMMISSION_SOURCE_INCOMPLETE',
        'Selecciona el servicio y el profesional para registrar una venta comisionable.',
      );
    if (
      (hasCommissionService || hasCommissionProfessional) &&
      input.type !== 'sale'
    )
      throw new ApiError(
        400,
        'COMMISSION_REQUIRES_SALE',
        'Solo las ventas pueden generar comisión.',
      );
    if (input.appointmentId && hasCommissionService)
      throw new ApiError(
        400,
        'DUPLICATE_COMMISSION_SOURCE',
        'La cita ya define el servicio y el profesional de la comisión.',
      );
    if (
      ['sale', 'deposit', 'other_income'].includes(input.type) &&
      !input.paymentMethod
    )
      throw new ApiError(
        400,
        'PAYMENT_METHOD_REQUIRED',
        'Selecciona el método de pago del ingreso.',
      );
    const currentScope = await scope(database, user.id);
    const session = await database.cashRegisterSession.findFirst({
      where: {
        status: CashRegisterStatus.OPEN,
        ...(currentScope.organizationId
          ? { organizationId: currentScope.organizationId }
          : { ownerUserId: user.id }),
      },
    });
    if (!session)
      throw new ApiError(
        409,
        'CASH_REGISTER_CLOSED',
        'Abre una caja antes de registrar movimientos.',
      );
    const movement = await database.$transaction(async (transaction) => {
      if (input.appointmentId) {
        if (!currentScope.organizationId)
          throw new ApiError(
            403,
            'ORGANIZATION_REQUIRED',
            'La cita debe pertenecer a una organización activa.',
          );
        const appointment = await transaction.appointment.findFirst({
          include: { services: true },
          where: {
            id: input.appointmentId,
            organizationId: currentScope.organizationId,
          },
        });
        if (!appointment)
          throw new ApiError(
            404,
            'APPOINTMENT_NOT_FOUND',
            'La cita no existe.',
          );
        if (appointment.paymentStatus === AppointmentPaymentStatus.PAID)
          throw new ApiError(
            409,
            'APPOINTMENT_ALREADY_PAID',
            'La cita ya fue cobrada.',
          );
        const totalCents = appointment.services.reduce(
          (total, service) => total + service.priceCents,
          0,
        );
        if (input.amountCents !== totalCents)
          throw new ApiError(
            400,
            'APPOINTMENT_TOTAL_MISMATCH',
            'El cobro debe coincidir con el total completo de la cita.',
          );
        await transaction.appointment.update({
          data: { paymentStatus: AppointmentPaymentStatus.PAID },
          where: { id: appointment.id },
        });
      }

      let commissionableService: { id: string; name: string } | null = null;
      if (input.serviceId && input.professionalMembershipId) {
        if (!currentScope.organizationId || !session.locationId)
          throw new ApiError(
            400,
            'COMMISSION_CONTEXT_REQUIRED',
            'Configura una organización y sucursal para registrar comisiones.',
          );
        const entitlements = await getEntitlements(
          transaction,
          currentScope.organizationId,
        );
        if (!entitlements.featureFlags.commissions)
          throw new ApiError(
            403,
            'PLAN_FEATURE_NOT_INCLUDED',
            'Las comisiones requieren Nava Local.',
          );
        await assertCanUseProfessional(
          transaction,
          currentScope.organizationId,
          input.professionalMembershipId,
        );
        const assignment = await transaction.professionalService.findFirst({
          include: { service: true },
          where: {
            locationId: session.locationId,
            membershipId: input.professionalMembershipId,
            serviceId: input.serviceId,
            membership: {
              organizationId: currentScope.organizationId,
              status: MembershipStatus.ACTIVE,
            },
            service: {
              isActive: true,
              organizationId: currentScope.organizationId,
            },
          },
        });
        if (!assignment)
          throw new ApiError(
            404,
            'COMMISSION_ASSIGNMENT_NOT_FOUND',
            'El servicio no está asignado al profesional seleccionado.',
          );
        commissionableService = assignment.service;
      }

      let productSale: {
        costCents: number;
        id: string;
        name: string;
        quantity: number;
        resultingQuantity: number | null;
      } | null = null;
      if (input.productId && input.productQuantity) {
        if (!currentScope.organizationId || !session.locationId)
          throw new ApiError(
            400,
            'INVENTORY_CONTEXT_REQUIRED',
            'Configura una organización y sucursal para vender productos.',
          );
        const entitlements = await getEntitlements(
          transaction,
          currentScope.organizationId,
        );
        if (!entitlements.featureFlags.inventory)
          throw new ApiError(
            403,
            'PLAN_FEATURE_NOT_INCLUDED',
            'El inventario requiere Nava Local.',
          );
        await transaction.$queryRaw`
          WITH lock AS MATERIALIZED (
            SELECT pg_advisory_xact_lock(hashtext(${`${session.locationId}:${input.productId}`}))
          )
          SELECT 1 AS locked FROM lock
        `;
        const product = await transaction.product.findFirst({
          where: {
            id: input.productId,
            isActive: true,
            organizationId: currentScope.organizationId,
          },
        });
        if (!product)
          throw new ApiError(
            404,
            'PRODUCT_NOT_FOUND',
            'El producto no existe o está inactivo.',
          );
        const expectedAmount = product.salePriceCents * input.productQuantity;
        if (input.amountCents !== expectedAmount)
          throw new ApiError(
            400,
            'PRODUCT_TOTAL_MISMATCH',
            'El cobro debe coincidir con el precio y cantidad del producto.',
          );
        let resultingQuantity: number | null = null;
        if (product.stockTrackingEnabled) {
          const inventory = await transaction.locationInventory.upsert({
            create: {
              locationId: session.locationId,
              productId: product.id,
              quantityOnHand: 0,
            },
            update: {},
            where: {
              locationId_productId: {
                locationId: session.locationId,
                productId: product.id,
              },
            },
          });
          const decremented = await transaction.locationInventory.updateMany({
            data: { quantityOnHand: { decrement: input.productQuantity } },
            where: {
              locationId: session.locationId,
              productId: product.id,
              quantityOnHand: { gte: input.productQuantity },
            },
          });
          if (decremented.count === 0)
            throw new ApiError(
              409,
              'INSUFFICIENT_STOCK',
              `Solo quedan ${inventory.quantityOnHand} unidades disponibles.`,
            );
          const updatedInventory =
            await transaction.locationInventory.findUnique({
              where: {
                locationId_productId: {
                  locationId: session.locationId,
                  productId: product.id,
                },
              },
            });
          if (!updatedInventory)
            throw new ApiError(
              409,
              'INVENTORY_NOT_AVAILABLE',
              'No fue posible actualizar las existencias.',
            );
          resultingQuantity = updatedInventory.quantityOnHand;
        }
        productSale = {
          costCents: product.costCents,
          id: product.id,
          name: product.name,
          quantity: input.productQuantity,
          resultingQuantity,
        };
      }

      const created = await transaction.cashMovement.create({
        data: {
          amountCents: input.amountCents,
          appointmentId: input.appointmentId ?? null,
          cashRegisterSessionId: session.id,
          createdByUserId: user.id,
          description: input.description,
          paymentMethod: input.paymentMethod
            ? (input.paymentMethod.toUpperCase() as PaymentMethod)
            : null,
          productId: productSale?.id ?? null,
          productQuantity: productSale?.quantity ?? null,
          professionalMembershipId: input.professionalMembershipId ?? null,
          serviceId: input.serviceId ?? null,
          type: input.type.toUpperCase() as CashMovementType,
        },
      });
      if (
        productSale &&
        productSale.resultingQuantity !== null &&
        currentScope.organizationId &&
        session.locationId
      ) {
        await transaction.stockMovement.create({
          data: {
            cashMovementId: created.id,
            createdByUserId: user.id,
            direction: StockDirection.OUT,
            locationId: session.locationId,
            notes: `Venta: ${productSale.name}`,
            organizationId: currentScope.organizationId,
            productId: productSale.id,
            quantity: productSale.quantity,
            resultingQuantity: productSale.resultingQuantity,
            type: StockMovementType.SALE,
            unitCostCents: productSale.costCents,
          },
        });
      }
      if (input.appointmentId) {
        await reconcileAppointmentCommissions(transaction, input.appointmentId);
      } else if (
        commissionableService &&
        input.professionalMembershipId &&
        currentScope.organizationId &&
        session.locationId
      ) {
        const commission = await createManualSaleCommission(transaction, {
          amountCents: created.amountCents,
          cashMovementId: created.id,
          locationId: session.locationId,
          occurredAt: created.createdAt,
          organizationId: currentScope.organizationId,
          professionalMembershipId: input.professionalMembershipId,
          serviceId: commissionableService.id,
          serviceName: commissionableService.name,
        });
        if (!commission)
          throw new ApiError(
            409,
            'COMMISSION_RULE_NOT_FOUND',
            'El profesional no tiene una regla de comisión vigente.',
          );
      }
      return created;
    });
    await recordAudit(
      database,
      currentScope,
      user.id,
      'cash_movement',
      movement.id,
      'cash_movement.created',
      {
        amountCents: movement.amountCents,
        appointmentId: movement.appointmentId,
        cashRegisterSessionId: session.id,
        paymentMethod: movement.paymentMethod,
        productId: movement.productId,
        productQuantity: movement.productQuantity,
        professionalMembershipId: movement.professionalMembershipId,
        serviceId: movement.serviceId,
        type: movement.type,
      },
    );
    return reply.code(201).send({ movement: publicMovement(movement) });
  });

  app.post('/v1/cash-register/close', async (request) => {
    const { user } = await authenticate(database, request);
    const input = closeCashRegisterSchema.parse(request.body);
    const currentScope = await scope(database, user.id);
    const session = await database.cashRegisterSession.findFirst({
      include: { movements: true },
      where: {
        status: CashRegisterStatus.OPEN,
        ...(currentScope.organizationId
          ? { organizationId: currentScope.organizationId }
          : { ownerUserId: user.id }),
      },
    });
    if (!session)
      throw new ApiError(
        409,
        'CASH_REGISTER_CLOSED',
        'No hay una caja abierta.',
      );
    const expected = totalsFor(
      session.openingAmountCents,
      session.movements,
    ).cash;
    const closed = await database.cashRegisterSession.update({
      data: {
        closedAt: new Date(),
        closedByUserId: user.id,
        closingAmountCents: input.closingAmountCents,
        closingNote: input.note ?? null,
        differenceCents: input.closingAmountCents - expected,
        expectedAmountCents: expected,
        status: CashRegisterStatus.CLOSED,
      },
      where: { id: session.id },
    });
    await recordAudit(
      database,
      currentScope,
      user.id,
      'cash_register_session',
      closed.id,
      'cash_register.closed',
      {
        closingAmountCents: input.closingAmountCents,
        differenceCents: closed.differenceCents,
        expectedAmountCents: expected,
        note: input.note ?? null,
      },
    );
    return {
      session: {
        ...publicSession(closed),
        closingAmountCents: closed.closingAmountCents,
        differenceCents: closed.differenceCents,
        expectedAmountCents: closed.expectedAmountCents,
      },
    };
  });
}
