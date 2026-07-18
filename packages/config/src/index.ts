export const supportedEnvironments = [
  'local',
  'preview',
  'staging',
  'production',
] as const;

export const productDefaults = {
  currencyCode: 'USD',
  locale: 'es-EC',
  timezone: 'America/Guayaquil',
} as const;
