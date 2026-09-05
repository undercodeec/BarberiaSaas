import { focusedInterval } from './use-route-focus';

describe('polling según foco de ruta', () => {
  it('detiene el polling al perder el foco', () => {
    expect(focusedInterval(false, 30_000)).toBe(false);
    expect(focusedInterval(true, 30_000)).toBe(30_000);
  });
});
