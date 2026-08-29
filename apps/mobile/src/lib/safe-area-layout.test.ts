import {
  bottomActionPadding,
  bottomNavigationContentPadding,
  bottomSafeAreaInset,
} from './safe-area-layout';

describe('safe bottom layout', () => {
  it('keeps a small ergonomic margin with gesture navigation', () => {
    expect(bottomSafeAreaInset(0)).toBe(12);
    expect(bottomActionPadding(0)).toBe(28);
  });

  it('preserves the full system inset with Android three-button navigation', () => {
    expect(bottomSafeAreaInset(48)).toBe(48);
    expect(bottomActionPadding(48)).toBe(64);
    expect(bottomNavigationContentPadding(48)).toBe(132);
  });
});
