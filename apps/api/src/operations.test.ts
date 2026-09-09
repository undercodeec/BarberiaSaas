import { describe, expect, it } from 'vitest';

import { trialExtensionPlanId } from './operations';

describe('trialExtensionPlanId', () => {
  it('restaura Nava Local para una demo extendida que ya cayó a Free', () => {
    expect(
      trialExtensionPlanId([
        { code: 'free', id: 'plan-free' },
        { code: 'local', id: 'plan-local' },
      ]),
    ).toBe('plan-local');
  });
});
