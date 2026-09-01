import { clampFloatingControl } from './floating-control';

const bounds = {
  baseX: 300,
  baseY: 600,
  bottomInset: 20,
  buttonHeight: 58,
  buttonWidth: 58,
  height: 800,
  topInset: 24,
  width: 400,
};

describe('clampFloatingControl', () => {
  it('allows movement throughout the usable area', () => {
    expect(clampFloatingControl({ x: -120, y: -300 }, bounds)).toEqual({
      x: -120,
      y: -300,
    });
  });

  it('keeps the control inside the margins and above navigation', () => {
    expect(clampFloatingControl({ x: -999, y: -999 }, bounds)).toEqual({
      x: -284,
      y: -560,
    });
    expect(clampFloatingControl({ x: 999, y: 999 }, bounds)).toEqual({
      x: 26,
      y: 38,
    });
  });
});
