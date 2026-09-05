import {
  Prisma,
  type DatabaseClient,
  type MembershipRole,
  type AppointmentPaymentStatus,
  type AppointmentSource,
  type AppointmentStatus,
} from '@barber-saas/database';
import {
  hasPermission,
  type MembershipRole as PermissionRole,
  type OrganizationPermission,
} from '@barber-saas/permissions';
import {
  agendaPageQuerySchema,
  appointmentCalendarSummaryQuerySchema,
  availabilityQuerySchema,
} from '@barber-saas/validation';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import {
  loadBookingContext,
  publicAppointment,
  zonedDateTimeToUtc,
} from './agenda';
import { buildAvailability } from './availability-engine';
import { decodeCursor, encodeCursor, sliceCursorPage } from './cursor-page';
import { ApiError } from './errors';
import type { OperationalAccessLoader } from './operational-access';

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{
  readonly user: { readonly email: string; readonly id: string };
}>;

function permissionRole(role: MembershipRole): PermissionRole {
  return role.toLowerCase() as PermissionRole;
}

function requirePermission(
  role: MembershipRole,
  permission: OrganizationPermission,
) {
  if (hasPermission(permissionRole(role), permission)) return;
  throw new ApiError(
    403,
    'FORBIDDEN',
    'No tienes permiso para realizar esta acción.',
  );
}

function allowedLocationIds(
  access: Awaited<ReturnType<OperationalAccessLoader>>,
): readonly string[] {
  return access.role === 'OWNER' || access.role === 'MANAGER'
    ? access.activeOrganizationLocations.map(({ id }) => id)
    : access.assignedLocationIds;
}

interface AppointmentRow {
  readonly clientEmail: string | null;
  readonly clientId: string | null;
  readonly clientName: string;
  readonly clientPhone: string | null;
  readonly endsAt: Date;
  readonly id: string;
  readonly locationId: string;
  readonly notes: string | null;
  readonly paymentStatus: string;
  readonly professionalMembershipId: string;
  readonly professionalName: string | null;
  readonly services: unknown;
  readonly source: string;
  readonly startsAt: Date;
  readonly status: string;
}

interface CalendarSummaryRow {
  readonly appointmentCount: number | bigint;
  readonly date: string;
  readonly locationId: string;
}

function weekdayFor(localDate: string): number {
  return new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
}

function appointmentServices(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((service) => {
    if (!service || typeof service !== 'object') return [];
    const record = service as Record<string, unknown>;
    return typeof record.id === 'string' &&
      typeof record.serviceId === 'string' &&
      typeof record.serviceName === 'string' &&
      typeof record.durationMinutes === 'number' &&
      typeof record.priceCents === 'number'
      ? [
          {
            durationMinutes: record.durationMinutes,
            id: record.id,
            priceCents: record.priceCents,
            serviceId: record.serviceId,
            serviceName: record.serviceName,
          },
        ]
      : [];
  });
}

function publicAppointmentRow(
  appointment: AppointmentRow,
  exposeClientContact: boolean,
) {
  return publicAppointment(
    {
      ...appointment,
      paymentStatus: appointment.paymentStatus as AppointmentPaymentStatus,
      professional: appointment.professionalName
        ? { user: { fullName: appointment.professionalName } }
        : null,
      services: appointmentServices(appointment.services),
      source: appointment.source as AppointmentSource,
      status: appointment.status as AppointmentStatus,
    },
    exposeClientContact,
  );
}

export function registerAgendaV2Routes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
  loadOperationalAccess: OperationalAccessLoader,
): void {
  const availabilityContexts = new Map<
    string,
    {
      readonly expiresAt: number;
      readonly value: Awaited<ReturnType<typeof loadBookingContext>>;
    }
  >();
  const availabilityContextLoads = new Map<
    string,
    Promise<Awaited<ReturnType<typeof loadBookingContext>>>
  >();
  const loadCachedAvailabilityContext = async (input: {
    readonly locationId: string;
    readonly membershipId: string;
    readonly organizationId: string;
    readonly serviceIds: readonly string[];
  }) => {
    const key = [
      input.organizationId,
      input.locationId,
      input.membershipId,
      input.serviceIds.join(','),
    ].join(':');
    const cached = availabilityContexts.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const pending = availabilityContextLoads.get(key);
    if (pending) return pending;
    const load = loadBookingContext(
      database,
      input.organizationId,
      input.locationId,
      input.membershipId,
      input.serviceIds,
    ).then((value) => {
      availabilityContexts.set(key, { expiresAt: Date.now() + 5_000, value });
      return value;
    });
    availabilityContextLoads.set(key, load);
    try {
      return await load;
    } finally {
      availabilityContextLoads.delete(key);
    }
  };
  app.get('/v2/appointments', async (request) => {
    const { user } = await authenticate(database, request);
    const access = await loadOperationalAccess(request, user.id);
    requirePermission(access.role, 'appointment.read');
    const input = agendaPageQuerySchema.parse(request.query);
    const allowed = new Set(allowedLocationIds(access));
    if (input.locationIds.some((locationId) => !allowed.has(locationId))) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'No tienes acceso a una de las sucursales solicitadas.',
      );
    }
    const locations = new Map(
      access.activeOrganizationLocations.map((location) => [
        location.id,
        location,
      ]),
    );
    const ranges = input.locationIds.map((locationId) => {
      const location = locations.get(locationId);
      if (!location)
        throw new ApiError(403, 'FORBIDDEN', 'La sucursal no está activa.');
      return {
        endsAt: zonedDateTimeToUtc(input.to, 1440, location.timezone),
        locationId,
        startsAt: zonedDateTimeToUtc(input.from, 0, location.timezone),
      };
    });
    const cursor = input.cursor
      ? decodeCursor(input.cursor, 'appointment')
      : undefined;
    const cursorStartsAt = cursor?.values[0];
    if (cursor && typeof cursorStartsAt !== 'string') {
      throw new ApiError(400, 'INVALID_CURSOR', 'El cursor no es válido.');
    }
    const cursorDate =
      typeof cursorStartsAt === 'string' ? new Date(cursorStartsAt) : undefined;
    if (cursorDate && Number.isNaN(cursorDate.valueOf())) {
      throw new ApiError(400, 'INVALID_CURSOR', 'El cursor no es válido.');
    }
    const activeAfter =
      typeof input.activeAfter === 'string'
        ? new Date(input.activeAfter)
        : undefined;
    if (
      access.role === 'BARBER' &&
      input.membershipId &&
      input.membershipId !== access.membershipId
    ) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Solo puedes consultar tu propia agenda.',
      );
    }
    const rangeSql = Prisma.join(
      ranges.map(
        ({ endsAt, locationId, startsAt }) =>
          Prisma.sql`(
            appointment.location_id = ${locationId}::uuid
            AND appointment.starts_at >= ${startsAt}
            AND appointment.starts_at < ${endsAt}
          )`,
      ),
      ' OR ',
    );
    const cursorSql =
      cursorDate && cursor
        ? Prisma.sql`AND (appointment.starts_at, appointment.id) > (${cursorDate}, ${cursor.id}::uuid)`
        : Prisma.empty;
    const activeAfterSql = activeAfter
      ? Prisma.sql`AND appointment.ends_at > ${activeAfter}`
      : Prisma.empty;
    const membershipId =
      access.role === 'BARBER'
        ? access.membershipId
        : input.membershipId;
    const membershipSql = membershipId
      ? Prisma.sql`AND appointment.professional_membership_id = ${membershipId}::uuid`
      : Prisma.empty;
    const appointments = await database.$queryRaw<readonly AppointmentRow[]>(
      Prisma.sql`
        SELECT
          appointment.id,
          appointment.client_id AS "clientId",
          appointment.client_name AS "clientName",
          appointment.client_phone AS "clientPhone",
          appointment.client_email AS "clientEmail",
          appointment.starts_at AS "startsAt",
          appointment.ends_at AS "endsAt",
          appointment.status,
          appointment.payment_status AS "paymentStatus",
          appointment.source,
          appointment.notes,
          appointment.location_id AS "locationId",
          appointment.professional_membership_id AS "professionalMembershipId",
          professional_user.full_name AS "professionalName",
          COALESCE(service_rows.items, '[]'::jsonb) AS services
        FROM appointments AS appointment
        INNER JOIN memberships AS professional
          ON professional.id = appointment.professional_membership_id
        INNER JOIN users AS professional_user ON professional_user.id = professional.user_id
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', service.id,
              'serviceId', service.service_id,
              'serviceName', service.service_name,
              'durationMinutes', service.duration_minutes,
              'priceCents', service.price_cents
            ) ORDER BY service.sort_order
          ) AS items
          FROM appointment_services AS service
          WHERE service.appointment_id = appointment.id
        ) AS service_rows ON TRUE
        WHERE appointment.organization_id = ${access.organizationId}::uuid
          AND appointment.status NOT IN ('PENDING_VERIFICATION'::"AppointmentStatus", 'EXPIRED'::"AppointmentStatus")
          AND (${rangeSql})
          ${membershipSql}
          ${activeAfterSql}
          ${cursorSql}
        ORDER BY appointment.starts_at ASC, appointment.id ASC
        LIMIT ${input.limit + 1}
      `,
    );
    const page = sliceCursorPage(appointments, input.limit, (appointment) =>
      encodeCursor(
        'appointment',
        [appointment.startsAt.toISOString()],
        appointment.id,
      ),
    );
    return {
      items: page.items.map((appointment) =>
        publicAppointmentRow(
          appointment,
          hasPermission(
            permissionRole(access.role),
            'client.contact.read_full',
          ),
        ),
      ),
      nextCursor: page.nextCursor,
    };
  });

  app.get('/v2/appointments/calendar-summary', async (request) => {
    const { user } = await authenticate(database, request);
    const access = await loadOperationalAccess(request, user.id);
    requirePermission(access.role, 'appointment.read');
    const input = appointmentCalendarSummaryQuerySchema.parse(request.query);
    const allowed = new Set(allowedLocationIds(access));
    if (input.locationIds.some((locationId) => !allowed.has(locationId))) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'No tienes acceso a una de las sucursales solicitadas.',
      );
    }
    const locationIds = Prisma.join(
      input.locationIds.map((locationId) => Prisma.sql`${locationId}::uuid`),
    );
    const summaries = await database.$queryRaw<readonly CalendarSummaryRow[]>(
      Prisma.sql`
        SELECT
          appointment.location_id AS "locationId",
          TO_CHAR(appointment.starts_at AT TIME ZONE location.timezone, 'YYYY-MM-DD') AS date,
          COUNT(*)::integer AS "appointmentCount"
        FROM appointments AS appointment
        INNER JOIN locations AS location ON location.id = appointment.location_id
        WHERE appointment.organization_id = ${access.organizationId}::uuid
          AND appointment.location_id IN (${locationIds})
          AND appointment.status NOT IN ('PENDING_VERIFICATION'::"AppointmentStatus", 'EXPIRED'::"AppointmentStatus")
          AND (appointment.starts_at AT TIME ZONE location.timezone)::date >= ${input.from}::date
          AND (appointment.starts_at AT TIME ZONE location.timezone)::date <= ${input.to}::date
        GROUP BY appointment.location_id, date
        ORDER BY date ASC, appointment.location_id ASC
      `,
    );
    return {
      items: summaries.map((summary) => ({
        appointmentCount: Number(summary.appointmentCount),
        date: summary.date,
        locationId: summary.locationId,
      })),
    };
  });

  app.get('/v2/availability', async (request) => {
    const { user } = await authenticate(database, request);
    const access = await loadOperationalAccess(request, user.id);
    requirePermission(access.role, 'appointment.read');
    const input = availabilityQuerySchema.parse(request.query);
    const allowed = new Set(allowedLocationIds(access));
    if (!allowed.has(input.locationId)) {
      throw new ApiError(403, 'FORBIDDEN', 'No tienes acceso a esta sucursal.');
    }
    if (
      access.role === 'BARBER' &&
      input.membershipId !== access.membershipId
    ) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Solo puedes consultar tu propia disponibilidad.',
      );
    }
    const context = await loadCachedAvailabilityContext({
      locationId: input.locationId,
      membershipId: input.membershipId,
      organizationId: access.organizationId,
      serviceIds: input.serviceIds,
    });
    const durationMinutes = context.snapshots.reduce(
      (total, service) => total + service.durationMinutes,
      0,
    );
    const dayStart = zonedDateTimeToUtc(input.date, 0, context.location.timezone);
    const dayEnd = zonedDateTimeToUtc(input.date, 1440, context.location.timezone);
    const weekday = weekdayFor(input.date);
    const [schedules, appointments] = await Promise.all([
      database.businessWeeklySchedule.findMany({
        orderBy: { startMinute: 'asc' },
        where: { locationId: input.locationId, weekday },
      }),
      database.appointment.findMany({
        select: { endsAt: true, startsAt: true },
        where: {
          endsAt: { gt: dayStart },
          professionalMembershipId: input.membershipId,
          reservesSlot: true,
          startsAt: { lt: dayEnd },
        },
      }),
    ]);
    const businessSchedule = schedules[0];
    if (!businessSchedule?.isOpen) return { durationMinutes, slots: [] };
    const availability = buildAvailability({
      date: input.date,
      durationMinutes,
      occupied: appointments.map(({ endsAt, startsAt }) => ({ endsAt, startsAt })),
      respectWindowEnd: true,
      stepMinutes: context.location.bookingSlotIntervalMinutes,
      timeZone: context.location.timezone,
      toUtc: zonedDateTimeToUtc,
      windows: schedules.map((schedule) => ({
        endMinute: Math.min(schedule.endMinute, businessSchedule.endMinute),
        startMinute: Math.max(schedule.startMinute, businessSchedule.startMinute),
      })),
    });
    return { durationMinutes, slots: availability.slots };
  });
}
