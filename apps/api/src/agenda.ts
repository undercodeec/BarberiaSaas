import {
  AppointmentEventType,
  AppointmentPaymentStatus,
  AppointmentStatus,
  MembershipRole,
  MembershipStatus,
  type DatabaseClient,
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

import { ApiError } from './errors';

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

async function loadBookingContext(
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
        role: MembershipRole.BARBER,
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

async function assertBookable(
  database: DatabaseClient,
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
  const schedules = await database.weeklySchedule.findMany({
    where: {
      locationId: input.locationId,
      membershipId: input.professionalMembershipId,
      weekday: weekdayFor(localDate),
    },
  });
  const insideWorkingHours = schedules.some((schedule) => {
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
  if (appointment) {
    throw new ApiError(
      409,
      'APPOINTMENT_CONFLICT',
      'Ese horario acaba de ser ocupado. Elige otro disponible.',
    );
  }
}

function isAppointmentConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes('appointments_no_professional_overlap') ||
    error.message.includes('23P01') ||
    error.message.toLowerCase().includes('exclusion constraint')
  );
}

function publicAppointment(appointment: {
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
  services?: ReadonlyArray<{
    durationMinutes: number;
    id: string;
    priceCents: number;
    serviceId: string;
    serviceName: string;
  }>;
}) {
  return {
    ...appointment,
    endsAt: appointment.endsAt.toISOString(),
    startsAt: appointment.startsAt.toISOString(),
    paymentStatus: appointment.paymentStatus.toLowerCase(),
    status: appointment.status.toLowerCase(),
  };
}

export function registerAgendaRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
) {
  app.get('/v1/availability', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireAgendaMembership(
      database,
      user.id,
      'appointment.read',
    );
    const input = availabilityQuerySchema.parse(request.query);
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
    const [schedules, blocks, appointments] = await Promise.all([
      database.weeklySchedule.findMany({
        orderBy: { startMinute: 'asc' },
        where: {
          locationId: input.locationId,
          membershipId: input.membershipId,
          weekday,
        },
      }),
      database.scheduleBlock.findMany({
        where: {
          endsAt: { gt: dayStart },
          membershipId: input.membershipId,
          startsAt: { lt: dayEnd },
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
    const occupied = [
      ...blocks.map((block) => ({
        endsAt: block.endsAt,
        startsAt: block.startsAt,
      })),
      ...appointments.map((appointment) => ({
        endsAt: appointment.endsAt,
        startsAt: appointment.startsAt,
      })),
    ];
    const slots: { endsAt: string; startsAt: string }[] = [];
    for (const schedule of schedules) {
      const scheduleEnd = zonedDateTimeToUtc(
        input.date,
        schedule.endMinute,
        context.location.timezone,
      );
      for (
        let minute = schedule.startMinute;
        minute + durationMinutes <= schedule.endMinute;
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
          !occupied.some((range) =>
            overlaps(startsAt, endsAt, range.startsAt, range.endsAt),
          )
        ) {
          slots.push({
            endsAt: endsAt.toISOString(),
            startsAt: startsAt.toISOString(),
          });
        }
      }
    }
    return { durationMinutes, slots };
  });

  app.get('/v1/appointments', async (request) => {
    const { user } = await authenticate(database, request);
    const current = await requireAgendaMembership(
      database,
      user.id,
      'appointment.read',
    );
    const input = dailyAppointmentsQuerySchema.parse(request.query);
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
    const dayStart = zonedDateTimeToUtc(input.date, 0, location.timezone);
    const dayEnd = zonedDateTimeToUtc(input.date, 1440, location.timezone);
    const appointments = await database.appointment.findMany({
      include: { services: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { startsAt: 'asc' },
      where: {
        locationId: input.locationId,
        organizationId: current.organizationId,
        startsAt: { gte: dayStart, lt: dayEnd },
        ...(targetMembershipId
          ? { professionalMembershipId: targetMembershipId }
          : {}),
      },
    });
    return { appointments: appointments.map(publicAppointment) };
  });

  app.post('/v1/appointments', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const current = await requireAgendaMembership(
      database,
      user.id,
      'appointment.manage',
    );
    const input = createAppointmentSchema.parse(request.body);
    assertProfessionalScope(current, input.professionalMembershipId);
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
        const created = await transaction.appointment.create({
          data: {
            clientEmail: input.clientEmail || null,
            clientName: input.clientName,
            clientPhone: input.clientPhone ?? null,
            createdByUserId: user.id,
            endsAt,
            locationId: input.locationId,
            notes: input.notes ?? null,
            organizationId: current.organizationId,
            professionalMembershipId: input.professionalMembershipId,
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
        return created;
      });
      return reply
        .code(201)
        .send({ appointment: publicAppointment(appointment) });
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
      return { appointment: publicAppointment(updated) };
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
    assertProfessionalScope(current, existing.professionalMembershipId);
    const updated = await database.$transaction(async (transaction) => {
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
    return { appointment: publicAppointment(updated) };
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
      where: { id: appointmentId, organizationId: current.organizationId },
    });
    if (!existing)
      throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'La cita no existe.');
    assertProfessionalScope(current, existing.professionalMembershipId);
    const status = input.status.toUpperCase() as AppointmentStatus;
    const releasesSlot =
      status === AppointmentStatus.COMPLETED ||
      status === AppointmentStatus.NO_SHOW;
    const updated = await database.$transaction(async (transaction) => {
      const appointment = await transaction.appointment.update({
        data: {
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
          payload: { status: input.status },
          type: AppointmentEventType.STATUS_CHANGED,
        },
      });
      return appointment;
    });
    return { appointment: publicAppointment(updated) };
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
