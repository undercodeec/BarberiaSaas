import type { BusinessCategory } from '@barber-saas/api-client';
import type { ImageSourcePropType } from 'react-native';

export const BUSINESS_CATEGORY_OPTIONS: ReadonlyArray<{
  readonly icon:
    | 'color-palette-outline'
    | 'cut-outline'
    | 'eye-outline'
    | 'leaf-outline'
    | 'sparkles-outline'
    | 'storefront-outline';
  readonly label: string;
  readonly value: BusinessCategory;
}> = [
  { icon: 'cut-outline', label: 'Barbería', value: 'BARBERSHOP' },
  {
    icon: 'color-palette-outline',
    label: 'Salón de belleza',
    value: 'BEAUTY_SALON',
  },
  { icon: 'sparkles-outline', label: 'Estudio de uñas', value: 'NAIL_STUDIO' },
  { icon: 'leaf-outline', label: 'Spa y bienestar', value: 'SPA_WELLNESS' },
  { icon: 'eye-outline', label: 'Centro de estética', value: 'AESTHETICS' },
  {
    icon: 'storefront-outline',
    label: 'Otro cuidado personal',
    value: 'PERSONAL_CARE_OTHER',
  },
];

type BusinessCategoryImagePlacement = 'dashboard' | 'onboarding';

type BusinessCategoryVisual = {
  readonly accessibilityLabel: string;
  readonly dashboard: ImageSourcePropType;
  readonly onboarding: ImageSourcePropType;
};

// Metro needs every image to be registered through a static require. The same
// contextual composition is intentionally reused on dashboard and onboarding.
const BUSINESS_CATEGORY_VISUALS: Record<
  BusinessCategory,
  BusinessCategoryVisual
> = {
  AESTHETICS: {
    accessibilityLabel: 'Espacio de centro de estética',
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves static React Native image assets through require.
    dashboard: require('../../assets/business-categories/spas.png'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves static React Native image assets through require.
    onboarding: require('../../assets/business-categories/spas.png'),
  },
  BARBERSHOP: {
    accessibilityLabel: 'Silla de barbería',
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves static React Native image assets through require.
    dashboard: require('../../assets/silla.png'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves static React Native image assets through require.
    onboarding: require('../../assets/onboarding-team.png'),
  },
  BEAUTY_SALON: {
    accessibilityLabel: 'Estación de salón de belleza',
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves static React Native image assets through require.
    dashboard: require('../../assets/business-categories/peluqueria.png'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves static React Native image assets through require.
    onboarding: require('../../assets/business-categories/peluqueria.png'),
  },
  NAIL_STUDIO: {
    accessibilityLabel: 'Estación de estudio de uñas',
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves static React Native image assets through require.
    dashboard: require('../../assets/business-categories/estudio-unas.png'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves static React Native image assets through require.
    onboarding: require('../../assets/business-categories/estudio-unas.png'),
  },
  PERSONAL_CARE_OTHER: {
    accessibilityLabel: 'Espacio de cuidado personal',
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves static React Native image assets through require.
    dashboard: require('../../assets/business-categories/otros-cuidados-personales.png'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves static React Native image assets through require.
    onboarding: require('../../assets/business-categories/otros-cuidados-personales.png'),
  },
  SPA_WELLNESS: {
    accessibilityLabel: 'Sala de spa y bienestar',
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves static React Native image assets through require.
    dashboard: require('../../assets/business-categories/spa-wellness.png'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves static React Native image assets through require.
    onboarding: require('../../assets/business-categories/spa-wellness.png'),
  },
};

export function businessCategoryImage(
  category: BusinessCategory,
  placement: BusinessCategoryImagePlacement,
) {
  return BUSINESS_CATEGORY_VISUALS[category][placement];
}

export function businessCategoryImageAccessibilityLabel(
  category: BusinessCategory,
) {
  return BUSINESS_CATEGORY_VISUALS[category].accessibilityLabel;
}

export function businessCategoryLabel(category: BusinessCategory) {
  return (
    BUSINESS_CATEGORY_OPTIONS.find((option) => option.value === category)
      ?.label ?? 'Barbería'
  );
}

export function businessCategoryIcon(category: BusinessCategory) {
  return (
    BUSINESS_CATEGORY_OPTIONS.find((option) => option.value === category)
      ?.icon ?? 'storefront-outline'
  );
}
