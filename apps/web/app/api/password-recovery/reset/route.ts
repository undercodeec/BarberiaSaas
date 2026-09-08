import { NextResponse, type NextRequest } from 'next/server';

import { getWebApiBaseUrl } from '../../../api-url';

const API_URL = getWebApiBaseUrl();

export async function POST(request: NextRequest) {
  try {
    const upstream = await fetch(
      new URL('v1/auth/reset-password', `${API_URL.replace(/\/+$/u, '')}/`),
      {
        body: await request.text(),
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
    return new NextResponse(upstream.body, {
      headers: upstream.headers,
      status: upstream.status,
    });
  } catch {
    return NextResponse.json(
      { code: 'API_UNAVAILABLE', message: 'No pudimos conectar con Nava.' },
      { status: 502 },
    );
  }
}
