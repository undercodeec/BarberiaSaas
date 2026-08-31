import { GUIDE_CATALOG, GUIDE_SNOOZE_MS } from './guide-catalog';
import { GUIDE_IDS } from './guide-types';

describe('guide catalog', () => {
  it('define un objetivo único para cada guía inicial', () => {
    expect(Object.keys(GUIDE_CATALOG).sort()).toEqual([...GUIDE_IDS].sort());
    expect(
      new Set(Object.values(GUIDE_CATALOG).map((guide) => guide.targetId)).size,
    ).toBe(GUIDE_IDS.length);
  });

  it('mantiene el periodo anti-spam de catorce días', () => {
    expect(GUIDE_SNOOZE_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });
});
