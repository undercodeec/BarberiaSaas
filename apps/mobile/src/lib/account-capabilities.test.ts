import { canManageBusinessOnlyFeature } from './account-capabilities';

describe('capabilities by account type', () => {
  it('keeps business-only modules hidden for professionals even during demo', () => {
    expect(canManageBusinessOnlyFeature('professional')).toBe(false);
  });

  it('restores business-only modules when the account returns to business', () => {
    expect(canManageBusinessOnlyFeature('business')).toBe(true);
  });
});
