import type { BusinessCategory } from '@barber-saas/api-client';

import {
  businessCategoryImage,
  businessCategoryImageAccessibilityLabel,
} from './business-category';

const categories: readonly BusinessCategory[] = [
  'BARBERSHOP',
  'BEAUTY_SALON',
  'NAIL_STUDIO',
  'SPA_WELLNESS',
  'AESTHETICS',
  'PERSONAL_CARE_OTHER',
];

describe('businessCategoryImage', () => {
  it.each(categories)('resuelve assets estáticos para %s', (category) => {
    expect(businessCategoryImage(category, 'dashboard')).toBeDefined();
    expect(businessCategoryImage(category, 'onboarding')).toBeDefined();
    expect(businessCategoryImageAccessibilityLabel(category)).not.toHaveLength(
      0,
    );
  });

  it('describe el asset de estética sin asumir que es un spa', () => {
    expect(businessCategoryImageAccessibilityLabel('AESTHETICS')).toBe(
      'Espacio de centro de estética',
    );
  });
});
