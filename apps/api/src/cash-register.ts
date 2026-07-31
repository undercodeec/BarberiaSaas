import {
  CashRegisterStatus,
  CashMovementType,
  PaymentMethod,
  AppointmentPaymentStatus,
  MembershipStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { ApiError } from './errors';

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
  type: z.enum(['sale', 'expense', 'withdrawal']),
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
  id: string;
  openedAt: Date;
  openingAmountCents: number;
  responsibleName: string;
  status: CashRegisterStatus;
}) {
  return {
    id: session.id,
    openedAt: session.openedAt.toISOString(),
    openingAmountCents: session.openingAmountCents,
    responsibleName: session.responsibleName,
    status: session.status.toLowerCase(),
  };
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
    const totals = session.movements.reduce(
      (value, movement) => ({
        card:
          value.card +
          (movement.type === CashMovementType.SALE &&
          movement.paymentMethod === PaymentMethod.CARD
            ? movement.amountCents
            : 0),
        cash:
          value.cash +
          (movement.type === CashMovementType.SALE &&
          movement.paymentMethod === PaymentMethod.CASH
            ? movement.amountCents
            : 0) -
          (movement.type !== CashMovementType.SALE ? movement.amountCents : 0),
        expenses:
          value.expenses +
          (movement.type === CashMovementType.EXPENSE
            ? movement.amountCents
            : 0),
        sales:
          value.sales +
          (movement.type === CashMovementType.SALE ? movement.amountCents : 0),
        withdrawals:
          value.withdrawals +
          (movement.type === CashMovementType.WITHDRAWAL
            ? movement.amountCents
            : 0),
      }),
      {
        card: 0,
        cash: session.openingAmountCents,
        expenses: 0,
        sales: 0,
        withdrawals: 0,
      },
    );
    return {
      session: publicSession(session),
      movements: session.movements.map((movement) => ({
        ...movement,
        createdAt: movement.createdAt.toISOString(),
        paymentMethod: movement.paymentMethod?.toLowerCase() ?? null,
        type: movement.type.toLowerCase(),
      })),
      totals: { ...totals, expectedCash: totals.cash },
    };
  });

  app.post('/v1/cash-register/movements', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = createMovementSchema.parse(request.body);
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
    if (input.appointmentId) {
      const appointment = await database.appointment.findFirst({
        where: {
          id: input.appointmentId,
          ...(currentScope.organizationId
            ? { organizationId: currentScope.organizationId }
            : {}),
        },
      });
      if (!appointment)
        throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'La cita no existe.');
      await database.appointment.update({
        data: { paymentStatus: AppointmentPaymentStatus.PAID },
        where: { id: appointment.id },
      });
    }
    const movement = await database.cashMovement.create({
      data: {
        amountCents: input.amountCents,
        appointmentId: input.appointmentId ?? null,
        cashRegisterSessionId: session.id,
        createdByUserId: user.id,
        description: input.description,
        paymentMethod: input.paymentMethod
          ? (input.paymentMethod.toUpperCase() as PaymentMethod)
          : null,
        type: input.type.toUpperCase() as CashMovementType,
      },
    });
    return reply
      .code(201)
      .send({
        movement: {
          ...movement,
          createdAt: movement.createdAt.toISOString(),
          paymentMethod: movement.paymentMethod?.toLowerCase() ?? null,
          type: movement.type.toLowerCase(),
        },
      });
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
    const expected = session.movements.reduce(
      (total, movement) =>
        total +
        (movement.type === CashMovementType.SALE &&
        movement.paymentMethod === PaymentMethod.CASH
          ? movement.amountCents
          : 0) -
        (movement.type !== CashMovementType.SALE ? movement.amountCents : 0),
      session.openingAmountCents,
    );
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
