import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertLocalTestDatabaseUrl,
  resolveLocalTestDatabaseUrl,
} from './test-database-env.mjs';

describe('entorno de base de datos de pruebas', () => {
  it('rechaza destinos que no son la base local aislada', () => {
    assert.throws(
      () =>
        assertLocalTestDatabaseUrl('postgresql://user:pass@remote.example/db'),
      /base local autorizada/u,
    );
    assert.throws(
      () =>
        resolveLocalTestDatabaseUrl({
          TEST_DATABASE_URL: 'postgresql://user:pass@remote.example/db',
        }),
      /base local autorizada/u,
    );
  });

  it('acepta únicamente el destino local documentado', () => {
    assert.doesNotThrow(() =>
      assertLocalTestDatabaseUrl(
        'postgresql://user:pass@127.0.0.1:5433/barber_saas_test',
      ),
    );
    assert.equal(
      resolveLocalTestDatabaseUrl({
        DATABASE_URL: 'postgresql://neon.example/production',
      }),
      'postgresql://barber_saas:change-me-local-only@127.0.0.1:5433/barber_saas_test?schema=public',
    );
  });

  it('exige el nombre exacto de la base aislada', () => {
    assert.throws(
      () =>
        assertLocalTestDatabaseUrl(
          'postgresql://user:pass@127.0.0.1:5433/barber_saas_test_copy',
        ),
      /base local autorizada/u,
    );
  });
});
