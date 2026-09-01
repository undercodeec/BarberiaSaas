import {
  DASHBOARD_TOUR_IDS,
  GUIDE_CATALOG,
  GUIDE_SNOOZE_MS,
} from './guide-catalog';
import { GUIDE_IDS } from './guide-types';

describe('guide catalog', () => {
  it('define un objetivo único para cada guía inicial', () => {
    expect(Object.keys(GUIDE_CATALOG).sort()).toEqual([...GUIDE_IDS].sort());
    expect(
      new Set(
        DASHBOARD_TOUR_IDS.map((guideId) => GUIDE_CATALOG[guideId].targetId),
      ).size,
    ).toBe(DASHBOARD_TOUR_IDS.length);
  });

  it('mantiene el periodo anti-spam de catorce días', () => {
    expect(GUIDE_SNOOZE_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });
  it('recorre los accesos principales del dashboard en el orden de uso', () => {
    expect(DASHBOARD_TOUR_IDS).toEqual([
      'dashboard-booking-link',
      'dashboard-banners',
      'dashboard-quick-actions',
      'dashboard-summary',
      'dashboard-notifications',
    ]);
  });

  it('conecta cada paso con el siguiente y anterior correctos', () => {
    expect(GUIDE_CATALOG['dashboard-booking-link'].nextId).toBe(
      'dashboard-banners',
    );
    expect(GUIDE_CATALOG['dashboard-banners'].nextId).toBe(
      'dashboard-quick-actions',
    );
    expect(GUIDE_CATALOG['dashboard-quick-actions'].nextId).toBe(
      'dashboard-summary',
    );
    expect(GUIDE_CATALOG['dashboard-summary'].nextId).toBe(
      'dashboard-notifications',
    );
    expect(GUIDE_CATALOG['dashboard-notifications'].nextId).toBeUndefined();
  });
});
