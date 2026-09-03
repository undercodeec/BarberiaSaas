import type { ConfigContext, ExpoConfig } from 'expo/config';

export type MobileAppEnvironment =
  'local' | 'preview' | 'production' | 'staging';

const RELEASE_ENVIRONMENTS = new Set<MobileAppEnvironment>([
  'preview',
  'production',
  'staging',
]);

export function parseMobileAppEnvironment(
  value: string | undefined,
  productionBuild: boolean,
): MobileAppEnvironment {
  const environment = value ?? (productionBuild ? 'production' : 'local');
  if (
    environment !== 'local' &&
    environment !== 'preview' &&
    environment !== 'staging' &&
    environment !== 'production'
  ) {
    throw new Error(`Entorno mobile no valido: ${environment}.`);
  }
  return environment;
}

export function assertSecureMobileApiConfiguration(input: {
  readonly allowedHosts: string | undefined;
  readonly environment: MobileAppEnvironment;
  readonly url: string | undefined;
}) {
  if (!input.url) {
    throw new Error('EXPO_PUBLIC_API_URL es obligatoria.');
  }

  const apiUrl = new URL(input.url);
  if (!RELEASE_ENVIRONMENTS.has(input.environment)) return apiUrl.toString();

  if (apiUrl.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_API_URL debe usar HTTPS en builds mobile.');
  }

  const allowedHosts = (input.allowedHosts ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (!allowedHosts.length) {
    throw new Error(
      'EXPO_PUBLIC_API_ALLOWED_HOSTS es obligatoria en builds mobile.',
    );
  }
  if (!allowedHosts.includes(apiUrl.hostname.toLowerCase())) {
    throw new Error('El host de EXPO_PUBLIC_API_URL no esta permitido.');
  }

  return apiUrl.toString();
}

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const androidMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const iosMapsApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY;
  const environment = parseMobileAppEnvironment(
    process.env.EXPO_PUBLIC_APP_ENV,
    process.env.NODE_ENV === 'production',
  );
  // EAS first resolves only the static project metadata to discover which
  // remote environment to load. It deliberately disables dotenv in that
  // bootstrap pass, so validating required release variables here would make
  // the project impossible to resolve. Once EAS loads the selected environment
  // (and in every regular/local build), the full validation remains mandatory.
  const isEasEnvironmentBootstrap =
    Object.prototype.hasOwnProperty.call(process.env, 'EXPO_NO_DOTENV') &&
    !process.env.EXPO_PUBLIC_API_URL &&
    !process.env.EXPO_PUBLIC_API_ALLOWED_HOSTS;
  if (!isEasEnvironmentBootstrap) {
    assertSecureMobileApiConfiguration({
      allowedHosts: process.env.EXPO_PUBLIC_API_ALLOWED_HOSTS,
      environment,
      url: process.env.EXPO_PUBLIC_API_URL,
    });
  }

  return {
    ...config,
    extra: {
      ...config.extra,
      appEnvironment: environment,
      googleMaps: {
        nativeEnabled: Boolean(androidMapsApiKey || iosMapsApiKey),
      },
    },
    name: config.name ?? 'Nava',
    plugins: [
      ...(config.plugins ?? []),
      'expo-asset',
      'expo-font',
      'expo-secure-store',
      'expo-sharing',
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Permite que Nava use tu ubicación para colocar el negocio en el mapa.',
        },
      ],
      [
        'react-native-maps',
        {
          ...(androidMapsApiKey
            ? { androidGoogleMapsApiKey: androidMapsApiKey }
            : {}),
          ...(iosMapsApiKey ? { iosGoogleMapsApiKey: iosMapsApiKey } : {}),
        },
      ],
    ],
    slug: config.slug ?? 'barber-saas-mobile',
  };
}
