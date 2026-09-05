import { describe, expect, it } from 'vitest';

import {
  currentRequestMetrics,
  observeDatabaseQuery,
  runWithRequestMetrics,
} from './request-metrics';

describe('métricas de solicitud', () => {
  it('aísla los contadores de solicitudes paralelas', async () => {
    const [left, right] = await Promise.all([
      runWithRequestMetrics('left', async () => {
        observeDatabaseQuery(4);
        observeDatabaseQuery(6);
        return currentRequestMetrics();
      }),
      runWithRequestMetrics('right', async () => {
        observeDatabaseQuery(9);
        return currentRequestMetrics();
      }),
    ]);

    expect(left).toMatchObject({ databaseMs: 10, queryCount: 2 });
    expect(right).toMatchObject({ databaseMs: 9, queryCount: 1 });
  });
});
