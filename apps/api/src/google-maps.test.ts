import { describe, expect, it, vi } from 'vitest';

import { createGoogleMapsClient } from './google-maps';

describe('cliente seguro de Google Maps', () => {
  it('normaliza sugerencias, detalles y geocodificación inversa', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            suggestions: [
              {
                placePrediction: {
                  placeId: 'place-1',
                  structuredFormat: {
                    mainText: { text: 'Nava Barbería' },
                    secondaryText: { text: 'Quito, Ecuador' },
                  },
                  text: { text: 'Nava Barbería, Quito, Ecuador' },
                },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            addressComponents: [
              { longText: 'Quito', types: ['locality'] },
              { shortText: 'EC', types: ['country'] },
            ],
            displayName: { text: 'Nava Barbería' },
            formattedAddress: 'Av. República, Quito, Ecuador',
            id: 'place-1',
            location: { latitude: -0.19, longitude: -78.49 },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                address_components: [
                  { long_name: 'Quito', types: ['locality'] },
                  { short_name: 'EC', types: ['country'] },
                ],
                formatted_address: 'Av. República, Quito, Ecuador',
                geometry: { location: { lat: -0.19, lng: -78.49 } },
                place_id: 'place-1',
              },
            ],
            status: 'OK',
          }),
        ),
      );
    const client = createGoogleMapsClient({
      apiKey: 'server-key',
      fetchImplementation,
    });

    await expect(
      client.autocomplete({
        countryCode: 'EC',
        latitude: -0.19,
        longitude: -78.49,
        query: 'Nava',
        sessionToken: 'session-token-123456',
      }),
    ).resolves.toEqual([
      {
        mainText: 'Nava Barbería',
        placeId: 'place-1',
        secondaryText: 'Quito, Ecuador',
        text: 'Nava Barbería, Quito, Ecuador',
      },
    ]);
    await expect(
      client.placeDetails('place-1', 'session-token-123456'),
    ).resolves.toMatchObject({
      city: 'Quito',
      countryCode: 'EC',
      latitude: -0.19,
      longitude: -78.49,
      placeId: 'place-1',
    });
    await expect(client.reverseGeocode(-0.19, -78.49)).resolves.toMatchObject({
      city: 'Quito',
      countryCode: 'EC',
      formattedAddress: 'Av. República, Quito, Ecuador',
      placeId: 'place-1',
    });

    const autocompleteRequest = fetchImplementation.mock.calls[0];
    expect(autocompleteRequest?.[0]).toBe(
      'https://places.googleapis.com/v1/places:autocomplete',
    );
    expect(autocompleteRequest?.[1]?.headers).toMatchObject({
      'x-goog-api-key': 'server-key',
    });
  });

  it('no permite consultar si la clave del servidor no está configurada', async () => {
    const client = createGoogleMapsClient({
      fetchImplementation: vi.fn<typeof fetch>(),
    });
    await expect(
      client.autocomplete({
        countryCode: 'EC',
        query: 'Nava',
        sessionToken: 'session-token-123456',
      }),
    ).rejects.toMatchObject({ code: 'GOOGLE_MAPS_NOT_CONFIGURED' });
  });

  it('reports an upstream error when Geocoding denies the request', async () => {
    const client = createGoogleMapsClient({
      apiKey: 'server-key',
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ status: 'REQUEST_DENIED' })),
      ),
    });
    await expect(client.reverseGeocode(-0.1807, -78.4678)).rejects.toMatchObject({
      code: 'GOOGLE_MAPS_UPSTREAM_ERROR',
      statusCode: 502,
    });
  });
});
