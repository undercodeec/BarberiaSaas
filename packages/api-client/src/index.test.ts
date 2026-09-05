import { describe, expect, it, vi } from 'vitest';

import {
  createApiClient,
  type ClientPageResponse,
  type CursorPage,
  type InventoryProductsPageResponse,
  type PublicBookingCatalogV2,
} from './index';

const clientPage: CursorPage<ClientPageResponse['items'][number]> = {
  items: [],
  nextCursor: null,
};
const inventoryPage: InventoryProductsPageResponse = {
  accessibleLocations: [],
  currencyCode: 'USD',
  items: [
    {
      costCents: 600,
      currencyCode: 'USD',
      id: 'product-1',
      imageUrl: '/v2/inventory/products/product-1/image',
      isActive: true,
      isLowStock: false,
      minimumStock: 0,
      name: 'Cera',
      quantityOnHand: 2,
      salePriceCents: 1200,
      sku: 'CERA-1',
      stockTrackingEnabled: true,
    },
  ],
  locationId: 'location-1',
  nextCursor: null,
  summary: null,
};
const publicCatalog: PublicBookingCatalogV2 = {
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
    policyText: 'Cancela o reprograma dentro del plazo informado.',
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

void clientPage;
void inventoryPage;
void publicCatalog;

describe('createApiClient', () => {
  it('normaliza la URL y devuelve una respuesta tipada', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ready: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    const client = createApiClient({
      baseUrl: 'https://example.test/',
      fetchImplementation,
    });

    await expect(
      client.request<{ ready: boolean }>('/health'),
    ).resolves.toEqual({ ready: true });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://example.test/health',
      expect.any(Object),
    );
  });

  it('adjunta la sesión y conserva el error del backend', async () => {
    const onAuthenticationFailure = vi.fn();
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'INVALID_SESSION',
          message: 'Sesión vencida.',
        }),
        { status: 401 },
      ),
    );
    const client = createApiClient({
      baseUrl: 'https://example.test',
      fetchImplementation,
      getAccessToken: async () => 'token-secreto',
      onAuthenticationFailure,
    });

    await expect(client.request('/private')).rejects.toMatchObject({
      code: 'INVALID_SESSION',
      message: 'Sesión vencida.',
      statusCode: 401,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://example.test/private',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer token-secreto',
        }),
      }),
    );
    expect(onAuthenticationFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_SESSION', statusCode: 401 }),
    );
  });
});
