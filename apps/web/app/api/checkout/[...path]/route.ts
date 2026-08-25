import { randomUUID } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';
const SESSION_COOKIE = 'nava_checkout_session';

const routes = {
  'auth/login': { method: 'POST', upstream: 'v1/auth/login' },
  'auth/logout': { method: 'POST', upstream: 'v1/auth/logout' },
  'auth/register': { method: 'POST', upstream: 'v1/auth/register' },
  'auth/verify-email': { method: 'POST', upstream: 'v1/auth/verify-email' },
  'onboarding/complete-account-setup': {
    method: 'POST',
    upstream: 'v1/onboarding/complete-account-setup',
  },
  'onboarding/services': { method: 'POST', upstream: 'v1/onboarding/services' },
  payment: { method: 'POST', upstream: 'v1/subscription/checkout' },
  plans: { method: 'GET', upstream: 'v1/subscription/plans' },
  session: { method: 'GET', upstream: 'v1/subscription/session' },
} as const;

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return checkoutProxy(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return checkoutProxy(request, context);
}

async function checkoutProxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const requestedPath = path.join('/');
  const paymentAttemptId =
    path.length === 2 &&
    path[0] === 'payments' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      path[1] ?? '',
    )
      ? path[1]
      : null;
  const route = paymentAttemptId
    ? {
        method: 'GET' as const,
        upstream: `v1/subscription/payments/${paymentAttemptId}`,
      }
    : routes[requestedPath as keyof typeof routes];
  if (!route || route.method !== request.method)
    return NextResponse.json(
      { message: 'Ruta no permitida.' },
      { status: 404 },
    );

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const isPublicAuthRoute =
    route === routes['auth/login'] ||
    route === routes['auth/register'] ||
    route === routes['auth/verify-email'] ||
    route === routes.plans;
  if (!isPublicAuthRoute && !sessionToken)
    return NextResponse.json(
      { code: 'UNAUTHENTICATED', message: 'Inicia sesión para continuar.' },
      { status: 401 },
    );

  const headers = new Headers({ accept: 'application/json' });
  if (sessionToken) headers.set('authorization', `Bearer ${sessionToken}`);
  if (route === routes.payment)
    headers.set(
      'idempotency-key',
      request.headers.get('idempotency-key') ?? randomUUID(),
    );
  if (request.method === 'POST')
    headers.set('content-type', 'application/json');

  let upstream: Response;
  try {
    const init: RequestInit = {
      cache: 'no-store',
      headers,
      method: request.method,
    };
    if (request.method === 'POST') init.body = await request.text();
    upstream = await fetch(upstreamUrl(route.upstream), {
      ...init,
    });
  } catch {
    return NextResponse.json(
      { code: 'API_UNAVAILABLE', message: 'No pudimos conectar con Nava.' },
      { status: 502 },
    );
  }

  const body = await readJson(upstream);
  if (
    (requestedPath === 'auth/login' || requestedPath === 'auth/verify-email') &&
    upstream.ok
  ) {
    const token =
      body && typeof body === 'object' && 'session' in body
        ? (body.session as { token?: unknown }).token
        : null;
    if (typeof token !== 'string' || token.length === 0)
      return NextResponse.json(
        {
          code: 'LOGIN_RESPONSE_INVALID',
          message: 'No pudimos iniciar sesión.',
        },
        { status: 502 },
      );
    if (body && typeof body === 'object' && 'session' in body) {
      const safeSession = {
        ...(body.session as {
          token?: unknown;
          [key: string]: unknown;
        }),
      };
      delete safeSession.token;
      body.session = safeSession;
    }
    const response = NextResponse.json(body, { status: upstream.status });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return response;
  }
  const response = NextResponse.json(body, { status: upstream.status });
  if (requestedPath === 'auth/logout') response.cookies.delete(SESSION_COOKIE);
  return response;
}
