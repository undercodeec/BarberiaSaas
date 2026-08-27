import { NextResponse, type NextRequest } from 'next/server';

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';
const SESSION_COOKIE = 'nava_invitation_session';

const routes = {
  'auth/invitation-register': 'v1/auth/invitation-register',
  'auth/login': 'v1/auth/login',
  'auth/logout': 'v1/auth/logout',
  'auth/resend-verification': 'v1/auth/resend-verification',
  'auth/verify-email': 'v1/auth/verify-email',
  accept: 'v1/team/invitations/accept',
} as const;

const publicRoutes = new Set([
  'auth/invitation-register',
  'auth/login',
  'auth/resend-verification',
  'auth/verify-email',
]);

function upstreamUrl(path: string) {
  return new URL(path, `${API_URL.replace(/\/+$/u, '')}/`);
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {
      code: 'UPSTREAM_INVALID_RESPONSE',
      message: 'Respuesta inválida.',
    };
  }
}

function sessionTokenFrom(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('session' in body)) return null;
  const session = body.session;
  if (!session || typeof session !== 'object') return null;
  const token = (session as { readonly token?: unknown }).token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

function withoutSessionToken(body: unknown) {
  if (!body || typeof body !== 'object' || !('session' in body)) return body;
  const session = body.session;
  if (!session || typeof session !== 'object') return body;
  const safeSession: Record<string, unknown> = { ...session };
  delete safeSession.token;
  return { ...body, session: safeSession };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const requestedPath = path.join('/');
  const upstreamPath = routes[requestedPath as keyof typeof routes];
  if (!upstreamPath)
    return NextResponse.json(
      { message: 'Ruta no permitida.' },
      { status: 404 },
    );

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (!publicRoutes.has(requestedPath) && !sessionToken)
    return NextResponse.json(
      { code: 'UNAUTHENTICATED', message: 'Inicia sesión para continuar.' },
      { status: 401 },
    );

  const headers = new Headers({
    accept: 'application/json',
    'content-type': 'application/json',
  });
  if (sessionToken) headers.set('authorization', `Bearer ${sessionToken}`);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl(upstreamPath), {
      body: await request.text(),
      cache: 'no-store',
      headers,
      method: 'POST',
    });
  } catch {
    return NextResponse.json(
      { code: 'API_UNAVAILABLE', message: 'No pudimos conectar con Nava.' },
      { status: 502 },
    );
  }

  const body = await readJson(upstream);
  const createsSession =
    requestedPath === 'auth/login' || requestedPath === 'auth/verify-email';
  if (createsSession && upstream.ok) {
    const token = sessionTokenFrom(body);
    if (!token)
      return NextResponse.json(
        {
          code: 'LOGIN_RESPONSE_INVALID',
          message: 'No pudimos iniciar sesión.',
        },
        { status: 502 },
      );
    const response = NextResponse.json(withoutSessionToken(body), {
      status: upstream.status,
    });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60,
      path: '/api/invitations',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return response;
  }

  const response = NextResponse.json(body, { status: upstream.status });
  if (requestedPath === 'auth/logout') {
    response.cookies.set(SESSION_COOKIE, '', {
      maxAge: 0,
      path: '/api/invitations',
    });
  }
  return response;
}
