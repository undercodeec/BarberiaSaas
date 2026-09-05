import type { PublicBookingCatalogV2 } from '@barber-saas/api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PublicBookingPage from './page';

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
    coverImageUrl: null,
    description: null,
    facebookUrl: null,
    id: 'organization-1',
    instagramUrl: null,
    name: 'Nava',
    profilePhotoUrl: null,
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
  professionals: [],
  products: [],
  reviews: [],
  services: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('PublicBookingPage', () => {
  it('solicita el catálogo público v2 de la organización y sucursal', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(catalog), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await PublicBookingPage({
      params: Promise.resolve({
        locationSlug: 'centro',
        organizationSlug: 'nava',
      }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/v2/public/nava/centro/catalog',
      { next: { revalidate: 60 } },
    );
  });
});
