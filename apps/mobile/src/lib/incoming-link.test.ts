import { sanitizeIncomingMobileLink } from './incoming-link';

describe('incoming mobile links', () => {
  const token = 'A_secure-token_'.padEnd(32, 'x');

  it.each([
    [
      `barbersaas://reset-password?token=${token}`,
      `/reset-password?token=${token}`,
    ],
    [
      `barbersaas://accept-invitation?token=${token}`,
      `/accept-invitation?token=${token}`,
    ],
    [
      `https://reservas.navacloud.app/reset-password?token=${token}`,
      `/reset-password?token=${token}`,
    ],
    [`/accept-invitation?token=${token}`, `/accept-invitation?token=${token}`],
  ])('maps an allowed external link to a closed route', (input, expected) => {
    expect(sanitizeIncomingMobileLink(input)).toBe(expected);
  });

  it.each([
    'barbersaas://settings',
    'barbersaas://reset-password?token=corto',
    `https://evil.example/reset-password?token=${token}`,
    `https://reservas.navacloud.app/dashboard?token=${token}`,
    '/cash-register',
    'not a url',
  ])('sends an untrusted route to the safe entry screen', (input) => {
    expect(sanitizeIncomingMobileLink(input)).toBe('/');
  });

  it('allows the Expo development client only outside production', () => {
    const developmentUrl =
      'exp+barber-saas-mobile://expo-development-client/?url=http%3A%2F%2Flocalhost';
    expect(sanitizeIncomingMobileLink(developmentUrl, true)).toBe(
      developmentUrl,
    );
    expect(sanitizeIncomingMobileLink(developmentUrl, false)).toBe('/');
  });
});
