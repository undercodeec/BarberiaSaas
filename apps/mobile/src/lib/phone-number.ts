import {
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';

function asCountryCode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{2}$/u.test(normalized)
    ? (normalized as CountryCode)
    : undefined;
}

export function phoneNumberToE164(
  value: string | null | undefined,
  defaultCountryCode?: string | null,
) {
  const phoneNumber = parsePhoneNumberFromString(
    value?.trim() ?? '',
    asCountryCode(defaultCountryCode),
  );

  return phoneNumber?.isValid() ? phoneNumber.number : null;
}
