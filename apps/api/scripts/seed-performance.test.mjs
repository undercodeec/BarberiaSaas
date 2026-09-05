import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { distributeRows } from './seed-performance.mjs';
import { scalableScenarios } from '../../../tests/performance/api-workflows.mjs';

describe('fixture de rendimiento', () => {
  it('distribuye las filas de forma estable entre particiones', () => {
    assert.deepEqual(
      distributeRows(100_000, 5),
      [20_000, 20_000, 20_000, 20_000, 20_000],
    );
  });

  it('declara todos los escenarios v2 de datos', () => {
    assert.deepEqual(
      scalableScenarios.map(({ name }) => name),
      [
        'clients-first-page',
        'clients-search',
        'contact-import-100',
        'agenda-week-five-locations',
        'private-availability',
        'appointment-create',
        'inventory-first-page',
        'inventory-deep-cursor',
        'inventory-summary',
        'inventory-adjustment',
        'public-catalog',
      ],
    );
  });
});
