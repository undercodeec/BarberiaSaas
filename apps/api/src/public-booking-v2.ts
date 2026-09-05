import {
  MembershipRole,
  MembershipStatus,
  SubscriptionStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import {
  calculatePublicAvailability,
  enforceRateLimit,
  publicAvailabilitySchema,
  publicPathSchema,
  requirePublicLocation,
} from './public-booking';
import { ApiError } from './errors';
import { decodeDataUri, sendMedia } from './media-response';
import { getAllowedProfessionalIds, getSubscriptionUsage } from './subscription-policy';

const publicMediaPathSchema = publicPathSchema.extend({
  asset: z.enum([
    'organization-cover',
    'organization-profile',
    'product',
    'professional',
    'service',
  ]),
  assetId: z.uuid(),
});

function mediaUrl(
  organizationSlug: string,
  locationSlug: string,
  asset: z.infer<typeof publicMediaPathSchema>['asset'],
  assetId: string,
) {
  return `/v2/public/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(locationSlug)}/media/${asset}/${assetId}`;
}

async function publicCatalogV2(
  database: DatabaseClient,
  organizationSlug: string,
  locationSlug: string,
) {
  const location = await requirePublicLocation(
    database,
    organizationSlug,
    locationSlug,
  );
  const [subscriptionUsage, allowedProfessionalIds] = await Promise.all([
    getSubscriptionUsage(database, location.organizationId),
    getAllowedProfessionalIds(database, location.organizationId),
  ]);
  const [assignments, reviews, products, ownerMembership] = await Promise.all([
    database.professionalService.findMany({
      select: {
        customDurationMinutes: true,
        customPriceCents: true,
        membership: {
          select: {
            id: true,
            user: { select: { fullName: true, profileBio: true } },
          },
        },
        membershipId: true,
        service: {
          select: {
            category: { select: { name: true } },
            description: true,
            durationMinutes: true,
            id: true,
            name: true,
            priceCents: true,
          },
        },
        serviceId: true,
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
        inventory: {
          select: { quantityOnHand: true, quantityReserved: true },
          where: { locationId: location.id },
        },
        name: true,
        salePriceCents: true,
        stockTrackingEnabled: true,
      },
      take: 100,
      where: { isActive: true, organizationId: location.organizationId },
    }),
    database.membership.findFirst({
      select: {
        user: {
          select: {
            profileBio: true,
            registrationProfile: {
              select: { facebookUrl: true, instagramUrl: true },
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
  const serviceIds = [...new Set(assignments.map(({ serviceId }) => serviceId))];
  const membershipIds = [
    ...new Set(assignments.map(({ membershipId }) => membershipId)),
  ];
  const productIds = products.map(({ id }) => id);
  const [servicesWithImages, productsWithImages, professionalsWithPhotos, ownerWithPhoto, ownerWithCover] =
    await Promise.all([
      database.service.findMany({
        select: { id: true },
        where: {
          id: { in: serviceIds },
          imageData: { not: null },
        },
      }),
      database.product.findMany({
        select: { id: true },
        where: {
          id: { in: productIds },
          imageData: { not: null },
        },
      }),
      database.membership.findMany({
        select: { id: true },
        where: {
          id: { in: membershipIds },
          user: { profilePhotoData: { not: null } },
        },
      }),
      database.membership.findFirst({
        select: { id: true },
        where: {
          organizationId: location.organizationId,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
          user: { profilePhotoData: { not: null } },
        },
      }),
      database.userRegistrationProfile.findFirst({
        select: { userId: true },
        where: {
          coverImageUri: { not: null },
          user: {
            memberships: {
              some: {
                organizationId: location.organizationId,
                role: MembershipRole.OWNER,
                status: MembershipStatus.ACTIVE,
              },
            },
          },
        },
      }),
    ]);
  const serviceImageIds = new Set(servicesWithImages.map(({ id }) => id));
  const productImageIds = new Set(productsWithImages.map(({ id }) => id));
  const professionalPhotoIds = new Set(
    professionalsWithPhotos.map(({ id }) => id),
  );
  const professionalMap = new Map<
    string,
    { bio: string | null; id: string; name: string; serviceIds: string[] }
  >();
  const serviceMap = new Map<
    string,
    {
      category: string | null;
      description: string | null;
      durationMinutes: number;
      id: string;
      name: string;
      priceCents: number;
    }
  >();
  for (const assignment of assignments) {
    const professional = professionalMap.get(assignment.membershipId) ?? {
      bio: assignment.membership.user.profileBio,
      id: assignment.membership.id,
      name: assignment.membership.user.fullName,
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
      name: assignment.service.name,
      priceCents: assignment.customPriceCents ?? assignment.service.priceCents,
    });
  }
  const organizationId = location.organization.id;
  return {
    bookingAvailability: {
      canCreate:
        subscriptionUsage.subscription.status !== SubscriptionStatus.SUSPENDED &&
        subscriptionUsage.subscription.status !== SubscriptionStatus.CANCELLED &&
        (subscriptionUsage.effectiveBookingLimit === null ||
          subscriptionUsage.usage.rolling30DayBookings <
            subscriptionUsage.effectiveBookingLimit),
      message:
        subscriptionUsage.subscription.status === SubscriptionStatus.SUSPENDED ||
        subscriptionUsage.subscription.status === SubscriptionStatus.CANCELLED ||
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
      coverImageUrl: ownerWithCover
        ? mediaUrl(organizationSlug, locationSlug, 'organization-cover', organizationId)
        : null,
      description: ownerMembership?.user.profileBio ?? null,
      facebookUrl:
        ownerMembership?.user.registrationProfile?.facebookUrl ?? null,
      id: organizationId,
      instagramUrl:
        ownerMembership?.user.registrationProfile?.instagramUrl ?? null,
      name: location.organization.name,
      profilePhotoUrl: ownerWithPhoto
        ? mediaUrl(organizationSlug, locationSlug, 'organization-profile', organizationId)
        : null,
      slug: location.organization.slug,
    },
    policy: {
      cancellationLeadMinutes: location.organization.bookingCancellationLeadMinutes,
      confirmationDeadlineMinutes:
        location.organization.bookingConfirmationDeadlineMinutes,
      confirmationEnabled: location.organization.bookingConfirmationEnabled,
      policyText: location.organization.bookingPolicyText,
      policyVersion: location.organization.bookingPolicyVersion,
      reminderMinutes: location.organization.bookingReminderMinutes,
      rescheduleLeadMinutes: location.organization.bookingRescheduleLeadMinutes,
      servicePaymentConfirmationEnabled:
        location.organization.servicePaymentConfirmationEnabled,
      unconfirmedAction: location.organization.bookingUnconfirmedAction.toLowerCase(),
    },
    professionals: [...professionalMap.values()].map((professional) => ({
      ...professional,
      photoUrl: professionalPhotoIds.has(professional.id)
        ? mediaUrl(organizationSlug, locationSlug, 'professional', professional.id)
        : null,
    })),
    products: products.map((product) => ({
      id: product.id,
      imageUrl: productImageIds.has(product.id)
        ? mediaUrl(organizationSlug, locationSlug, 'product', product.id)
        : null,
      isAvailable:
        !product.stockTrackingEnabled ||
        (product.inventory[0]?.quantityOnHand ?? 0) -
          (product.inventory[0]?.quantityReserved ?? 0) >
          0,
      name: product.name,
      priceCents: product.salePriceCents,
    })),
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
    services: [...serviceMap.values()].map((service) => ({
      ...service,
      imageUrl: serviceImageIds.has(service.id)
        ? mediaUrl(organizationSlug, locationSlug, 'service', service.id)
        : null,
    })),
  };
}

async function publicMedia(
  database: DatabaseClient,
  input: z.infer<typeof publicMediaPathSchema>,
  reply: FastifyReply,
) {
  const location = await requirePublicLocation(
    database,
    input.organizationSlug,
    input.locationSlug,
  );
  let imageData: string | null = null;
  if (input.asset === 'service') {
    imageData = (await database.service.findFirst({
      select: { imageData: true },
      where: { id: input.assetId, organizationId: location.organizationId },
    }))?.imageData ?? null;
  } else if (input.asset === 'product') {
    imageData = (await database.product.findFirst({
      select: { imageData: true },
      where: { id: input.assetId, isActive: true, organizationId: location.organizationId },
    }))?.imageData ?? null;
  } else if (input.asset === 'professional') {
    imageData = (await database.membership.findFirst({
      select: { user: { select: { profilePhotoData: true } } },
      where: {
        id: input.assetId,
        organizationId: location.organizationId,
        memberLocations: {
          some: { locationId: location.id, onlineBookingEnabled: true },
        },
        status: MembershipStatus.ACTIVE,
      },
    }))?.user.profilePhotoData ?? null;
  } else {
    if (input.assetId !== location.organizationId)
      throw new ApiError(404, 'MEDIA_NOT_FOUND', 'La imagen no estÃ¡ disponible.');
    const owner = await database.membership.findFirst({
      select: {
        user: {
          select: {
            profilePhotoData: true,
            registrationProfile: { select: { coverImageUri: true } },
          },
        },
      },
      where: {
        organizationId: location.organizationId,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    imageData =
      input.asset === 'organization-cover'
        ? owner?.user.registrationProfile?.coverImageUri ?? null
        : owner?.user.profilePhotoData ?? null;
  }
  if (!imageData)
    throw new ApiError(404, 'MEDIA_NOT_FOUND', 'La imagen no estÃ¡ disponible.');
  if (/^https?:\/\//iu.test(imageData)) return reply.redirect(imageData);
  return sendMedia(reply, decodeDataUri(imageData), 'public');
}

export function registerPublicBookingV2Routes(
  app: FastifyInstance,
  database: DatabaseClient,
): void {
  const catalogCache = new Map<
    string,
    { readonly expiresAt: number; readonly value: Awaited<ReturnType<typeof publicCatalogV2>> }
  >();
  const catalogLoads = new Map<
    string,
    Promise<Awaited<ReturnType<typeof publicCatalogV2>>>
  >();
  app.get('/v2/public/:organizationSlug/:locationSlug/catalog', async (request, reply) => {
    enforceRateLimit(request, 'catalog-v2', 120, 60_000);
    const input = publicPathSchema.parse(request.params);
    const key = `${input.organizationSlug}:${input.locationSlug}`;
    const cached = catalogCache.get(key);
    const now = Date.now();
    reply.header('cache-control', 'public, max-age=60, stale-while-revalidate=300');
    if (cached && cached.expiresAt > now) return cached.value;
    const pending = catalogLoads.get(key);
    if (pending) return pending;
    const load = publicCatalogV2(
      database,
      input.organizationSlug,
      input.locationSlug,
    ).then((value) => {
      catalogCache.set(key, { expiresAt: Date.now() + 60_000, value });
      return value;
    });
    catalogLoads.set(key, load);
    try {
      return await load;
    } finally {
      catalogLoads.delete(key);
    }
  });

  app.get('/v2/public/:organizationSlug/:locationSlug/availability', async (request) => {
    enforceRateLimit(request, 'availability-v2', 90, 60_000);
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
  });

  app.get('/v2/public/:organizationSlug/:locationSlug/media/:asset/:assetId', async (request, reply) => {
    enforceRateLimit(request, 'media-v2', 240, 60_000);
    return publicMedia(database, publicMediaPathSchema.parse(request.params), reply);
  });
}
