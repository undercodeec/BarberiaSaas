import type { PublicBookingCatalogV2 } from '@barber-saas/api-client';
import { describe, expect, it } from 'vitest';

import { proxyCatalogMediaUrls } from './catalog-media';

const catalog: PublicBookingCatalogV2 = {
  bookingAvailability: { canCreate: true, message: null },
  location: {
    addressLine: null,
    city: 'Quito',
    countryCode: 'EC',
    currencyCode: 'USD',
    email: null,
    formattedAddress: null,
    googlePlaceId: null,
    id: 'location-1',
    latitude: null,
    longitude: null,
    name: 'Centro',
    phone: '+593999999999',
    slug: 'centro',
    timezone: 'America/Guayaquil',
  },
  organization: {
    coverImageUrl:
      '/v2/public/nava/centro/media/organization-cover/organization-1',
    description: null,
    facebookUrl: null,
    id: 'organization-1',
    instagramUrl: null,
    name: 'Nava',
    profilePhotoUrl:
      '/v2/public/nava/centro/media/organization-profile/organization-1',
    slug: 'nava',
  },
  policy: {
    cancellationLeadMinutes: 60,
    confirmationDeadlineMinutes: 60,
    confirmationEnabled: false,
    policyText: 'Cancela dentro del plazo informado.',
    policyVersion: 1,
    reminderMinutes: 60,
    rescheduleLeadMinutes: 60,
    servicePaymentConfirmationEnabled: false,
    unconfirmedAction: 'cancel',
  },
  professionals: [
    {
      bio: null,
      id: 'professional-1',
      name: 'Ana',
      photoUrl: '/v2/public/nava/centro/media/professional/professional-1',
      serviceIds: ['service-1'],
    },
  ],
  products: [
    {
      id: 'product-1',
      imageUrl: 'https://cdn.example.test/product.jpg',
      isAvailable: true,
      name: 'Cera',
      priceCents: 1200,
    },
  ],
  reviews: [],
  services: [
    {
      category: null,
      description: null,
      durationMinutes: 30,
      id: 'service-1',
      imageUrl: '/v2/public/nava/centro/media/service/service-1',
      name: 'Corte',
      priceCents: 1500,
    },
  ],
};

describe('proxyCatalogMediaUrls', () => {
  it('envía las rutas relativas de medios v2 al proxy público web', () => {
    const result = proxyCatalogMediaUrls(catalog, '/api/public-proxy');

    expect(result.organization.coverImageUrl).toBe(
      '/api/public-proxy/v2/public/nava/centro/media/organization-cover/organization-1',
    );
    expect(result.organization.profilePhotoUrl).toBe(
      '/api/public-proxy/v2/public/nava/centro/media/organization-profile/organization-1',
    );
    expect(result.professionals[0]?.photoUrl).toBe(
      '/api/public-proxy/v2/public/nava/centro/media/professional/professional-1',
    );
    expect(result.services[0]?.imageUrl).toBe(
      '/api/public-proxy/v2/public/nava/centro/media/service/service-1',
    );
    expect(result.products[0]?.imageUrl).toBe(
      'https://cdn.example.test/product.jpg',
    );
  });
});
