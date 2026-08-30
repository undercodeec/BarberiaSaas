import {
  AppointmentEventType,
  AppointmentSource,
  AppointmentStatus,
  MembershipRole,
  MembershipStatus,
  type AppointmentPaymentStatus,
  type DatabaseClient,
  type Prisma,
} from '@barber-saas/database';
import {
  hasPermission,
  type MembershipRole as PermissionRole,
  type OrganizationPermission,
} from '@barber-saas/permissions';
import {
  appointmentEventsQuerySchema,
  availabilityQuerySchema,
  cancelAppointmentSchema,
  createAppointmentSchema,
  dailyAppointmentsQuerySchema,
  rescheduleAppointmentSchema,
  updateAppointmentStatusSchema,
} from '@barber-saas/validation';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { reconcileAppointmentCommissions } from './commissions';
import { ApiError } from './errors';
import {
  assertCanCreateBooking,
  assertCanUseProfessional,
  recordBookingMilestone,
} from './subscription-policy';
import { clientScope, maskClientPhone } from './clients';
import type { AppointmentNotifier } from './notifications';
import type { PublicBookingMailer } from './public-booking';
import { createOpaqueToken, hashOpaqueToken } from './security';

interface AuthenticatedIdentity {
  readonly user: { readonly email: string; readonly id: string };
}

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<AuthenticatedIdentity>;

interface ServiceSnapshot {
  readonly durationMinutes: number;
  readonly priceCents: number;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly sortOrder: number;
}

function permissionRole(role: MembershipRole): PermissionRole {
  return role.toLowerCase() as PermissionRole;
}

async function requireAgendaMembership(
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

function assertProfessionalScope(
  current: { id: string; role: MembershipRole },
  professionalMembershipId: string,
) {
  if (
    current.role === MembershipRole.BARBER &&
    current.id !== professionalMembershipId
  ) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Solo puedes consultar y gestionar tu propia agenda.',
    );
  }
}

function assertLocationScope(
  current: {
    readonly memberLocations: ReadonlyArray<{ readonly locationId: string }>;
    readonly role: MembershipRole;
  },
  locationId: string,
) {
  if (
    current.role !== MembershipRole.OWNER &&
    current.role !== MembershipRole.MANAGER &&
    !current.memberLocations.some(
      (location) => location.locationId === locationId,
    )
  ) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Solo puedes consultar y gestionar tus sucursales asignadas.',
    );
  }
}

async function findOrCreateCompletedPublicBookingClient(
  transaction: Prisma.TransactionClient,
  appointment: {
    readonly clientEmail: string | null;
    readonly clientName: string;
    readonly clientPhone: string | null;
    readonly organizationId: string;
  },
) {
  if (!appointment.clientPhone) return null;
  const normalizedEmail = appointment.clientEmail?.trim().toLowerCase() ?? null;
  await transaction.$queryRaw`WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${appointment.organizationId}))) SELECT 1 AS locked FROM lock`;
  const clientByPhone = await transaction.client.findFirst({
    orderBy: { createdAt: 'asc' },
    where: {
      deletedAt: null,
      organizationId: appointment.organizationId,
      phone: appointment.clientPhone,
    },
  });
  const knownClient =
    clientByPhone ??
    (normalizedEmail
      ? await transaction.client.findFirst({
          orderBy: { createdAt: 'asc' },
          where: {
            deletedAt: null,
            email: { equals: normalizedEmail, mode: 'insensitive' },
            organizationId: appointment.organizationId,
          },
        })
      : null);
  return (
    knownClient ??
    transaction.client.create({
      data: {
        email: normalizedEmail,
        fullName: appointment.clientName,
        organizationId: appointment.organizationId,
        phone: appointment.clientPhone,
        source: AppointmentSource.PUBLIC_BOOKING,
      },
    })
  );
}

function partsInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  return {
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    month: part('month'),
    year: part('year'),
  };
}

export function zonedDateTimeToUtc(
  localDate: string,
  minuteOfDay: number,
  timeZone: string,
): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  if (!year || !month || !day) {
    throw new ApiError(400, 'INVALID_DATE', 'La fecha no es válida.');
  }
  const extraDays = Math.floor(minuteOfDay / 1440);
  const normalizedMinute = minuteOfDay % 1440;
  const target = Date.UTC(
    year,
    month - 1,
    day + extraDays,
    Math.floor(normalizedMinute / 60),
    normalizedMinute % 60,
  );
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const represented = partsInTimeZone(new Date(candidate), timeZone);
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
    );
    candidate -= representedUtc - target;
  }
  return new Date(candidate);
}

function localDateFor(value: Date, timeZone: string): string {
  const parts = partsInTimeZone(value, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function weekdayFor(localDate: string): number {
  return new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
}

function overlaps(
  startsAt: Date,
  endsAt: Date,
  blockedStartsAt: Date,
  blockedEndsAt: Date,
): boolean {
  return startsAt < blockedEndsAt && endsAt > blockedStartsAt;
}

export async function loadBookingContext(
  database: DatabaseClient,
  organizationId: string,
  locationId: string,
  professionalMembershipId: string,
  serviceIds: readonly string[],
) {
  const [location, professional, assignments] = await Promise.all([
    database.location.findFirst({
      where: { id: locationId, isActive: true, organizationId },
    }),
    database.membership.findFirst({
      where: {
        id: professionalMembershipId,
        organizationId,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.INVITED] },
      },
    }),
    database.professionalService.findMany({
      include: { service: true },
      where: {
        locationId,
        membershipId: professionalMembershipId,
        serviceId: { in: [...serviceIds] },
        service: { isActive: true, organizationId },
      },
    }),
  ]);
  if (!location) {
    throw new ApiError(404, 'LOCATION_NOT_FOUND', 'La sucursal no existe.');
  }
  if (!professional) {
    throw new ApiError(
      404,
      'PROFESSIONAL_NOT_FOUND',
      'El profesional no existe o no está activo.',
    );
  }
  const memberLocation = await database.memberLocation.findUnique({
    where: {
      membershipId_locationId: {
        locationId,
        membershipId: professionalMembershipId,
      },
    },
  });
  if (!memberLocation) {
    throw new ApiError(
      400,
      'PROFESSIONAL_LOCATION_REQUIRED',
      'El profesional no pertenece a la sucursal.',
    );
  }
  if (assignments.length !== new Set(serviceIds).size) {
    throw new ApiError(
      400,
      'SERVICE_NOT_ASSIGNED',
      'Todos los servicios deben estar asignados al profesional.',
    );
  }
  const assignmentByService = new Map(
    assignments.map((assignment) => [assignment.serviceId, assignment]),
  );
  const snapshots: ServiceSnapshot[] = serviceIds.map((serviceId, index) => {
    const assignment = assignmentByService.get(serviceId);
    if (!assignment) {
      throw new ApiError(
        400,
        'SERVICE_NOT_ASSIGNED',
        'El servicio no está asignado al profesional.',
      );
    }
    return {
      durationMinutes:
        assignment.customDurationMinutes ?? assignment.service.durationMinutes,
      priceCents: assignment.customPriceCents ?? assignment.service.priceCents,
      serviceId,
      serviceName: assignment.service.name,
      sortOrder: index,
    };
  });
  return { location, professional, snapshots };
}

export async function assertBookable(
  database: DatabaseClient | Prisma.TransactionClient,
  input: {
    endsAt: Date;
    ignoreAppointmentId?: string;
    locationId: string;
    professionalMembershipId: string;
    startsAt: Date;
    timeZone: string;
  },
) {
  const localDate = localDateFor(input.startsAt, input.timeZone);
  if (
    localDateFor(new Date(input.endsAt.getTime() - 1), input.timeZone) !==
    localDate
  ) {
    throw new ApiError(
      400,
      'OUTSIDE_WORKING_HOURS',
      'La cita debe comenzar y terminar dentro de la misma jornada.',
    );
  }
  const weekday = weekdayFor(localDate);
  const businessSchedule = await database.businessWeeklySchedule.findUnique({
    where: {
      locationId_weekday: {
        locationId: input.locationId,
        weekday,
      },
    },
  });
  const businessStart = businessSchedule
    ? zonedDateTimeToUtc(
        localDate,
        businessSchedule.startMinute,
        input.timeZone,
      )
    : null;
  const businessEnd = businessSchedule
    ? zonedDateTimeToUtc(localDate, businessSchedule.endMinute, input.timeZone)
    : null;
  if (
    !businessSchedule?.isOpen ||
    !businessStart ||
    !businessEnd ||
    input.startsAt < businessStart ||
    input.endsAt > businessEnd
  ) {
    throw new ApiError(
      400,
      'OUTSIDE_BUSINESS_HOURS',
      'El horario seleccionado está fuera del horario del negocio.',
    );
  }
  const appointment = await database.appointment.findFirst({
    where: {
      endsAt: { gt: input.startsAt },
      ...(input.ignoreAppointmentId
        ? { id: { not: input.ignoreAppointmentId } }
        : {}),
      professionalMembershipId: input.professionalMembershipId,
      reservesSlot: true,
      startsAt: { lt: input.endsAt },
    },
  });
  if (appointment) {
    /* Legacy professional schedule and block validation intentionally disabled.
    const scheduleStart = zonedDateTimeToUtc(
      localDate,
      schedule.startMinute,
      input.timeZone,
    );
    const scheduleEnd = zonedDateTimeToUtc(
      localDate,
      schedule.endMinute,
      input.timeZone,
    );
    return input.startsAt >= scheduleStart && input.endsAt <= scheduleEnd;
  });
  if (!insideWorkingHours) {
    throw new ApiError(
      400,
      'OUTSIDE_WORKING_HOURS',
      'El horario seleccionado está fuera de la jornada del profesional.',
    );
  }
  const [block, appointment] = await Promise.all([
    database.scheduleBlock.findFirst({
      where: {
        endsAt: { gt: input.startsAt },
        locationId: input.locationId,
        membershipId: input.professionalMembershipId,
        startsAt: { lt: input.endsAt },
      },
    }),
    database.appointment.findFirst({
      where: {
        endsAt: { gt: input.startsAt },
        ...(input.ignoreAppointmentId
          ? { id: { not: input.ignoreAppointmentId } }
          : {}),
        professionalMembershipId: input.professionalMembershipId,
        reservesSlot: true,
        startsAt: { lt: input.endsAt },
      },
    }),
  ]);
  if (block) {
    throw new ApiError(
      409,
      'SCHEDULE_BLOCKED',
      'El profesional tiene un bloqueo en ese horario.',
    );
  }
  */
    throw new ApiError(
      409,
      'APPOINTMENT_CONFLICT',
      'Ese horario acaba de ser ocupado. Elige otro disponible.',
    );
  }
}

function errorDetails(
  error: unknown,
  seen = new Set<object>(),
  depth = 0,
): string {
  if (error === null || error === undefined) return '';
  if (typeof error !== 'object') return String(error);
  if (seen.has(error) || depth > 4) return '';
  seen.add(error);
  const values = Object.getOwnPropertyNames(error).map((property) => {
    try {
      return errorDetails(
        (error as Record<string, unknown>)[property],
        seen,
        depth + 1,
      );
    } catch {
      return '';
    }
  });
  return [String(error), ...values].join(' ');
}

export function isAppointmentConflict(error: unknown): boolean {
  const details = errorDetails(error).toLowerCase();
  return (
    details.includes('appointments_no_professional_overlap') ||
    details.includes('23p01') ||
    details.includes('exclusion constraint') ||
    details.includes('write conflict') ||
    details.includes('p2034')
  );
}

export function publicAppointment(
  appointment: {
    clientId?: string | null;
    clientEmail: string | null;
    clientName: string;
    clientPhone: string | null;
    endsAt: Date;
    id: string;
    locationId: string;
    notes: string | null;
    professionalMembershipId: string;
    paymentStatus: AppointmentPaymentStatus;
    startsAt: Date;
    status: AppointmentStatus;
    source?: AppointmentSource;
    services?: ReadonlyArray<{
      durationMinutes: number;
      id: string;
      priceCents: number;
      serviceId: string;
      serviceName: string;
    }>;
  },
  exposeClientContact = false,
) {
  return {
    clientEmail: exposeClientContact ? appointment.clientEmail : null,
    clientId: appointment.clientId ?? null,
    clientName: appointment.clientName,
    clientPhone: exposeClientContact
      ? appointment.clientPhone
      : maskClientPhone(appointment.clientPhone),
    endsAt: appointment.endsAt.toISOString(),
    id: appointment.id,
    locationId: appointment.locationId,
    notes: appointment.notes,
    startsAt: appointment.startsAt.toISOString(),
    paymentStatus: appointment.paymentStatus.toLowerCase(),
    professionalMembershipId: appointment.professionalMembershipId,
    services: appointment.services ?? [],
    source: appointment.source?.toLowerCase() ?? 'manual',
    status: appointment.status.toLowerCase(),
  };
}

function canReadFullClientContact(role: MembershipRole): boolean {
  return hasPermission(permissionRole(role), 'client.contact.read_full');
}

export function registerAgendaRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
  publicBookingMailer: PublicBookingMailer | null = null,
  publicBaseUrl = 'https://navacloud.app',
  notifier: AppointmentNotifier | null = null,
) {
  app.get('/v1/availability', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireAgendaMembership(
      database,
      user.id,
      'appointment.read',
    );
    const input = availabilityQuerySchema.parse(request.query);
    assertLocationScope(current, input.locationId);
    assertProfessionalScope(current, input.membershipId);
    const context = await loadBookingContext(
      database,
      current.organizationId,
      input.locationId,
      input.membershipId,
      input.serviceIds,
    );
    const durationMinutes = context.snapshots.reduce(
      (total, service) => total + service.durationMinutes,
      0,
    );
    const dayStart = zonedDateTimeToUtc(
      input.date,
      0,
      context.location.timezone,
    );
    const dayEnd = zonedDateTimeToUtc(
      input.date,
      1440,
      context.location.timezone,
    );
    const weekday = weekdayFor(input.date);
    const [schedules, businessSchedule, appointments] = await Promise.all([
      database.businessWeeklySchedule.findMany({
        orderBy: { startMinute: 'asc' },
        where: {
          locationId: input.locationId,
          weekday,
        },
      }),
      database.businessWeeklySchedule.findUnique({
        where: {
          locationId_weekday: {
            locationId: input.locationId,
            weekday,
          },
        },
      }),
      database.appointment.findMany({
        where: {
          endsAt: { gt: dayStart },
          professionalMembershipId: input.membershipId,
          reservesSlot: true,
          startsAt: { lt: dayEnd },
        },
      }),
    ]);
    if (!businessSchedule?.isOpen) {
      return { durationMinutes, slots: [], unavailableSlots: [] };
    }
    const occupiedRanges = [
      ...appointments.map((appointment) => ({
        endsAt: appointment.endsAt,
        reason: 'occupied' as const,
        startsAt: appointment.startsAt,
      })),
    ];
    const slots: { endsAt: string; startsAt: string }[] = [];
    const unavailableSlots: Array<{
      endsAt: string;
      reason: 'blocked' | 'occupied';
      startsAt: string;
    }> = [];
    for (const schedule of schedules) {
      const effectiveStartMinute = Math.max(
        schedule.startMinute,
        businessSchedule.startMinute,
      );
      const effectiveEndMinute = Math.min(
        schedule.endMinute,
        businessSchedule.endMinute,
      );
      const scheduleEnd = zonedDateTimeToUtc(
        input.date,
        effectiveEndMinute,
        context.location.timezone,
      );
      for (
        let minute = effectiveStartMinute;
        minute + durationMinutes <= effectiveEndMinute;
        minute += 5
      ) {
        const startsAt = zonedDateTimeToUtc(
          input.date,
          minute,
          context.location.timezone,
        );
        const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
        if (
          endsAt <= scheduleEnd &&
          !occupiedRanges.some((range) =>
            overlaps(startsAt, endsAt, range.startsAt, range.endsAt),
          )
        ) {
          slots.push({
            endsAt: endsAt.toISOString(),
            startsAt: startsAt.toISOString(),
          });
        } else if (endsAt <= scheduleEnd) {
          const conflictingRange = occupiedRanges.find((range) =>
            overlaps(startsAt, endsAt, range.startsAt, range.endsAt),
          );
          if (conflictingRange) {
            unavailableSlots.push({
              endsAt: endsAt.toISOString(),
              reason: conflictingRange.reason,
              startsAt: startsAt.toISOString(),
            });
          }
        }
      }
    }
    return { durationMinutes, slots, unavailableSlots };
  });

  app.get('/v1/appointments', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireAgendaMembership(
      database,
      user.id,
      'appointment.read',
    );
    const input = dailyAppointmentsQuerySchema.parse(request.query);
    assertLocationScope(current, input.locationId);
    const location = await database.location.findFirst({
      where: {
        id: input.locationId,
        isActive: true,
        organizationId: current.organizationId,
      },
    });
    if (!location) {
      throw new ApiError(404, 'LOCATION_NOT_FOUND', 'La sucursal no existe.');
    }
    const targetMembershipId =
      current.role === MembershipRole.BARBER ? current.id : input.membershipId;
    const fromDate = input.date ?? input.from;
    const toDate = input.date ?? input.to;
    if (!fromDate || !toDate) {
      throw new ApiError(400, 'INVALID_DATE_RANGE', 'El rango no es válido.');
    }
    const dayStart = zonedDateTimeToUtc(fromDate, 0, location.timezone);
    const dayEnd = zonedDateTimeToUtc(toDate, 1440, location.timezone);
    const appointments = await database.appointment.findMany({
      include: { services: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { startsAt: 'asc' },
      where: {
        locationId: input.locationId,
        organizationId: current.organizationId,
        status: {
          notIn: [
            AppointmentStatus.PENDING_VERIFICATION,
            AppointmentStatus.EXPIRED,
          ],
        },
        startsAt: { gte: dayStart, lt: dayEnd },
        ...(targetMembershipId
          ? { professionalMembershipId: targetMembershipId }
          : {}),
      },
    });
    return {
      appointments: appointments.map((appointment) =>
        publicAppointment(appointment, canReadFullClientContact(current.role)),
      ),
    };
  });

  app.post('/v1/appointments', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireAgendaMembership(
      database,
      user.id,
      'appointment.manage',
    );
    const input = createAppointmentSchema.parse(request.body);
    assertLocationScope(current, input.locationId);
    assertProfessionalScope(current, input.professionalMembershipId);
    const selectedClient = input.clientId
      ? await database.client.findFirst({
          where: {
            id: input.clientId,
            ...clientScope({
              locationIds: current.memberLocations.map(
                ({ locationId }) => locationId,
              ),
              membershipId: current.id,
              organizationId: current.organizationId,
              role: current.role,
              userId: user.id,
            }),
          },
        })
      : null;
    if (input.clientId && !selectedClient) {
      throw new ApiError(
        404,
        'CLIENT_NOT_FOUND',
        'El cliente seleccionado no existe.',
      );
    }
    const clientName = selectedClient
      ? [selectedClient.fullName, selectedClient.lastName]
          .filter(Boolean)
          .join(' ')
      : input.clientName!;
    const clientEmail = selectedClient?.email ?? input.clientEmail ?? null;
    const clientPhone = selectedClient?.phone ?? input.clientPhone ?? null;
    const context = await loadBookingContext(
      database,
      current.organizationId,
      input.locationId,
      input.professionalMembershipId,
      input.serviceIds,
    );
    const startsAt = new Date(input.startsAt);
    const durationMinutes = context.snapshots.reduce(
      (total, service) => total + service.durationMinutes,
      0,
    );
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    await assertBookable(database, {
      endsAt,
      locationId: input.locationId,
      professionalMembershipId: input.professionalMembershipId,
      startsAt,
      timeZone: context.location.timezone,
    });
    try {
      const appointment = await database.$transaction(async (transaction) => {
        await transaction.$queryRaw`WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${input.professionalMembershipId}))) SELECT 1 AS locked FROM lock`;
        await transaction.$queryRaw`WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${current.organizationId}))) SELECT 1 AS locked FROM lock`;
        await assertCanCreateBooking(transaction, current.organizationId);
        await assertCanUseProfessional(
          transaction,
          current.organizationId,
          input.professionalMembershipId,
        );
        await assertBookable(transaction, {
          endsAt,
          locationId: input.locationId,
          professionalMembershipId: input.professionalMembershipId,
          startsAt,
          timeZone: context.location.timezone,
        });
        const created = await transaction.appointment.create({
          data: {
            clientEmail,
            clientId: selectedClient?.id ?? null,
            clientName,
            clientPhone,
            createdByUserId: user.id,
            endsAt,
            locationId: input.locationId,
            notes: input.notes ?? null,
            organizationId: current.organizationId,
            professionalMembershipId: input.professionalMembershipId,
            source: selectedClient
              ? AppointmentSource.MANUAL
              : AppointmentSource.WALK_IN,
            services: {
              create: context.snapshots.map((service) => ({
                durationMinutes: service.durationMinutes,
                priceCents: service.priceCents,
                serviceId: service.serviceId,
                serviceName: service.serviceName,
                sortOrder: service.sortOrder,
              })),
            },
            startsAt,
            updatedByUserId: user.id,
          },
          include: { services: { orderBy: { sortOrder: 'asc' } } },
        });
        await transaction.appointmentEvent.create({
          data: {
            actorUserId: user.id,
            appointmentId: created.id,
            locationId: created.locationId,
            organizationId: created.organizationId,
            payload: {
              endsAt: endsAt.toISOString(),
              startsAt: startsAt.toISOString(),
            },
            type: AppointmentEventType.CREATED,
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'appointment.created',
            actorUserId: user.id,
            afterData: {
              durationMinutes,
              endsAt: endsAt.toISOString(),
              startsAt: startsAt.toISOString(),
            },
            entityId: created.id,
            entityType: 'appointment',
            locationId: created.locationId,
            organizationId: created.organizationId,
          },
        });
        await recordBookingMilestone(transaction, current.organizationId);
        return created;
      });
      await notifier?.notify(appointment.id, 'created', user.id);
      return reply.code(201).send({
        appointment: publicAppointment(
          appointment,
          canReadFullClientContact(current.role),
        ),
      });
    } catch (error) {
      if (isAppointmentConflict(error)) {
        throw new ApiError(
          409,
          'APPOINTMENT_CONFLICT',
          'Ese horario acaba de ser ocupado. Elige otro disponible.',
        );
      }
      throw error;
    }
  });

  app.patch('/v1/appointments/:appointmentId/reschedule', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireAgendaMembership(
      database,
      user.id,
      'appointment.manage',
    );
    const { appointmentId } = request.params as { appointmentId: string };
    const input = rescheduleAppointmentSchema.parse(request.body);
    const existing = await database.appointment.findFirst({
      include: { services: true, location: true },
      where: { id: appointmentId, organizationId: current.organizationId },
    });
    if (!existing) {
      throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'La cita no existe.');
    }
    assertLocationScope(current, existing.locationId);
    assertProfessionalScope(current, existing.professionalMembershipId);
    if (!existing.reservesSlot) {
      throw new ApiError(
        409,
        'APPOINTMENT_INACTIVE',
        'La cita ya no ocupa un horario.',
      );
    }
    const startsAt = new Date(input.startsAt);
    const durationMinutes = existing.services.reduce(
      (total, service) => total + service.durationMinutes,
      0,
    );
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    await assertBookable(database, {
      endsAt,
      ignoreAppointmentId: existing.id,
      locationId: existing.locationId,
      professionalMembershipId: existing.professionalMembershipId,
      startsAt,
      timeZone: existing.location.timezone,
    });
    try {
      const updated = await database.$transaction(async (transaction) => {
        await transaction.$queryRaw`WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${existing.professionalMembershipId}))) SELECT 1 AS locked FROM lock`;
        await assertCanUseProfessional(
          transaction,
          current.organizationId,
          existing.professionalMembershipId,
        );
        await assertBookable(transaction, {
          endsAt,
          ignoreAppointmentId: existing.id,
          locationId: existing.locationId,
          professionalMembershipId: existing.professionalMembershipId,
          startsAt,
          timeZone: existing.location.timezone,
        });
        const appointment = await transaction.appointment.update({
          data: { endsAt, startsAt, updatedByUserId: user.id },
          include: { services: { orderBy: { sortOrder: 'asc' } } },
          where: { id: existing.id },
        });
        await transaction.appointmentEvent.create({
          data: {
            actorUserId: user.id,
            appointmentId: appointment.id,
            locationId: appointment.locationId,
            organizationId: appointment.organizationId,
            payload: {
              endsAt: endsAt.toISOString(),
              previousStartsAt: existing.startsAt.toISOString(),
              startsAt: startsAt.toISOString(),
            },
            type: AppointmentEventType.RESCHEDULED,
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'appointment.rescheduled',
            actorUserId: user.id,
            afterData: {
              endsAt: endsAt.toISOString(),
              startsAt: startsAt.toISOString(),
            },
            beforeData: {
              endsAt: existing.endsAt.toISOString(),
              startsAt: existing.startsAt.toISOString(),
            },
            entityId: appointment.id,
            entityType: 'appointment',
            locationId: appointment.locationId,
            organizationId: appointment.organizationId,
          },
        });
        return appointment;
      });
      await notifier?.notify(updated.id, 'rescheduled', user.id);
      return {
        appointment: publicAppointment(
          updated,
          canReadFullClientContact(current.role),
        ),
      };
    } catch (error) {
      if (isAppointmentConflict(error)) {
        throw new ApiError(
          409,
          'APPOINTMENT_CONFLICT',
          'Ese horario acaba de ser ocupado. Elige otro disponible.',
        );
      }
      throw error;
    }
  });

  app.post('/v1/appointments/:appointmentId/cancel', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireAgendaMembership(
      database,
      user.id,
      'appointment.manage',
    );
    const { appointmentId } = request.params as { appointmentId: string };
    const input = cancelAppointmentSchema.parse(request.body);
    const existing = await database.appointment.findFirst({
      where: { id: appointmentId, organizationId: current.organizationId },
    });
    if (!existing)
      throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'La cita no existe.');
    assertLocationScope(current, existing.locationId);
    assertProfessionalScope(current, existing.professionalMembershipId);
    const updated = await database.$transaction(async (transaction) => {
      await assertCanUseProfessional(
        transaction,
        current.organizationId,
        existing.professionalMembershipId,
      );
      const appointment = await transaction.appointment.update({
        data: {
          cancellationReason: input.reason,
          cancelledAt: new Date(),
          reservesSlot: false,
          status: AppointmentStatus.CANCELLED,
          updatedByUserId: user.id,
        },
        include: { services: { orderBy: { sortOrder: 'asc' } } },
        where: { id: existing.id },
      });
      await transaction.appointmentEvent.create({
        data: {
          actorUserId: user.id,
          appointmentId: appointment.id,
          locationId: appointment.locationId,
          organizationId: appointment.organizationId,
          payload: { reason: input.reason },
          type: AppointmentEventType.CANCELLED,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'appointment.cancelled',
          actorUserId: user.id,
          afterData: { reason: input.reason, status: 'cancelled' },
          beforeData: { status: existing.status.toLowerCase() },
          entityId: appointment.id,
          entityType: 'appointment',
          locationId: appointment.locationId,
          organizationId: appointment.organizationId,
        },
      });
      return appointment;
    });
    await notifier?.notify(updated.id, 'cancelled', user.id);
    return {
      appointment: publicAppointment(
        updated,
        canReadFullClientContact(current.role),
      ),
    };
  });

  app.patch('/v1/appointments/:appointmentId/status', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireAgendaMembership(
      database,
      user.id,
      'appointment.manage',
    );
    const { appointmentId } = request.params as { appointmentId: string };
    const input = updateAppointmentStatusSchema.parse(request.body);
    const existing = await database.appointment.findFirst({
      include: {
        location: { select: { timezone: true } },
        organization: {
          select: {
            name: true,
            servicePaymentConfirmationEnabled: true,
          },
        },
        professional: { include: { user: { select: { fullName: true } } } },
        publicAccess: { select: { id: true } },
      },
      where: { id: appointmentId, organizationId: current.organizationId },
    });
    if (!existing)
      throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'La cita no existe.');
    assertLocationScope(current, existing.locationId);
    assertProfessionalScope(current, existing.professionalMembershipId);
    await assertCanUseProfessional(
      database,
      current.organizationId,
      existing.professionalMembershipId,
    );
    const status = input.status.toUpperCase() as AppointmentStatus;
    const releasesSlot =
      status === AppointmentStatus.COMPLETED ||
      status === AppointmentStatus.NO_SHOW;
    const requestsPaymentConfirmation =
      status === AppointmentStatus.COMPLETED &&
      existing.status !== AppointmentStatus.COMPLETED &&
      existing.paymentStatus === 'PENDING' &&
      existing.organization.servicePaymentConfirmationEnabled;
    const updated = await database.$transaction(async (transaction) => {
      const completedPublicBookingClient =
        status === AppointmentStatus.COMPLETED &&
        existing.status !== AppointmentStatus.COMPLETED &&
        existing.source === AppointmentSource.PUBLIC_BOOKING &&
        !existing.clientId
          ? await findOrCreateCompletedPublicBookingClient(
              transaction,
              existing,
            )
          : null;
      const appointment = await transaction.appointment.update({
        data: {
          clientId: completedPublicBookingClient?.id ?? existing.clientId,
          ...(requestsPaymentConfirmation
            ? {
                paymentConfirmationRequestedAt: new Date(),
                paymentConfirmationRequestedByUserId: user.id,
              }
            : {}),
          reservesSlot: releasesSlot ? false : existing.reservesSlot,
          status,
          updatedByUserId: user.id,
        },
        include: { services: { orderBy: { sortOrder: 'asc' } } },
        where: { id: existing.id },
      });
      await transaction.appointmentEvent.create({
        data: {
          actorUserId: user.id,
          appointmentId: appointment.id,
          locationId: appointment.locationId,
          organizationId: appointment.organizationId,
          payload: {
            paymentConfirmationRequested: requestsPaymentConfirmation,
            status: input.status,
          },
          type: AppointmentEventType.STATUS_CHANGED,
        },
      });
      await reconcileAppointmentCommissions(transaction, appointment.id);
      return appointment;
    });
    if (requestsPaymentConfirmation)
      await notifier?.notifyPaymentConfirmation?.(updated.id, user.id);
    if (
      status === AppointmentStatus.COMPLETED &&
      existing.status !== AppointmentStatus.COMPLETED &&
      existing.source === AppointmentSource.PUBLIC_BOOKING &&
      existing.clientEmail &&
      existing.publicAccess &&
      publicBookingMailer
    ) {
      const reviewToken = createOpaqueToken();
      await database.publicBookingAccess.update({
        data: { reminderTokenHash: hashOpaqueToken(reviewToken) },
        where: { id: existing.publicAccess.id },
      });
      try {
        await publicBookingMailer.sendReviewRequest({
          email: existing.clientEmail,
          manageUrl: `${publicBaseUrl.replace(/\/+$/u, '')}/booking/${encodeURIComponent(reviewToken)}`,
          organizationName: existing.organization.name,
          professionalName: existing.professional.user.fullName,
          startsAt: existing.startsAt,
          timeZone: existing.location.timezone,
        });
      } catch (error) {
        app.log.error(error, 'No se pudo enviar la invitación de reseña.');
      }
    }
    return {
      appointment: publicAppointment(
        updated,
        canReadFullClientContact(current.role),
      ),
    };
  });

  app.get('/v1/appointment-payment-confirmations', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireAgendaMembership(
      database,
      user.id,
      'appointment.read',
    );
    if (!hasPermission(permissionRole(current.role), 'cash.read'))
      throw new ApiError(
        403,
        'FINANCIAL_ACCESS_FORBIDDEN',
        'No tienes permiso para confirmar cobros.',
      );
    const appointments = await database.appointment.findMany({
      include: {
        professional: { include: { user: { select: { fullName: true } } } },
        services: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { paymentConfirmationRequestedAt: 'asc' },
      where: {
        organizationId: current.organizationId,
        paymentConfirmationRequestedAt: { not: null },
        paymentStatus: 'PENDING',
        status: AppointmentStatus.COMPLETED,
        ...(current.role === MembershipRole.MANAGER
          ? {
              locationId: {
                in: current.memberLocations.map(({ locationId }) => locationId),
              },
            }
          : {}),
      },
    });
    const requesterIds = appointments.flatMap((appointment) =>
      appointment.paymentConfirmationRequestedByUserId
        ? [appointment.paymentConfirmationRequestedByUserId]
        : [],
    );
    const requesters = requesterIds.length
      ? await database.user.findMany({
          select: { fullName: true, id: true },
          where: { id: { in: requesterIds } },
        })
      : [];
    const requestersById = new Map(
      requesters.map((requester) => [requester.id, requester.fullName]),
    );
    return {
      confirmations: appointments.map((appointment) => ({
        appointmentId: appointment.id,
        clientName: appointment.clientName,
        locationId: appointment.locationId,
        professionalName: appointment.professional.user.fullName,
        requestedAt: appointment.paymentConfirmationRequestedAt!.toISOString(),
        requestedByName: appointment.paymentConfirmationRequestedByUserId
          ? (requestersById.get(
              appointment.paymentConfirmationRequestedByUserId,
            ) ?? null)
          : null,
        services: appointment.services.map((service) => ({
          name: service.serviceName,
          priceCents: service.priceCents,
        })),
        totalCents: appointment.services.reduce(
          (total, service) => total + service.priceCents,
          0,
        ),
      })),
    };
  });

  app.get('/v1/appointment-events', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireAgendaMembership(
      database,
      user.id,
      'appointment.read',
    );
    const input = appointmentEventsQuerySchema.parse(request.query);
    const events = await database.appointmentEvent.findMany({
      orderBy: { id: 'asc' },
      take: 100,
      where: {
        id: { gt: BigInt(input.after) },
        organizationId: current.organizationId,
        ...(current.role === MembershipRole.BARBER
          ? { appointment: { professionalMembershipId: current.id } }
          : current.role === MembershipRole.RECEPTIONIST
            ? {
                locationId: {
                  in: current.memberLocations.map(
                    ({ locationId }) => locationId,
                  ),
                },
              }
            : {}),
      },
    });
    return {
      events: events.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
        id: event.id.toString(),
        type: event.type.toLowerCase(),
      })),
      latestEventId: events.at(-1)?.id.toString() ?? input.after,
    };
  });
}
