/**
 * Shared vertical spacing for controls that sit at the bottom of a screen.
 *
 * Android devices can report a much larger bottom inset when the user chooses
 * three-button navigation. Keeping this calculation in one place prevents a
 * fixed action from ending up behind that system navigation bar.
 */
export const MINIMUM_BOTTOM_SAFE_AREA = 12;
export const BOTTOM_ACTION_GAP = 16;
export const BOTTOM_NAVIGATION_HEIGHT = 72;
export const BOTTOM_NAVIGATION_GAP = 12;

export function bottomSafeAreaInset(systemBottomInset: number) {
  return Math.max(systemBottomInset, MINIMUM_BOTTOM_SAFE_AREA);
}

export function bottomActionPadding(systemBottomInset: number) {
  return bottomSafeAreaInset(systemBottomInset) + BOTTOM_ACTION_GAP;
}

export function bottomNavigationContentPadding(systemBottomInset: number) {
  return (
    bottomSafeAreaInset(systemBottomInset) +
    BOTTOM_NAVIGATION_HEIGHT +
    BOTTOM_NAVIGATION_GAP
  );
}
