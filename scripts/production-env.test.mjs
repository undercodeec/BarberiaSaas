import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateProductionFrontendEnvironment } from './production-env.mjs';

describe('validación de entorno público de producción', () => {
  it('rechaza una URL ausente', () => {
    assert.throws(
      () => validateProductionFrontendEnvironment({}),
      /obligatoria/u,
    );
  });

  for (const apiUrl of [
    'http://localhost:4000',
    'http://127.0.0.1:4000',
    'https://127.0.0.1:4000',
    'http://api.navacloud.app',
    'https://api.navaclouda.app',
    'api.navacloud.app',
  ]) {
    it(`rechaza ${apiUrl}`, () => {
      assert.throws(() =>
        validateProductionFrontendEnvironment({ NEXT_PUBLIC_API_URL: apiUrl }),
      );
    });
  }

  it('acepta la API pública de Nava', () => {
    assert.equal(
      validateProductionFrontendEnvironment({
        NEXT_PUBLIC_API_URL: 'https://api.navacloud.app/',
      }),
      'https://api.navacloud.app',
    );
  });
});
