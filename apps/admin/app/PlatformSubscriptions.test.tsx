import { describe, expect, it } from 'vitest';

import { formatSubscriptionDate } from './subscription-format';

describe('formatSubscriptionDate', () => {
  it('formats subscription instants in their commercial timezone', () => {
    expect(
      formatSubscriptionDate('2026-08-26T21:15:00.000Z', 'America/Lima'),
    ).toContain('4:15');
  });
});
