import type { BusinessCategory } from '@barber-saas/api-client';

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

const ASSET_SLUG: Record<BusinessCategory, string> = {
  AESTHETICS: 'aesthetics',
  BARBERSHOP: 'barbershop',
  BEAUTY_SALON: 'beauty-salon',
  NAIL_STUDIO: 'nail-studio',
  PERSONAL_CARE_OTHER: 'personal-care-other',
  SPA_WELLNESS: 'spa-wellness',
};

/**
 * Ruta canónica para los assets que se añadirán manualmente. Metro no permite
 * `require()` dinámico: al incluir cada imagen habrá que registrarla de forma
 * estática en el resolvedor visual que la consuma.
 */
export function businessCategoryAssetPath(
  category: BusinessCategory,
  placement: 'dashboard' | 'onboarding',
) {
  return `assets/business-categories/${ASSET_SLUG[category]}-${placement}.png`;
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
