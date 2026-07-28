import {
  CashRegisterStatus,
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
}
