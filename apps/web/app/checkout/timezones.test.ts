import { describe, expect, it } from 'vitest';

import { detectTimezone } from './timezones';

describe('detectTimezone', () => {
  it('uses a valid device IANA timezone', () => {
    expect(detectTimezone(() => 'Europe/Madrid')).toBe('Europe/Madrid');
  });

  it('falls back deterministically for an invalid timezone', () => {
    expect(detectTimezone(() => 'Invalid/Zone')).toBe('America/Guayaquil');
  });
});
