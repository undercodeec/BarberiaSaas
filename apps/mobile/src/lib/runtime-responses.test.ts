import {
  MobileResponseValidationError,
  validateMobileApiResponse,
} from './runtime-responses';

describe('runtime API response validation', () => {
  it('accepts a valid session and rejects malformed expiry dates', () => {
    const valid = {
      session: { expiresAt: '2026-08-19T18:00:00.000Z' },
      user: {
        email: 'persona@example.com',
        fullName: 'Persona Prueba',
        id: 'user-1',
      },
    };
    expect(validateMobileApiResponse('/v1/auth/session', valid)).toEqual(valid);
    expect(() =>
      validateMobileApiResponse('/v1/auth/session', {
        ...valid,
        session: { expiresAt: 'fecha-invalida' },
      }),
    ).toThrow(MobileResponseValidationError);
  });

  it('rejects tenant responses without membership identity', () => {
    expect(() =>
      validateMobileApiResponse('/v1/organizations/current', {
        location: null,
        organization: {
          currencyCode: 'USD',
          defaultTimezone: 'America/Guayaquil',
          id: 'org-1',
          name: 'Nava',
          slug: 'nava',
        },
      }),
    ).toThrow('La respuesta del servidor no tiene el formato esperado.');
  });

  it('rejects non-integer financial values without exposing the payload', () => {
    let error: unknown;
    try {
      validateMobileApiResponse('/v1/cash-register/current', {
        session: {
          id: 'cash-1',
          openedAt: '2026-08-19T18:00:00.000Z',
          openingAmountCents: 10.5,
          responsibleName: 'Dato sensible',
          status: 'open',
        },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(MobileResponseValidationError);
    expect(String(error)).not.toContain('Dato sensible');
    expect((error as MobileResponseValidationError).code).toBe(
      'INVALID_API_RESPONSE',
    );
  });

  it('does not alter endpoints without a critical response schema', () => {
    const payload = { custom: true };
    expect(validateMobileApiResponse('/v1/other', payload)).toBe(payload);
  });
});
