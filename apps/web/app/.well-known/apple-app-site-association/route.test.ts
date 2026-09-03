import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('apple-app-site-association', () => {
  it('asocia las invitaciones HTTPS con la aplicación iOS publicada', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      applinks: {
        apps: [],
        details: [
          {
            appID: '2K9VPW5R27.app.navacloud.nava',
            paths: [
              '/accept-invitation',
              '/accept-invitation/*',
              '/reset-password',
              '/reset-password/*',
            ],
          },
        ],
      },
    });
  });
});
