import { MembershipStatus, type DatabaseClient } from '@barber-saas/database';
import {
  hasPermission,
  type MembershipRole as PermissionRole,
  type OrganizationPermission,
} from '@barber-saas/permissions';
import { replaceBusinessScheduleSchema } from '@barber-saas/validation';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { ApiError } from './errors';

interface AuthenticatedIdentity {
  readonly user: {
    readonly email: string;
    readonly fullName: string;
    readonly id: string;
  };
}

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<AuthenticatedIdentity>;

function permissionRole(role: string): PermissionRole {
  return role.toLowerCase() as PermissionRole;
}

async function requireMembership(
  database: DatabaseClient,
  userId: string,
  permission: OrganizationPermission,
) {
  const membership = await database.membership.findFirst({
    include: { memberLocations: true },
    where: { status: MembershipStatus.ACTIVE, userId },
  });
  if (!membership) {
    throw new ApiError(
      403,
      'ORGANIZATION_REQUIRED',
      'Tu cuenta no pertenece a una barbería activa.',
    );
  }
  if (!hasPermission(permissionRole(membership.role), permission)) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'No tienes permiso para realizar esta acción.',
    );
  }
  return membership;
}

async function requireLocation(
  database: DatabaseClient,
  organizationId: string,
  locationId: string,
) {
  const location = await database.location.findFirst({
    where: { id: locationId, isActive: true, organizationId },
  });
  if (!location) {
    throw new ApiError(404, 'LOCATION_NOT_FOUND', 'La sucursal no existe.');
  }
  return location;
}

function minuteForTime(value: string | null | undefined, fallback: number) {
  const match = /^(\d{2}):(\d{2})$/u.exec(value ?? '');
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return fallback;
  return hours * 60 + minutes;
}

async function initializeSchedule(
  database: DatabaseClient,
  input: {
    locationId: string;
    organizationId: string;
  },
) {
  const owner = await database.membership.findFirst({
    include: { user: { include: { registrationProfile: true } } },
    orderBy: { createdAt: 'asc' },
    where: {
      organizationId: input.organizationId,
      role: 'OWNER',
    },
  });
  const startMinute = minuteForTime(
    owner?.user.registrationProfile?.openingTime,
    540,
  );
  const endMinuteCandidate = minuteForTime(
    owner?.user.registrationProfile?.closingTime,
    1080,
  );
  const endMinute =
    endMinuteCandidate > startMinute ? endMinuteCandidate : startMinute + 60;

  await database.businessWeeklySchedule.createMany({
    data: Array.from({ length: 7 }, (_, weekday) => ({
      endMinute,
      isOpen: true,
      locationId: input.locationId,
      organizationId: input.organizationId,
      startMinute,
      weekday,
    })),
    skipDuplicates: true,
  });
}

async function readSchedule(
  database: DatabaseClient,
  input: {
    locationId: string;
    organizationId: string;
  },
) {
  let days = await database.businessWeeklySchedule.findMany({
    orderBy: { weekday: 'asc' },
    where: {
      locationId: input.locationId,
      organizationId: input.organizationId,
    },
  });
  if (days.length !== 7) {
    await initializeSchedule(database, input);
    days = await database.businessWeeklySchedule.findMany({
      orderBy: { weekday: 'asc' },
      where: {
        locationId: input.locationId,
        organizationId: input.organizationId,
      },
    });
  }
  return days;
}

function publicSchedule(
  days: ReadonlyArray<{
    endMinute: number;
    isOpen: boolean;
    startMinute: number;
    weekday: number;
  }>,
  locationId: string,
) {
  return {
    days: days.map(({ endMinute, isOpen, startMinute, weekday }) => ({
      endMinute,
      isOpen,
      startMinute,
      weekday,
    })),
    locationId,
  };
}

export function registerBusinessScheduleRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
) {
  app.get('/v1/business-schedule', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(database, user.id, 'schedule.read');
    const locationId = current.memberLocations[0]?.locationId;
    if (!locationId) {
      throw new ApiError(
        404,
        'LOCATION_NOT_FOUND',
        'No encontramos una sucursal activa para tu cuenta.',
      );
    }
    await requireLocation(database, current.organizationId, locationId);
    const days = await readSchedule(database, {
      locationId,
      organizationId: current.organizationId,
    });
    return publicSchedule(days, locationId);
  });

  app.put('/v1/business-schedule', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireMembership(
      database,
      user.id,
      'schedule.manage',
    );
    const input = replaceBusinessScheduleSchema.parse(request.body);
    await requireLocation(database, current.organizationId, input.locationId);
    const before = await readSchedule(database, {
      locationId: input.locationId,
      organizationId: current.organizationId,
    });

    await database.$transaction(async (transaction) => {
      for (const day of input.days) {
        await transaction.businessWeeklySchedule.upsert({
          create: {
            ...day,
            locationId: input.locationId,
            organizationId: current.organizationId,
          },
          update: {
            endMinute: day.endMinute,
            isOpen: day.isOpen,
            startMinute: day.startMinute,
          },
          where: {
            locationId_weekday: {
              locationId: input.locationId,
              weekday: day.weekday,
            },
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'business_weekly_schedule.replaced',
          actorUserId: user.id,
          afterData: input.days,
          beforeData: before.map(
            ({ endMinute, isOpen, startMinute, weekday }) => ({
              endMinute,
              isOpen,
              startMinute,
              weekday,
            }),
          ),
          entityId: input.locationId,
          entityType: 'business_weekly_schedule',
          locationId: input.locationId,
          organizationId: current.organizationId,
        },
      });
    });

    const days = await readSchedule(database, {
      locationId: input.locationId,
      organizationId: current.organizationId,
    });
    return publicSchedule(days, input.locationId);
  });
}
