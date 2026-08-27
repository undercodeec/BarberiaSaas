import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';

function request(path: string, body: Record<string, unknown>, cookie?: string) {
  return new NextRequest(`http://localhost/api/invitations/${path}`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    method: 'POST',
  });
}

function context(path: string) {
  return { params: Promise.resolve({ path: path.split('/') }) };
}

afterEach(() => vi.unstubAllGlobals());

describe('proxy de invitaciones', () => {
  it('guarda la sesión de inicio de sesión como cookie HTTP-only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        session: { expiresAt: '2030-01-01T00:00:00.000Z', token: 'secret' },
        user: { email: 'invitee@example.com' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      request('auth/login', {
        email: 'invitee@example.com',
        password: 'Clave-segura-123',
      }),
      context('auth/login'),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      session: { expiresAt: '2030-01-01T00:00:00.000Z' },
    });
    expect(response.headers.get('set-cookie')).toContain(
      'nava_invitation_session=secret',
    );
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('v1/auth/login', 'http://localhost:4000/'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('guarda también la sesión devuelta al verificar el correo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          session: { token: 'verified-secret' },
          user: { email: 'invitee@example.com' },
        }),
      ),
    );

    const response = await POST(
      request('auth/verify-email', {
        code: '123456',
        email: 'invitee@example.com',
      }),
      context('auth/verify-email'),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ session: {} });
    expect(response.headers.get('set-cookie')).toContain(
      'nava_invitation_session=verified-secret',
    );
  });

  it('envía la cookie como bearer al aceptar y no acepta sin sesión', async () => {
    const unauthenticated = await POST(
      request('accept', { token: 'x'.repeat(32) }),
      context('accept'),
    );
    expect(unauthenticated.status).toBe(401);

    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const accepted = await POST(
      request(
        'accept',
        { token: 'x'.repeat(32) },
        'nava_invitation_session=secret',
      ),
      context('accept'),
    );

    expect(accepted.status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toEqual(
      new URL('v1/team/invitations/accept', 'http://localhost:4000/'),
    );
    expect(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).headers instanceof Headers,
    ).toBe(true);
    expect(
      ((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers).get(
        'authorization',
      ),
    ).toBe('Bearer secret');
  });

  it('elimina la cookie al cerrar sesión', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ok: true })),
    );

    const response = await POST(
      request('auth/logout', {}, 'nava_invitation_session=secret'),
      context('auth/logout'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain(
      'nava_invitation_session=;',
    );
  });
});
