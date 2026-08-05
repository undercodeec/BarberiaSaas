import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const androidMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const iosMapsApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY;
  const buildPlatform = process.env.EAS_BUILD_PLATFORM;

  if (process.env.EAS_BUILD === 'true') {
    if (buildPlatform === 'android' && !androidMapsApiKey)
      throw new Error(
        'GOOGLE_MAPS_ANDROID_API_KEY es obligatoria para compilar Android.',
      );
    if (buildPlatform === 'ios' && !iosMapsApiKey)
      throw new Error(
        'GOOGLE_MAPS_IOS_API_KEY es obligatoria para compilar iOS.',
      );
  }

  return {
    ...config,
    name: config.name ?? 'Barbería',
    plugins: [
      ...(config.plugins ?? []),
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
};
