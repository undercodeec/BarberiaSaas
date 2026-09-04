import type { NextRequest } from 'next/server';

import { getWebApiBaseUrl } from '../../../api-url';

const API_URL = getWebApiBaseUrl();

const forwardedRequestHeaders = ['content-type', 'idempotency-key'] as const;
const forwardedResponseHeaders = ['content-type', 'retry-after'] as const;

async function proxyPublicRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (path[0] !== 'v1' || path[1] !== 'public')
    return Response.json({ message: 'Ruta no permitida.' }, { status: 404 });

  const target = new URL(
    path.map((segment) => encodeURIComponent(segment)).join('/'),
    `${API_URL.replace(/\/+$/u, '')}/`,
  );
  target.search = request.nextUrl.search;

  const headers = new Headers();
  for (const name of forwardedRequestHeaders) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const init: RequestInit = {
    cache: 'no-store',
    headers,
    method: request.method,
  };
  if (request.method !== 'GET' && request.method !== 'HEAD')
    init.body = await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return Response.json(
      { message: 'No pudimos conectar con el servicio de reservas.' },
      { status: 502 },
    );
  }
  const responseHeaders = new Headers();
  for (const name of forwardedResponseHeaders) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  // La disponibilidad cambia al verificar, cancelar o modificar una cita.
  // Nunca debe quedar una respuesta antigua en el navegador, proxy o CDN.
  responseHeaders.set('cache-control', 'no-store, max-age=0');
  return new Response(upstream.body, {
    headers: responseHeaders,
    status: upstream.status,
  });
}

export const GET = proxyPublicRequest;
export const POST = proxyPublicRequest;
