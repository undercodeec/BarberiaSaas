import { ApiError } from './errors';

export interface GoogleMapsLocationCandidate {
  readonly city: string | null;
  readonly countryCode: string | null;
  readonly displayName: string | null;
  readonly formattedAddress: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly placeId: string;
}

export interface GoogleMapsSuggestion {
  readonly mainText: string;
  readonly placeId: string;
  readonly secondaryText: string;
  readonly text: string;
}

interface AddressComponent {
  readonly longText?: string;
  readonly long_name?: string;
  readonly shortText?: string;
  readonly short_name?: string;
  readonly types?: readonly string[];
}

interface GoogleMapsClientOptions {
  readonly apiKey?: string | undefined;
  readonly fetchImplementation?: typeof fetch | undefined;
}

function addressPart(
  components: readonly AddressComponent[] | undefined,
  type: string,
  short = false,
) {
  const component = components?.find((item) => item.types?.includes(type));
  if (!component) return null;
  return short
    ? (component.shortText ?? component.short_name ?? null)
    : (component.longText ?? component.long_name ?? null);
}

function normalizedCandidate(input: {
  readonly addressComponents?: readonly AddressComponent[] | undefined;
  readonly displayName?: { readonly text?: string };
  readonly formattedAddress?: string;
  readonly id?: string;
  readonly location?: {
    readonly latitude?: number;
    readonly longitude?: number;
  };
}): GoogleMapsLocationCandidate {
  const latitude = input.location?.latitude;
  const longitude = input.location?.longitude;
  if (
    !input.id ||
    !input.formattedAddress ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number'
  )
    throw new ApiError(
      502,
      'GOOGLE_MAPS_INVALID_RESPONSE',
      'Google Maps devolvió una ubicación incompleta.',
    );
  return {
    city:
      addressPart(input.addressComponents, 'locality') ??
      addressPart(input.addressComponents, 'administrative_area_level_2'),
    countryCode: addressPart(input.addressComponents, 'country', true),
    displayName: input.displayName?.text ?? null,
    formattedAddress: input.formattedAddress,
    latitude,
    longitude,
    placeId: input.id,
  };
}

export function createGoogleMapsClient({
  apiKey,
  fetchImplementation = fetch,
}: GoogleMapsClientOptions) {
  const requireApiKey = () => {
    if (!apiKey)
      throw new ApiError(
        503,
        'GOOGLE_MAPS_NOT_CONFIGURED',
        'La búsqueda de Google Maps todavía no está configurada.',
      );
    return apiKey;
  };

  const requestJson = async <T>(
    url: string,
    init?: RequestInit,
  ): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImplementation(url, {
        ...init,
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new ApiError(
        502,
        'GOOGLE_MAPS_UNAVAILABLE',
        'Google Maps no está disponible temporalmente.',
      );
    }
    if (!response.ok)
      throw new ApiError(
        502,
        'GOOGLE_MAPS_UPSTREAM_ERROR',
        'Google Maps rechazó temporalmente la consulta.',
      );
    return (await response.json()) as T;
  };

  return {
    async autocomplete(input: {
      readonly countryCode: string;
      readonly latitude?: number | undefined;
      readonly longitude?: number | undefined;
      readonly query: string;
      readonly sessionToken: string;
    }): Promise<readonly GoogleMapsSuggestion[]> {
      const result = await requestJson<{
        readonly suggestions?: readonly {
          readonly placePrediction?: {
            readonly placeId?: string;
            readonly structuredFormat?: {
              readonly mainText?: { readonly text?: string };
              readonly secondaryText?: { readonly text?: string };
            };
            readonly text?: { readonly text?: string };
          };
        }[];
      }>('https://places.googleapis.com/v1/places:autocomplete', {
        body: JSON.stringify({
          includedRegionCodes: [input.countryCode.toLowerCase()],
          input: input.query,
          languageCode: 'es',
          regionCode: input.countryCode.toLowerCase(),
          sessionToken: input.sessionToken,
          ...(input.latitude !== undefined && input.longitude !== undefined
            ? {
                locationBias: {
                  circle: {
                    center: {
                      latitude: input.latitude,
                      longitude: input.longitude,
                    },
                    radius: 50_000,
                  },
                },
              }
            : {}),
        }),
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': requireApiKey(),
          'x-goog-fieldmask':
            'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text',
        },
        method: 'POST',
      });
      return (result.suggestions ?? []).flatMap(({ placePrediction }) => {
        const placeId = placePrediction?.placeId;
        const text = placePrediction?.text?.text;
        if (!placeId || !text) return [];
        return [
          {
            mainText: placePrediction.structuredFormat?.mainText?.text ?? text,
            placeId,
            secondaryText:
              placePrediction.structuredFormat?.secondaryText?.text ?? '',
            text,
          },
        ];
      });
    },

    async placeDetails(
      placeId: string,
      sessionToken: string,
    ): Promise<GoogleMapsLocationCandidate> {
      const search = new URLSearchParams({ languageCode: 'es', sessionToken });
      const result = await requestJson<{
        readonly addressComponents?: readonly AddressComponent[];
        readonly displayName?: { readonly text?: string };
        readonly formattedAddress?: string;
        readonly id?: string;
        readonly location?: {
          readonly latitude?: number;
          readonly longitude?: number;
        };
      }>(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${search.toString()}`,
        {
          headers: {
            'x-goog-api-key': requireApiKey(),
            'x-goog-fieldmask':
              'id,displayName,formattedAddress,location,addressComponents',
          },
        },
      );
      return normalizedCandidate(result);
    },

    async reverseGeocode(
      latitude: number,
      longitude: number,
    ): Promise<GoogleMapsLocationCandidate> {
      const search = new URLSearchParams({
        key: requireApiKey(),
        language: 'es',
        latlng: `${latitude},${longitude}`,
      });
      const result = await requestJson<{
        readonly results?: readonly {
          readonly address_components?: readonly AddressComponent[];
          readonly formatted_address?: string;
          readonly geometry?: {
            readonly location?: {
              readonly lat?: number;
              readonly lng?: number;
            };
          };
          readonly place_id?: string;
        }[];
        readonly status?: string;
      }>(
        `https://maps.googleapis.com/maps/api/geocode/json?${search.toString()}`,
      );
      if (result.status && result.status !== 'OK')
        throw new ApiError(
          502,
          'GOOGLE_MAPS_UPSTREAM_ERROR',
          'Google Maps no pudo validar esta ubicacion. Intentalo nuevamente.',
        );
      const first = result.results?.[0];
      if (!first?.place_id || !first.formatted_address)
        throw new ApiError(
          404,
          'GOOGLE_MAPS_ADDRESS_NOT_FOUND',
          'No encontramos una dirección para esa ubicación.',
        );
      return normalizedCandidate({
        addressComponents: first.address_components,
        formattedAddress: first.formatted_address,
        id: first.place_id,
        location: {
          latitude: first.geometry?.location?.lat ?? latitude,
          longitude: first.geometry?.location?.lng ?? longitude,
        },
      });
    },
  };
}

export type GoogleMapsClient = ReturnType<typeof createGoogleMapsClient>;
