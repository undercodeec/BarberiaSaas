import { Country } from 'country-state-city';

export type RegistrationCountry = {
  readonly code: string;
  readonly dial: string;
  readonly name: string;
};

export function getRegistrationCountryOptions(): readonly RegistrationCountry[] {
  return Country.getAllCountries()
    .filter((country) => country.phonecode)
    .map((country) => ({
      code: country.isoCode,
      dial: `+${country.phonecode.replace(/\D/gu, '')}`,
      name: country.name,
    }))
    .sort((first, second) => first.name.localeCompare(second.name, 'es'));
}

export function formatPhoneNumber(countryCode: string, phone: string) {
  const country = getRegistrationCountryOptions().find(
    (option) => option.code === countryCode,
  );
  return `${country?.dial ?? ''}${phone.replace(/\D/gu, '')}`;
}

export function validateRegistrationBeforeSubmit(
  privacyPolicyAccepted: boolean,
) {
  return privacyPolicyAccepted
    ? null
    : 'Debes aceptar la Política de Privacidad para crear tu cuenta.';
}
