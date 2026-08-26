import { describe, expect, it } from 'vitest';

import {
  formatPhoneNumber,
  getRegistrationCountryOptions,
  validateRegistrationBeforeSubmit,
} from './registration';

describe('commercial registration helpers', () => {
  it('exposes Ecuador as a selectable country with its calling code', () => {
    expect(getRegistrationCountryOptions()).toContainEqual({
      code: 'EC',
      dial: '+593',
      name: 'Ecuador',
    });
  });

  it('formats the local phone number with the country selected by the user', () => {
    expect(formatPhoneNumber('EC', '099 123 4567')).toBe('+5930991234567');
  });

  it('prevents registration until the privacy policy is accepted', () => {
    expect(validateRegistrationBeforeSubmit(false)).toBe(
      'Debes aceptar la Política de Privacidad para crear tu cuenta.',
    );
  });
});
