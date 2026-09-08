import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';

function request(body: Record<string, string>) {
  return new NextRequest('http://localhost/api/password-recovery/reset', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('proxy de restablecimiento de contraseña', () => {
  it('reenvía la contraseña y el token al API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      request({ password: 'Clave-segura-123', token: 'x'.repeat(32) }),
    );

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('v1/auth/reset-password', 'http://localhost:4000/'),
      expect.objectContaining({
        body: JSON.stringify({
          password: 'Clave-segura-123',
          token: 'x'.repeat(32),
        }),
        method: 'POST',
      }),
    );
  });

  it('conserva el mensaje controlado de un token inválido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            code: 'INVALID_RESET_TOKEN',
            message: 'El enlace de recuperación no es válido o ya venció.',
          },
          { status: 400 },
        ),
      ),
    );

    const response = await POST(
      request({ password: 'Clave-segura-123', token: 'x'.repeat(32) }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'INVALID_RESET_TOKEN',
      message: 'El enlace de recuperación no es válido o ya venció.',
    });
  });
});
