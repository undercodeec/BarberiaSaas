import { describe, expect, it } from 'vitest';

import {
  SESSION_ACTIVITY_TOUCH_INTERVAL_MS,
  shouldTouchSession,
} from './session-activity';

describe('actividad de sesión', () => {
  it('actualiza la actividad solo después de cinco minutos', () => {
    const now = new Date('2026-09-04T12:05:00.000Z');

    expect(shouldTouchSession(new Date('2026-09-04T12:00:01.000Z'), now)).toBe(
      false,
    );
    expect(shouldTouchSession(new Date('2026-09-04T12:00:00.000Z'), now)).toBe(
      true,
    );
    expect(SESSION_ACTIVITY_TOUCH_INTERVAL_MS).toBe(5 * 60 * 1_000);
  });
});
