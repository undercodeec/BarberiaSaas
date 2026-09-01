export interface FloatingControlBounds {
  readonly baseX: number;
  readonly baseY: number;
  readonly bottomInset: number;
  readonly buttonHeight: number;
  readonly buttonWidth: number;
  readonly height: number;
  readonly topInset: number;
  readonly width: number;
}

export function clampFloatingControl(
  candidate: { readonly x: number; readonly y: number },
  bounds: FloatingControlBounds,
) {
  const sideMargin = 16;
  const navigationHeight = 72;
  const navigationGap = 12;
  return {
    x: Math.min(
      bounds.width - sideMargin - bounds.buttonWidth - bounds.baseX,
      Math.max(sideMargin - bounds.baseX, candidate.x),
    ),
    y: Math.min(
      bounds.height -
        bounds.bottomInset -
        navigationHeight -
        navigationGap -
        bounds.buttonHeight -
        bounds.baseY,
      Math.max(bounds.topInset + sideMargin - bounds.baseY, candidate.y),
    ),
  };
}
