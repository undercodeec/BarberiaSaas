import { shouldProtectAppContent } from './privacy-state';

describe('privacy state', () => {
  it('shows application content only while the app is active', () => {
    expect(shouldProtectAppContent('active')).toBe(false);
    expect(shouldProtectAppContent('inactive')).toBe(true);
    expect(shouldProtectAppContent('background')).toBe(true);
    expect(shouldProtectAppContent('unknown')).toBe(true);
    expect(shouldProtectAppContent('extension')).toBe(true);
  });
});
