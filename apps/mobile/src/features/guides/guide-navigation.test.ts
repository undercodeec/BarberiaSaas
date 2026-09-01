import { QUICK_GUIDE_ROUTES, quickGuideDestination } from './guide-navigation';

describe('quick guide navigation', () => {
  it('routes every quick-guide card to its owning screen', () => {
    expect(QUICK_GUIDE_ROUTES).toEqual({
      'add-client': '/clients',
      'add-service': '/service-management',
      'dashboard-tour': '/dashboard',
      'first-booking': '/agenda',
      'share-booking-link': '/dashboard',
    });
  });

  it('includes replay and a unique run identifier', () => {
    expect(quickGuideDestination('first-booking', 'run-2')).toEqual({
      params: {
        guide: 'first-booking',
        guideRun: 'run-2',
        replay: '1',
      },
      pathname: '/agenda',
    });
  });
});
