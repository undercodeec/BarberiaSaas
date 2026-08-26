import { rawTimeZones, timeZonesNames } from '@vvo/tzdb';

export const DEFAULT_TIMEZONE = 'America/Guayaquil';

export const TIMEZONE_OPTIONS = rawTimeZones.map((timezone) => ({
  label: `${timezone.name} — ${timezone.mainCities[0] ?? timezone.countryName}`,
  value: timezone.name,
}));

export function detectTimezone(
  readDeviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const timezone = readDeviceZone();
  return timeZonesNames.includes(timezone) ? timezone : DEFAULT_TIMEZONE;
}
