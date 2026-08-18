module.exports = ({ config }) => {
  const androidMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const iosMapsApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY;
  return {
    ...config,
    name: config.name ?? 'Nava',
    plugins: [
      ...(config.plugins ?? []),
      'expo-font',
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
    extra: {
      ...(config.extra ?? {}),
      googleMaps: {
        nativeEnabled: Boolean(androidMapsApiKey || iosMapsApiKey),
      },
    },
  };
};
