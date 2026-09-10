import { NotificationCategory } from '@barber-saas/database';
import { describe, expect, it } from 'vitest';

import { notificationCategoryForType } from './notifications';

describe('notificationCategoryForType', () => {
  it('clasifica las liquidaciones aprobadas y pagadas como avisos financieros', () => {
    expect(
      notificationCategoryForType(
        'COMMISSION_SETTLEMENT_APPROVED' as never,
      ),
    ).toBe(NotificationCategory.CASH);
    expect(
      notificationCategoryForType('COMMISSION_SETTLEMENT_PAID' as never),
    ).toBe(NotificationCategory.CASH);
  });
});
