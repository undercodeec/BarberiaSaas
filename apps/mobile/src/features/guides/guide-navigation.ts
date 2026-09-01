export const QUICK_GUIDE_ROUTES = {
  'add-client': '/clients',
  'add-service': '/service-management',
  'dashboard-tour': '/dashboard',
  'first-booking': '/agenda',
  'share-booking-link': '/dashboard',
} as const;

export type QuickGuideId = keyof typeof QUICK_GUIDE_ROUTES;

export function quickGuideDestination(id: QuickGuideId, guideRun: string) {
  return {
    params: { guide: id, guideRun, replay: '1' as const },
    pathname: QUICK_GUIDE_ROUTES[id],
  };
}
