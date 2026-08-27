import {
  AppointmentEventType,
  AppointmentSource,
  AppointmentStatus,
  MembershipRole,
  SubscriptionStatus,
  MembershipStatus,
  UnconfirmedBookingAction,
  type DatabaseClient,
} from '@barber-saas/database';
import {
  createAppointmentReviewSchema,
  createPublicBookingSchema,
  managePublicBookingCancellationSchema,
  rescheduleAppointmentSchema,
  updateBookingSettingsSchema,
  verifyPublicBookingSchema,
} from '@barber-saas/validation';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import {
  assertBookable,
  isAppointmentConflict,
  loadBookingContext,
  publicAppointment,
  zonedDateTimeToUtc,
} from './agenda';
import type { ApiConfig } from './config';
import { ApiError } from './errors';
import type { AppointmentNotifier } from './notifications';
import { createPayphonePaymentLink } from './payphone-payments';
import {
  createOpaqueToken,
  createVerificationCode,
  hashOpaqueToken,
} from './security';
import {
  assertCanUseProfessional,
  assertCanCreateBooking,
  getAllowedProfessionalIds,
  getSubscriptionUsage,
  recordBookingMilestone,
  organizationSubscriptionIsReadOnly,
} from './subscription-policy';

const PUBLIC_VERIFICATION_DURATION_MS = 10 * 60 * 1000;
const MANAGEMENT_AFTER_END_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_PUBLIC_BOOKING_BASE_URL = 'https://navacloud.app';

const publicPathSchema = z.object({
  locationSlug: z.string().trim().min(1).max(80),
  organizationSlug: z.string().trim().min(1).max(80),
});
const organizationPathSchema = z.object({
  organizationSlug: z.string().trim().min(1).max(80),
});
const publicAvailabilitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  membershipId: z.uuid(),
  serviceIds: z
    .string()
    .min(1)
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(z.uuid()).min(1).max(10)),
});
const bookingPathSchema = z.object({ bookingId: z.uuid() });
const tokenPathSchema = z.object({ token: z.string().min(32).max(512) });
const reviewPathSchema = z.object({ reviewId: z.uuid() });

interface PublicBookingMailer {
  sendCancellation(message: BookingMailMessage): Promise<void>;
  sendConfirmation(message: BookingMailMessage): Promise<void>;
  sendReminder(message: BookingMailMessage): Promise<void>;
  sendVerification(message: {
    readonly code: string;
    readonly email: string;
    readonly organizationName: string;
  }): Promise<void>;
}

interface BookingMailMessage {
  readonly email: string;
  readonly manageUrl: string;
  readonly organizationName: string;
  readonly professionalName: string;
  readonly startsAt: Date;
  readonly timeZone: string;
}

interface AuthenticatedIdentity {
  readonly user: { readonly email: string; readonly id: string };
}

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<AuthenticatedIdentity>;

const requestBuckets = new Map<string, { count: number; resetAt: number }>();

function enforceRateLimit(
  request: FastifyRequest,
  scope: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const key = `${scope}:${request.ip}`;
  const current = requestBuckets.get(key);
  if (!current || current.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) {
    throw new ApiError(
      429,
      'PUBLIC_BOOKING_RATE_LIMITED',
      'Has realizado demasiados intentos. Espera unos minutos.',
    );
  }
  current.count += 1;
}

function weekdayFor(localDate: string) {
  return new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
}

function overlaps(
  startsAt: Date,
  endsAt: Date,
  occupiedStartsAt: Date,
  occupiedEndsAt: Date,
) {
  return startsAt < occupiedEndsAt && endsAt > occupiedStartsAt;
}

async function requirePublicLocation(
  database: DatabaseClient,
  organizationSlug: string,
  locationSlug: string,
) {
  const organization = await database.organization.findFirst({
    select: { id: true },
    where: {
      deletedAt: null,
      OR: [
        { slug: organizationSlug },
        { publicBookingToken: organizationSlug },
      ],
    },
  });
  if (!organization) {
    throw new ApiError(
      404,
      'PUBLIC_LOCATION_NOT_FOUND',
      'Este enlace de reservas no está disponible.',
    );
  }
  const location = await database.location.findFirst({
    include: { organization: true },
    where: {
      isActive: true,
      organizationId: organization.id,
      slug: locationSlug,
    },
  });
  if (!location) {
    throw new ApiError(
      404,
      'PUBLIC_LOCATION_NOT_FOUND',
      'Este enlace de reservas no está disponible.',
    );
  }
  return location;
}

async function publicCatalog(
  database: DatabaseClient,
  organizationSlug: string,
  locationSlug: string,
) {
  const location = await requirePublicLocation(
    database,
    organizationSlug,
    locationSlug,
  );
  const subscriptionUsage = await getSubscriptionUsage(
    database,
    location.organizationId,
  );
  const allowedProfessionalIds = await getAllowedProfessionalIds(
    database,
    location.organizationId,
  );
  const [assignments, reviews, products, schedules, ownerMembership] =
    await Promise.all([
      database.professionalService.findMany({
        include: {
          membership: {
            include: {
              user: {
                select: {
                  fullName: true,
                  profileBio: true,
                  profilePhotoData: true,
                },
              },
            },
          },
          service: { include: { category: true } },
        },
        where: {
          locationId: location.id,
          membership: {
            ...(allowedProfessionalIds === null
              ? {}
              : { id: { in: allowedProfessionalIds } }),
            memberLocations: {
              some: { locationId: location.id, onlineBookingEnabled: true },
            },
            status: MembershipStatus.ACTIVE,
          },
          service: {
            isActive: true,
            onlineBooking: true,
            organizationId: location.organizationId,
          },
        },
      }),
      database.appointmentReview.findMany({
        include: {
          professional: { include: { user: { select: { fullName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
        where: { isVisible: true, locationId: location.id },
      }),
      database.product.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          imageData: true,
          inventory: {
            select: { quantityOnHand: true, quantityReserved: true },
            where: { locationId: location.id },
          },
          name: true,
          salePriceCents: true,
          stockTrackingEnabled: true,
        },
        where: { isActive: true, organizationId: location.organizationId },
      }),
      database.businessWeeklySchedule.findMany({
        orderBy: { weekday: 'asc' },
        where: { locationId: location.id },
      }),
      database.membership.findFirst({
        include: {
          user: {
            select: {
              profileBio: true,
              profilePhotoData: true,
              registrationProfile: {
                select: {
                  coverImageUri: true,
                  facebookUrl: true,
                  instagramUrl: true,
                },
              },
            },
          },
        },
        where: {
          organizationId: location.organizationId,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      }),
    ]);
  const professionalMap = new Map<
    string,
    {
      bio: string | null;
      id: string;
      name: string;
      photoData: string | null;
      serviceIds: string[];
    }
  >();
  const serviceMap = new Map<
    string,
    {
      category: string | null;
      description: string | null;
      durationMinutes: number;
      id: string;
      imageData: string | null;
      name: string;
      priceCents: number;
    }
  >();
  for (const assignment of assignments) {
    const professional = professionalMap.get(assignment.membershipId) ?? {
      bio: assignment.membership.user.profileBio,
      id: assignment.membershipId,
      name: assignment.membership.user.fullName,
      photoData: assignment.membership.user.profilePhotoData,
      serviceIds: [],
    };
    professional.serviceIds.push(assignment.serviceId);
    professionalMap.set(assignment.membershipId, professional);
    serviceMap.set(assignment.serviceId, {
      category: assignment.service.category?.name ?? null,
      description: assignment.service.description,
      durationMinutes:
        assignment.customDurationMinutes ?? assignment.service.durationMinutes,
      id: assignment.service.id,
      imageData: assignment.service.imageData,
      name: assignment.service.name,
      priceCents: assignment.customPriceCents ?? assignment.service.priceCents,
    });
  }
  return {
    bookingAvailability: {
      canCreate:
        subscriptionUsage.subscription.status !==
          SubscriptionStatus.SUSPENDED &&
        subscriptionUsage.subscription.status !==
          SubscriptionStatus.CANCELLED &&
        (subscriptionUsage.effectiveBookingLimit === null ||
          subscriptionUsage.usage.rolling30DayBookings <
            subscriptionUsage.effectiveBookingLimit),
      message:
        subscriptionUsage.subscription.status ===
          SubscriptionStatus.SUSPENDED ||
        subscriptionUsage.subscription.status ===
          SubscriptionStatus.CANCELLED ||
        (subscriptionUsage.effectiveBookingLimit !== null &&
          subscriptionUsage.usage.rolling30DayBookings >=
            subscriptionUsage.effectiveBookingLimit)
          ? 'Las reservas online de este negocio estan temporalmente pausadas. Puedes contactar directamente con el negocio.'
          : null,
    },
    location: {
      addressLine: location.addressLine,
      city: location.city,
      countryCode: location.countryCode,
      currencyCode: location.currencyCode,
      email: location.email,
      formattedAddress: location.formattedAddress,
      googlePlaceId: location.googlePlaceId,
      id: location.id,
      latitude: location.latitude,
      longitude: location.longitude,
      name: location.name,
      phone: location.phone,
      slug: location.slug,
      timezone: location.timezone,
    },
    organization: {
      id: location.organization.id,
      name: location.organization.name,
      coverImageUri:
        ownerMembership?.user.registrationProfile?.coverImageUri ?? null,
      description: ownerMembership?.user.profileBio ?? null,
      facebookUrl:
        ownerMembership?.user.registrationProfile?.facebookUrl ?? null,
      instagramUrl:
        ownerMembership?.user.registrationProfile?.instagramUrl ?? null,
      profilePhotoData: ownerMembership?.user.profilePhotoData ?? null,
      slug: location.organization.slug,
    },
    policy: {
      cancellationLeadMinutes:
        location.organization.bookingCancellationLeadMinutes,
      confirmationDeadlineMinutes:
        location.organization.bookingConfirmationDeadlineMinutes,
      confirmationEnabled: location.organization.bookingConfirmationEnabled,
      policyText: location.organization.bookingPolicyText,
      policyVersion: location.organization.bookingPolicyVersion,
      reminderMinutes: location.organization.bookingReminderMinutes,
      rescheduleLeadMinutes: location.organization.bookingRescheduleLeadMinutes,
      unconfirmedAction:
        location.organization.bookingUnconfirmedAction.toLowerCase(),
    },
    professionals: [...professionalMap.values()],
    reviews: reviews.map((review) => ({
      clientName: `${review.clientName.split(/\s+/u)[0]} ${
        review.clientName.split(/\s+/u).slice(-1)[0]?.slice(0, 1) ?? ''
      }.`.trim(),
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
      id: review.id,
      professionalName: review.professional.user.fullName,
      rating: review.rating,
    })),
    schedules: schedules.map((schedule) => ({
      endMinute: schedule.endMinute,
      isOpen: schedule.isOpen,
      startMinute: schedule.startMinute,
      weekday: schedule.weekday,
    })),
    products: products.map((product) => ({
      id: product.id,
      imageData: product.imageData,
      isAvailable:
        !product.stockTrackingEnabled ||
        (product.inventory[0]?.quantityOnHand ?? 0) -
          (product.inventory[0]?.quantityReserved ?? 0) >
          0,
      name: product.name,
      priceCents: product.salePriceCents,
    })),
    services: [...serviceMap.values()],
  };
}

async function assertPublicOnlineBookingEnabled(
  database: Pick<DatabaseClient, 'memberLocation'>,
  input: {
    locationId: string;
    membershipId: string;
    organizationId: string;
  },
) {
  const memberLocation = await database.memberLocation.findFirst({
    where: {
      locationId: input.locationId,
      membershipId: input.membershipId,
      onlineBookingEnabled: true,
      membership: {
        organizationId: input.organizationId,
        status: MembershipStatus.ACTIVE,
      },
    },
  });
  if (!memberLocation) {
    throw new ApiError(
      404,
      'PROFESSIONAL_NOT_AVAILABLE',
      'Este profesional no está disponible para reservas online.',
    );
  }
}

async function calculatePublicAvailability(
  database: DatabaseClient,
  input: {
    date: string;
    locationId: string;
    membershipId: string;
    organizationId: string;
    serviceIds: readonly string[];
  },
) {
  await assertPublicOnlineBookingEnabled(database, input);
  const context = await loadBookingContext(
    database,
    input.organizationId,
    input.locationId,
    input.membershipId,
    input.serviceIds,
  );
  const publicServiceCount = await database.service.count({
    where: {
      id: { in: [...input.serviceIds] },
      isActive: true,
      onlineBooking: true,
      organizationId: input.organizationId,
    },
  });
  if (publicServiceCount !== new Set(input.serviceIds).size) {
    throw new ApiError(
      400,
      'SERVICE_NOT_PUBLIC',
      'Uno de los servicios ya no admite reservas online.',
    );
  }
  const durationMinutes = context.snapshots.reduce(
    (total, service) => total + service.durationMinutes,
    0,
  );
  const dayStart = zonedDateTimeToUtc(input.date, 0, context.location.timezone);
  const dayEnd = zonedDateTimeToUtc(
    input.date,
    1440,
    context.location.timezone,
  );
  const weekday = weekdayFor(input.date);
  const [schedules, businessSchedule, blocks, appointments] = await Promise.all(
    [
      database.weeklySchedule.findMany({
        orderBy: { startMinute: 'asc' },
        where: {
          locationId: input.locationId,
          membershipId: input.membershipId,
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
    ],
  );
  if (!businessSchedule?.isOpen) return { durationMinutes, slots: [] };
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
  const slots: Array<{ endsAt: string; startsAt: string }> = [];
  for (const schedule of schedules) {
    const startMinute = Math.max(
      schedule.startMinute,
      businessSchedule.startMinute,
    );
    const endMinute = Math.min(schedule.endMinute, businessSchedule.endMinute);
    for (
      let minute = startMinute;
      minute + durationMinutes <= endMinute;
      minute += durationMinutes
    ) {
      const startsAt = zonedDateTimeToUtc(
        input.date,
        minute,
        context.location.timezone,
      );
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
      if (
        startsAt > new Date() &&
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
}

function publicManagedAppointment(appointment: {
  attendanceConfirmedAt: Date | null;
  clientEmail: string | null;
  clientName: string;
  clientPhone: string | null;
  endsAt: Date;
  id: string;
  locationId: string;
  location: {
    addressLine: string | null;
    city: string | null;
    currencyCode: string;
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
  organization: {
    bookingCancellationLeadMinutes: number;
    bookingRescheduleLeadMinutes: number;
    name: string;
    slug: string;
  };
  professional: { user: { fullName: string } };
  professionalMembershipId: string;
  review: { comment: string | null; id: string; rating: number } | null;
  services: ReadonlyArray<{
    durationMinutes: number;
    id: string;
    priceCents: number;
    serviceId: string;
    serviceName: string;
  }>;
  startsAt: Date;
  status: AppointmentStatus;
}) {
  const now = Date.now();
  const isActive =
    appointment.status === AppointmentStatus.CONFIRMED ||
    appointment.status === AppointmentStatus.AWAITING_CONFIRMATION;
  return {
    appointment: {
      attendanceConfirmedAt:
        appointment.attendanceConfirmedAt?.toISOString() ?? null,
      canCancel:
        isActive &&
        now <
          appointment.startsAt.getTime() -
            appointment.organization.bookingCancellationLeadMinutes * 60_000,
      canReschedule:
        isActive &&
        now <
          appointment.startsAt.getTime() -
            appointment.organization.bookingRescheduleLeadMinutes * 60_000,
      clientEmail: appointment.clientEmail,
      clientName: appointment.clientName,
      clientPhone: appointment.clientPhone,
      endsAt: appointment.endsAt.toISOString(),
      id: appointment.id,
      location: {
        addressLine: appointment.location.addressLine,
        city: appointment.location.city,
        currencyCode: appointment.location.currencyCode,
        id: appointment.location.id,
        name: appointment.location.name,
        slug: appointment.location.slug,
        timezone: appointment.location.timezone,
      },
      locationId: appointment.locationId,
      organization: {
        name: appointment.organization.name,
        slug: appointment.organization.slug,
      },
      professionalName: appointment.professional.user.fullName,
      professionalMembershipId: appointment.professionalMembershipId,
      review: appointment.review,
      services: appointment.services,
      startsAt: appointment.startsAt.toISOString(),
      status: appointment.status.toLowerCase(),
      totalCents: appointment.services.reduce(
        (total, service) => total + service.priceCents,
        0,
      ),
    },
  };
}

function assertActivePublicAppointment(status: AppointmentStatus) {
  if (
    status !== AppointmentStatus.CONFIRMED &&
    status !== AppointmentStatus.AWAITING_CONFIRMATION
  ) {
    throw new ApiError(
      409,
      'PUBLIC_BOOKING_NOT_ACTIVE',
      'La cita ya no está activa y no admite esta acción.',
    );
  }
}

async function requireManagedAppointment(
  database: DatabaseClient,
  token: string,
) {
  const tokenHash = hashOpaqueToken(token);
  const access = await database.publicBookingAccess.findFirst({
    include: {
      appointment: {
        include: {
          location: true,
          organization: true,
          professional: {
            include: { user: { select: { fullName: true } } },
          },
          review: { select: { comment: true, id: true, rating: true } },
          services: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
    where: {
      OR: [
        { managementTokenHash: tokenHash },
        { reminderTokenHash: tokenHash },
      ],
    },
  });
  if (
    !access?.verifiedAt ||
    !access.managementExpiresAt ||
    access.managementExpiresAt <= new Date()
  ) {
    throw new ApiError(
      401,
      'PUBLIC_BOOKING_TOKEN_INVALID',
      'El enlace de gestión no es válido o ya venció.',
    );
  }
  return access;
}

function manageUrl(publicBaseUrl: string, token: string) {
  return `${publicBaseUrl.replace(/\/+$/u, '')}/booking/${encodeURIComponent(token)}`;
}

async function sendSafely(operation: (() => Promise<void>) | null) {
  if (!operation) return;
  try {
    await operation();
  } catch {
    // The appointment remains valid; delivery can be retried by the scheduler.
  }
}

export async function processPublicBookingLifecycle(
  database: DatabaseClient,
  mailer: PublicBookingMailer | null,
  publicBaseUrl = DEFAULT_PUBLIC_BOOKING_BASE_URL,
  notifier: AppointmentNotifier | null = null,
) {
  const now = new Date();
  await database.appointment.updateMany({
    data: {
      reservesSlot: false,
      status: AppointmentStatus.EXPIRED,
    },
    where: {
      status: AppointmentStatus.PENDING_VERIFICATION,
      verificationExpiresAt: { lte: now },
    },
  });

  const reminderCandidates = await database.appointment.findMany({
    include: {
      location: true,
      organization: true,
      professional: { include: { user: { select: { fullName: true } } } },
      publicAccess: true,
    },
    take: 50,
    where: {
      attendanceConfirmationRequestedAt: null,
      organization: { bookingConfirmationEnabled: true },
      source: AppointmentSource.PUBLIC_BOOKING,
      startsAt: { gt: now },
      status: AppointmentStatus.CONFIRMED,
    },
  });
  for (const appointment of reminderCandidates) {
    const reminderAt = new Date(
      appointment.startsAt.getTime() -
        appointment.organization.bookingReminderMinutes * 60_000,
    );
    if (reminderAt > now) continue;
    if (appointment.createdAt > reminderAt) continue;
    const deadline = new Date(
      appointment.startsAt.getTime() -
        appointment.organization.bookingConfirmationDeadlineMinutes * 60_000,
    );
    if (!mailer || !appointment.publicAccess || !appointment.clientEmail)
      continue;
    const reminderToken = createOpaqueToken();
    await database.publicBookingAccess.update({
      data: { reminderTokenHash: hashOpaqueToken(reminderToken) },
      where: { id: appointment.publicAccess.id },
    });
    try {
      await mailer.sendReminder({
        email: appointment.clientEmail!,
        manageUrl: manageUrl(publicBaseUrl, reminderToken),
        organizationName: appointment.organization.name,
        professionalName: appointment.professional.user.fullName,
        startsAt: appointment.startsAt,
        timeZone: appointment.location.timezone,
      });
    } catch {
      continue;
    }
    await database.appointment.update({
      data: {
        attendanceConfirmedAt: null,
        attendanceConfirmationDeadlineAt: deadline,
        attendanceConfirmationRequestedAt: now,
        status: AppointmentStatus.AWAITING_CONFIRMATION,
      },
      where: { id: appointment.id },
    });
  }

  const overdue = await database.appointment.findMany({
    include: {
      location: true,
      organization: true,
      professional: { include: { user: { select: { fullName: true } } } },
      publicAccess: true,
    },
    where: {
      attendanceConfirmationDeadlineAt: { lte: now },
      status: AppointmentStatus.AWAITING_CONFIRMATION,
    },
  });
  for (const appointment of overdue) {
    if (
      appointment.organization.bookingUnconfirmedAction ===
      UnconfirmedBookingAction.CANCEL
    ) {
      await database.appointment.update({
        data: {
          cancellationReason: 'No confirmó asistencia dentro del plazo.',
          cancelledAt: now,
          reservesSlot: false,
          status: AppointmentStatus.CANCELLED,
        },
        where: { id: appointment.id },
      });
      await notifier?.notify(appointment.id, 'cancelled');
      if (mailer && appointment.publicAccess && appointment.clientEmail) {
        const cancellationToken = createOpaqueToken();
        await database.publicBookingAccess.update({
          data: { reminderTokenHash: hashOpaqueToken(cancellationToken) },
          where: { id: appointment.publicAccess.id },
        });
        await sendSafely(() =>
          mailer.sendCancellation({
            email: appointment.clientEmail!,
            manageUrl: manageUrl(publicBaseUrl, cancellationToken),
            organizationName: appointment.organization.name,
            professionalName: appointment.professional.user.fullName,
            startsAt: appointment.startsAt,
            timeZone: appointment.location.timezone,
          }),
        );
      }
    }
  }
}

async function requireBookingManager(database: DatabaseClient, userId: string) {
  const membership = await database.membership.findFirst({
    where: { status: MembershipStatus.ACTIVE, userId },
  });
  if (!membership) {
    throw new ApiError(
      403,
      'ORGANIZATION_REQUIRED',
      'Tu cuenta no pertenece a un negocio activo.',
    );
  }
  return membership;
}

function assertCanConfigureBookings(role: MembershipRole) {
  if (role !== MembershipRole.OWNER && role !== MembershipRole.MANAGER) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Sólo el propietario o administrador puede cambiar estas reglas.',
    );
  }
}

export function registerPublicBookingRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
  mailer: PublicBookingMailer | null,
  notifier: AppointmentNotifier | null,
  appEnvironment: 'local' | 'preview' | 'production' | 'staging',
  publicBaseUrl = DEFAULT_PUBLIC_BOOKING_BASE_URL,
  config: ApiConfig,
) {
  app.get('/v1/public/:organizationSlug', async (request) => {
    enforceRateLimit(request, 'catalog', 120, 60_000);
    const { organizationSlug } = organizationPathSchema.parse(request.params);
    const organization = await database.organization.findFirst({
      select: { id: true },
      where: {
        deletedAt: null,
        OR: [
          { slug: organizationSlug },
          { publicBookingToken: organizationSlug },
        ],
      },
    });
    if (!organization) {
      throw new ApiError(
        404,
        'PUBLIC_ORGANIZATION_NOT_FOUND',
        'Este enlace de reservas no está disponible.',
      );
    }
    const location = await database.location.findFirst({
      orderBy: { createdAt: 'asc' },
      where: {
        isActive: true,
        organizationId: organization.id,
      },
    });
    if (!location) {
      throw new ApiError(
        404,
        'PUBLIC_ORGANIZATION_NOT_FOUND',
        'Este enlace de reservas no está disponible.',
      );
    }
    return {
      locationSlug: location.slug,
      redirectPath: `/${organizationSlug}/${location.slug}`,
    };
  });

  app.get('/v1/public/:organizationSlug/:locationSlug', async (request) => {
    enforceRateLimit(request, 'catalog', 120, 60_000);
    const input = publicPathSchema.parse(request.params);
    return publicCatalog(database, input.organizationSlug, input.locationSlug);
  });

  app.get(
    '/v1/public/:organizationSlug/:locationSlug/availability',
    async (request) => {
      enforceRateLimit(request, 'availability', 90, 60_000);
      const path = publicPathSchema.parse(request.params);
      const query = publicAvailabilitySchema.parse(request.query);
      const location = await requirePublicLocation(
        database,
        path.organizationSlug,
        path.locationSlug,
      );
      return calculatePublicAvailability(database, {
        ...query,
        locationId: location.id,
        organizationId: location.organizationId,
      });
    },
  );

  app.post(
    '/v1/public/:organizationSlug/:locationSlug/bookings',
    async (request, reply) => {
      enforceRateLimit(request, 'create-booking', 12, 15 * 60_000);
      const path = publicPathSchema.parse(request.params);
      const input = createPublicBookingSchema.parse(request.body);
      const rawIdempotencyKey = request.headers['idempotency-key'];
      const idempotencyKey =
        typeof rawIdempotencyKey === 'string' ? rawIdempotencyKey : '';
      if (idempotencyKey.length < 16 || idempotencyKey.length > 128) {
        throw new ApiError(
          400,
          'IDEMPOTENCY_KEY_REQUIRED',
          'No pudimos identificar este intento de reserva.',
        );
      }
      const location = await requirePublicLocation(
        database,
        path.organizationSlug,
        path.locationSlug,
      );
      const idempotencyHash = hashOpaqueToken(idempotencyKey);
      const existing = await database.appointment.findUnique({
        where: {
          organizationId_publicIdempotencyKeyHash: {
            organizationId: location.organizationId,
            publicIdempotencyKeyHash: idempotencyHash,
          },
        },
      });
      if (existing) {
        return {
          bookingId: existing.id,
          verificationExpiresAt:
            existing.verificationExpiresAt?.toISOString() ?? null,
          verificationRequired:
            existing.status === AppointmentStatus.PENDING_VERIFICATION,
        };
      }
      if (
        await organizationSubscriptionIsReadOnly(
          database,
          location.organizationId,
        )
      )
        throw new ApiError(
          423,
          'PUBLIC_BOOKING_UNAVAILABLE',
          'Este negocio no está aceptando nuevas reservas por el momento.',
        );
      await assertCanCreateBooking(database, location.organizationId, 'public');
      await assertPublicOnlineBookingEnabled(database, {
        locationId: location.id,
        membershipId: input.membershipId,
        organizationId: location.organizationId,
      });
      const context = await loadBookingContext(
        database,
        location.organizationId,
        location.id,
        input.membershipId,
        input.serviceIds,
      );
      const publicServices = await database.service.count({
        where: {
          id: { in: input.serviceIds },
          isActive: true,
          onlineBooking: true,
          organizationId: location.organizationId,
        },
      });
      if (publicServices !== new Set(input.serviceIds).size) {
        throw new ApiError(
          400,
          'SERVICE_NOT_PUBLIC',
          'Uno de los servicios ya no admite reservas online.',
        );
      }
      const startsAt = new Date(input.startsAt);
      const durationMinutes = context.snapshots.reduce(
        (total, service) => total + service.durationMinutes,
        0,
      );
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
      await assertBookable(database, {
        endsAt,
        locationId: location.id,
        professionalMembershipId: input.membershipId,
        startsAt,
        timeZone: location.timezone,
      });
      const code = createVerificationCode();
      const verificationExpiresAt = new Date(
        Date.now() + PUBLIC_VERIFICATION_DURATION_MS,
      );
      try {
        const appointment = await database.$transaction(async (transaction) => {
          await transaction.$queryRaw`WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${location.organizationId}))) SELECT 1 AS locked FROM lock`;
          await assertCanCreateBooking(
            transaction,
            location.organizationId,
            'public',
          );
          await assertPublicOnlineBookingEnabled(transaction, {
            locationId: location.id,
            membershipId: input.membershipId,
            organizationId: location.organizationId,
          });
          await assertCanUseProfessional(
            transaction,
            location.organizationId,
            input.membershipId,
          );

          const created = await transaction.appointment.create({
            data: {
              clientEmail: input.email.toLowerCase(),
              clientName: input.fullName,
              clientPhone: input.phone,
              endsAt,
              locationId: location.id,
              organizationId: location.organizationId,
              policyAcceptedAt: new Date(),
              policyVersion: location.organization.bookingPolicyVersion,
              professionalMembershipId: input.membershipId,
              publicAccess: {
                create: { verificationCodeHash: hashOpaqueToken(code) },
              },
              publicIdempotencyKeyHash: idempotencyHash,
              services: {
                create: context.snapshots.map((service) => ({
                  durationMinutes: service.durationMinutes,
                  priceCents: service.priceCents,
                  serviceId: service.serviceId,
                  serviceName: service.serviceName,
                  sortOrder: service.sortOrder,
                })),
              },
              source: AppointmentSource.PUBLIC_BOOKING,
              startsAt,
              status: AppointmentStatus.PENDING_VERIFICATION,
              verificationExpiresAt,
            },
          });
          await transaction.appointmentEvent.create({
            data: {
              appointmentId: created.id,
              locationId: created.locationId,
              organizationId: created.organizationId,
              payload: { channel: 'public_booking' },
              type: AppointmentEventType.CREATED,
            },
          });
          await recordBookingMilestone(transaction, location.organizationId);
          return created;
        });
        if (mailer) {
          try {
            await mailer.sendVerification({
              code,
              email: input.email,
              organizationName: location.organization.name,
            });
          } catch (error) {
            await database.appointment.update({
              data: {
                reservesSlot: false,
                status: AppointmentStatus.EXPIRED,
              },
              where: { id: appointment.id },
            });
            throw error;
          }
        } else if (appEnvironment !== 'local') {
          await database.appointment.update({
            data: { reservesSlot: false, status: AppointmentStatus.EXPIRED },
            where: { id: appointment.id },
          });
          throw new ApiError(
            503,
            'BOOKING_EMAIL_UNAVAILABLE',
            'No pudimos enviar el correo de verificación.',
          );
        }
        return reply.code(201).send({
          bookingId: appointment.id,
          ...(appEnvironment === 'local'
            ? { developmentVerificationCode: code }
            : {}),
          verificationExpiresAt: verificationExpiresAt.toISOString(),
          verificationRequired: true,
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
    },
  );

  app.post('/v1/public/bookings/:bookingId/verify', async (request) => {
    enforceRateLimit(request, 'verify-booking', 20, 15 * 60_000);
    const { bookingId } = bookingPathSchema.parse(request.params);
    const { code } = verifyPublicBookingSchema.parse(request.body);
    const existing = await database.appointment.findUnique({
      include: {
        location: true,
        organization: true,
        professional: { include: { user: { select: { fullName: true } } } },
        publicAccess: true,
        services: { orderBy: { sortOrder: 'asc' } },
      },
      where: { id: bookingId },
    });
    if (
      !existing?.publicAccess ||
      existing.source !== AppointmentSource.PUBLIC_BOOKING
    ) {
      throw new ApiError(
        404,
        'PUBLIC_BOOKING_NOT_FOUND',
        'La solicitud de reserva no existe.',
      );
    }
    if (
      existing.status !== AppointmentStatus.PENDING_VERIFICATION ||
      !existing.verificationExpiresAt ||
      existing.verificationExpiresAt <= new Date()
    ) {
      throw new ApiError(
        410,
        'PUBLIC_BOOKING_VERIFICATION_EXPIRED',
        'El tiempo de verificación terminó. Selecciona nuevamente el horario.',
      );
    }
    if (existing.publicAccess.verificationCodeHash !== hashOpaqueToken(code)) {
      const attempts = existing.publicAccess.verificationAttempts + 1;
      await database.$transaction([
        database.publicBookingAccess.update({
          data: { verificationAttempts: Math.min(attempts, 5) },
          where: { id: existing.publicAccess.id },
        }),
        ...(attempts >= 5
          ? [
              database.appointment.update({
                data: {
                  reservesSlot: false,
                  status: AppointmentStatus.EXPIRED,
                },
                where: { id: existing.id },
              }),
            ]
          : []),
      ]);
      throw new ApiError(
        attempts >= 5 ? 429 : 400,
        attempts >= 5
          ? 'PUBLIC_BOOKING_VERIFICATION_RATE_LIMITED'
          : 'INVALID_PUBLIC_BOOKING_CODE',
        attempts >= 5
          ? 'Superaste el número de intentos. El horario fue liberado.'
          : 'El código ingresado no es correcto.',
      );
    }
    const token = createOpaqueToken();
    const managementExpiresAt = new Date(
      existing.endsAt.getTime() + MANAGEMENT_AFTER_END_MS,
    );
    const client = await database.$transaction(async (transaction) => {
      const knownClient = await transaction.client.findFirst({
        where: {
          deletedAt: null,
          organizationId: existing.organizationId,
          phone: existing.clientPhone!,
        },
      });
      const linkedClient =
        knownClient ??
        (await transaction.client.create({
          data: {
            email: existing.clientEmail,
            fullName: existing.clientName,
            organizationId: existing.organizationId,
            phone: existing.clientPhone!,
            source: AppointmentSource.PUBLIC_BOOKING,
          },
        }));
      await transaction.appointment.update({
        data: {
          attendanceConfirmedAt: new Date(),
          clientId: linkedClient.id,
          status: AppointmentStatus.CONFIRMED,
          verificationExpiresAt: null,
        },
        where: { id: existing.id },
      });
      await transaction.publicBookingAccess.update({
        data: {
          managementExpiresAt,
          managementTokenHash: hashOpaqueToken(token),
          verifiedAt: new Date(),
        },
        where: { id: existing.publicAccess!.id },
      });
      return linkedClient;
    });
    const url = manageUrl(publicBaseUrl, token);
    await sendSafely(
      mailer
        ? () =>
            mailer.sendConfirmation({
              email: existing.clientEmail!,
              manageUrl: url,
              organizationName: existing.organization.name,
              professionalName: existing.professional.user.fullName,
              startsAt: existing.startsAt,
              timeZone: existing.location.timezone,
            })
        : null,
    );
    await notifier?.notify(existing.id, 'created');
    return {
      booking: publicAppointment(
        {
          ...existing,
          clientId: client.id,
          status: AppointmentStatus.CONFIRMED,
        },
        true,
      ),
      managementToken: token,
      managementUrl: url,
    };
  });

  app.post('/v1/public/booking/:token/payphone-link', async (request) => {
    enforceRateLimit(request, 'payphone-link', 10, 15 * 60_000);
    const { token } = tokenPathSchema.parse(request.params);
    const access = await requireManagedAppointment(database, token);
    assertActivePublicAppointment(access.appointment.status);
    return createPayphonePaymentLink(database, config, access.appointmentId);
  });
  app.get('/v1/public/booking/:token', async (request) => {
    enforceRateLimit(request, 'manage-booking', 90, 60_000);
    const { token } = tokenPathSchema.parse(request.params);
    const access = await requireManagedAppointment(database, token);
    return publicManagedAppointment(access.appointment);
  });

  app.post('/v1/public/booking/:token/confirm-attendance', async (request) => {
    enforceRateLimit(request, 'manage-booking', 30, 60_000);
    const { token } = tokenPathSchema.parse(request.params);
    const access = await requireManagedAppointment(database, token);
    assertActivePublicAppointment(access.appointment.status);
    const appointment = await database.appointment.update({
      data: {
        attendanceConfirmedAt: new Date(),
        status: AppointmentStatus.CONFIRMED,
      },
      include: {
        location: true,
        organization: true,
        professional: {
          include: { user: { select: { fullName: true } } },
        },
        review: { select: { comment: true, id: true, rating: true } },
        services: { orderBy: { sortOrder: 'asc' } },
      },
      where: { id: access.appointmentId },
    });
    return publicManagedAppointment(appointment);
  });

  app.post('/v1/public/booking/:token/cancel', async (request) => {
    enforceRateLimit(request, 'manage-booking', 20, 60_000);
    const { token } = tokenPathSchema.parse(request.params);
    const input = managePublicBookingCancellationSchema.parse(request.body);
    const access = await requireManagedAppointment(database, token);
    assertActivePublicAppointment(access.appointment.status);
    const cutoff = new Date(
      access.appointment.startsAt.getTime() -
        access.appointment.organization.bookingCancellationLeadMinutes * 60_000,
    );
    if (new Date() >= cutoff) {
      throw new ApiError(
        409,
        'PUBLIC_CANCELLATION_CUTOFF_REACHED',
        'Ya pasó el plazo de cancelación definido por el negocio.',
      );
    }
    const appointment = await database.appointment.update({
      data: {
        cancellationReason: input.reason || 'Cancelada por el cliente.',
        cancelledAt: new Date(),
        reservesSlot: false,
        status: AppointmentStatus.CANCELLED,
      },
      include: {
        location: true,
        organization: true,
        professional: {
          include: { user: { select: { fullName: true } } },
        },
        review: { select: { comment: true, id: true, rating: true } },
        services: { orderBy: { sortOrder: 'asc' } },
      },
      where: { id: access.appointmentId },
    });
    await notifier?.notify(appointment.id, 'cancelled');
    return publicManagedAppointment(appointment);
  });

  app.post('/v1/public/booking/:token/reschedule', async (request) => {
    enforceRateLimit(request, 'manage-booking', 30, 60_000);
    const { token } = tokenPathSchema.parse(request.params);
    const input = rescheduleAppointmentSchema.parse(request.body);
    const access = await requireManagedAppointment(database, token);
    assertActivePublicAppointment(access.appointment.status);
    if (
      await organizationSubscriptionIsReadOnly(
        database,
        access.appointment.organizationId,
      )
    )
      throw new ApiError(
        423,
        'PUBLIC_BOOKING_UNAVAILABLE',
        'Este negocio no está aceptando reprogramaciones por el momento.',
      );
    const cutoff = new Date(
      access.appointment.startsAt.getTime() -
        access.appointment.organization.bookingRescheduleLeadMinutes * 60_000,
    );
    if (new Date() >= cutoff) {
      throw new ApiError(
        409,
        'PUBLIC_RESCHEDULE_CUTOFF_REACHED',
        'Ya pasó el plazo de reprogramación definido por el negocio.',
      );
    }
    const startsAt = new Date(input.startsAt);
    const durationMinutes = access.appointment.services.reduce(
      (total, service) => total + service.durationMinutes,
      0,
    );
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    await assertBookable(database, {
      endsAt,
      ignoreAppointmentId: access.appointment.id,
      locationId: access.appointment.locationId,
      professionalMembershipId: access.appointment.professionalMembershipId,
      startsAt,
      timeZone: access.appointment.location.timezone,
    });
    try {
      const appointment = await database.appointment.update({
        data: {
          attendanceConfirmationDeadlineAt: null,
          attendanceConfirmationRequestedAt: null,
          attendanceConfirmedAt: new Date(),
          endsAt,
          reservesSlot: true,
          startsAt,
          status: AppointmentStatus.CONFIRMED,
        },
        include: {
          location: true,
          organization: true,
          professional: {
            include: { user: { select: { fullName: true } } },
          },
          review: { select: { comment: true, id: true, rating: true } },
          services: { orderBy: { sortOrder: 'asc' } },
        },
        where: { id: access.appointmentId },
      });
      await database.publicBookingAccess.update({
        data: {
          managementExpiresAt: new Date(
            endsAt.getTime() + MANAGEMENT_AFTER_END_MS,
          ),
        },
        where: { id: access.id },
      });
      await notifier?.notify(appointment.id, 'rescheduled');
      return publicManagedAppointment(appointment);
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

  app.post('/v1/public/booking/:token/review', async (request, reply) => {
    enforceRateLimit(request, 'review-booking', 10, 60_000);
    const { token } = tokenPathSchema.parse(request.params);
    const input = createAppointmentReviewSchema.parse(request.body);
    const access = await requireManagedAppointment(database, token);
    if (access.appointment.status !== AppointmentStatus.COMPLETED) {
      throw new ApiError(
        409,
        'REVIEW_REQUIRES_COMPLETED_APPOINTMENT',
        'Podrás dejar una reseña después de completar la cita.',
      );
    }
    const review = await database.appointmentReview.upsert({
      create: {
        appointmentId: access.appointment.id,
        clientName: access.appointment.clientName,
        comment: input.comment || null,
        locationId: access.appointment.locationId,
        organizationId: access.appointment.organizationId,
        professionalMembershipId: access.appointment.professionalMembershipId,
        rating: input.rating,
      },
      update: {
        comment: input.comment || null,
        isVisible: true,
        rating: input.rating,
      },
      where: { appointmentId: access.appointment.id },
    });
    return reply.code(201).send({ review });
  });

  app.get('/v1/booking-settings', async (request) => {
    const { user } = await authenticate(database, request);
    const membership = await requireBookingManager(database, user.id);
    assertCanConfigureBookings(membership.role);
    const organization = await database.organization.findUniqueOrThrow({
      where: { id: membership.organizationId },
    });
    return {
      cancellationLeadMinutes: organization.bookingCancellationLeadMinutes,
      confirmationDeadlineMinutes:
        organization.bookingConfirmationDeadlineMinutes,
      confirmationEnabled: organization.bookingConfirmationEnabled,
      policyText: organization.bookingPolicyText,
      policyVersion: organization.bookingPolicyVersion,
      reminderMinutes: organization.bookingReminderMinutes,
      rescheduleLeadMinutes: organization.bookingRescheduleLeadMinutes,
      unconfirmedAction: organization.bookingUnconfirmedAction.toLowerCase(),
    };
  });

  app.put('/v1/booking-settings', async (request) => {
    const { user } = await authenticate(database, request);
    const membership = await requireBookingManager(database, user.id);
    assertCanConfigureBookings(membership.role);
    const input = updateBookingSettingsSchema.parse(request.body);
    const previous = await database.organization.findUniqueOrThrow({
      where: { id: membership.organizationId },
    });
    const policyChanged = previous.bookingPolicyText !== input.policyText;
    const organization = await database.organization.update({
      data: {
        bookingCancellationLeadMinutes: input.cancellationLeadMinutes,
        bookingConfirmationDeadlineMinutes: input.confirmationDeadlineMinutes,
        bookingConfirmationEnabled: input.confirmationEnabled,
        bookingPolicyText: input.policyText,
        bookingPolicyVersion: policyChanged
          ? { increment: 1 }
          : previous.bookingPolicyVersion,
        bookingReminderMinutes: input.reminderMinutes,
        bookingRescheduleLeadMinutes: input.rescheduleLeadMinutes,
        bookingUnconfirmedAction:
          input.unconfirmedAction === 'cancel'
            ? UnconfirmedBookingAction.CANCEL
            : UnconfirmedBookingAction.KEEP,
      },
      where: { id: membership.organizationId },
    });
    return {
      cancellationLeadMinutes: organization.bookingCancellationLeadMinutes,
      confirmationDeadlineMinutes:
        organization.bookingConfirmationDeadlineMinutes,
      confirmationEnabled: organization.bookingConfirmationEnabled,
      policyText: organization.bookingPolicyText,
      policyVersion: organization.bookingPolicyVersion,
      reminderMinutes: organization.bookingReminderMinutes,
      rescheduleLeadMinutes: organization.bookingRescheduleLeadMinutes,
      unconfirmedAction: organization.bookingUnconfirmedAction.toLowerCase(),
    };
  });

  app.get('/v1/reviews', async (request) => {
    const { user } = await authenticate(database, request);
    const membership = await requireBookingManager(database, user.id);
    const reviews = await database.appointmentReview.findMany({
      include: {
        professional: { include: { user: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      where: {
        organizationId: membership.organizationId,
        ...(membership.role === MembershipRole.BARBER
          ? { professionalMembershipId: membership.id }
          : {}),
      },
    });
    return {
      reviews: reviews.map((review) => ({
        ...review,
        createdAt: review.createdAt.toISOString(),
        professionalName: review.professional.user.fullName,
        updatedAt: review.updatedAt.toISOString(),
      })),
    };
  });

  app.patch('/v1/reviews/:reviewId/visibility', async (request) => {
    const { user } = await authenticate(database, request);
    const membership = await requireBookingManager(database, user.id);
    if (membership.role === MembershipRole.RECEPTIONIST) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'No tienes permiso para ocultar reseñas.',
      );
    }
    const { reviewId } = reviewPathSchema.parse(request.params);
    const { isVisible } = z
      .object({ isVisible: z.boolean() })
      .parse(request.body);
    const review = await database.appointmentReview.findFirst({
      where: {
        id: reviewId,
        organizationId: membership.organizationId,
        ...(membership.role === MembershipRole.BARBER
          ? { professionalMembershipId: membership.id }
          : {}),
      },
    });
    if (!review) {
      throw new ApiError(404, 'REVIEW_NOT_FOUND', 'La reseña no existe.');
    }
    return {
      review: await database.appointmentReview.update({
        data: {
          hiddenAt: isVisible ? null : new Date(),
          hiddenByUserId: isVisible ? null : user.id,
          isVisible,
        },
        where: { id: review.id },
      }),
    };
  });
}

export type { PublicBookingMailer };
