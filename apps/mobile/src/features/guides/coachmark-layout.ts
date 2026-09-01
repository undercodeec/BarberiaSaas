import type { GuideAnchorRect } from './guide-types';

const BUBBLE_GAP = 18;
const BUBBLE_HEIGHT = 244;
const SCREEN_MARGIN = 16;

type Insets = { readonly bottom: number; readonly top: number };
type WindowSize = { readonly height: number; readonly width: number };

export function coachmarkLayout({
  insets,
  rect,
  window,
}: {
  readonly insets: Insets;
  readonly rect: GuideAnchorRect;
  readonly window: WindowSize;
}) {
  const minimumTop = insets.top + SCREEN_MARGIN;
  const maximumBottom = window.height - insets.bottom - SCREEN_MARGIN;
  const spaceAbove = Math.max(0, rect.y - BUBBLE_GAP - minimumTop);
  const spaceBelow = Math.max(
    0,
    maximumBottom - (rect.y + rect.height + BUBBLE_GAP),
  );
  const placement =
    spaceBelow >= BUBBLE_HEIGHT || spaceBelow >= spaceAbove ? 'below' : 'above';
  const maxHeight = placement === 'below' ? spaceBelow : spaceAbove;
  const height = Math.min(BUBBLE_HEIGHT, maxHeight);
  const top =
    placement === 'below'
      ? rect.y + rect.height + BUBBLE_GAP
      : rect.y - BUBBLE_GAP - height;

  return { maxHeight, placement, top } as const;
}
