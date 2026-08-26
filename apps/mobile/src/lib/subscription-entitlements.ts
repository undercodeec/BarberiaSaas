import type {
  SubscriptionFeatureFlags,
  SubscriptionResponse,
} from '@barber-saas/api-client';

export function hasLockedSubscriptionFeature(
  featureFlags: SubscriptionFeatureFlags | undefined,
  requiredFeatures: readonly (keyof SubscriptionFeatureFlags)[] | undefined,
): boolean {
  return Boolean(
    requiredFeatures?.some((feature) => featureFlags?.[feature] === false),
  );
}

export function minimumPlanForFeatures(
  requiredFeatures: readonly (keyof SubscriptionFeatureFlags)[] | undefined,
): 'Nava Esencial' | 'Nava Local' {
  return requiredFeatures?.every(
    (feature) => feature === 'fullReports' || feature === 'inventory',
  )
    ? 'Nava Esencial'
    : 'Nava Local';
}

export function effectiveLocationLimit(subscription: {
  readonly current: {
    readonly limits?: { readonly locations: number };
    readonly planCode: SubscriptionResponse['current']['planCode'];
  };
  readonly plans: ReadonlyArray<{
    readonly code: SubscriptionResponse['current']['planCode'];
    readonly limits: { readonly locations: number };
  }>;
}): number | null {
  return (
    subscription.current.limits?.locations ??
    subscription.plans.find(
      ({ code }) => code === subscription.current.planCode,
    )?.limits.locations ??
    null
  );
}
