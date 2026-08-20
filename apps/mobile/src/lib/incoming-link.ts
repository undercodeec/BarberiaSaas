const ALLOWED_ROUTES = new Set(['accept-invitation', 'reset-password']);
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,512}$/u;
const VERIFIED_LINK_HOST = 'reservas.navacloud.app';

function routeFromUrl(url: URL): string {
  if (url.protocol === 'barbersaas:') {
    return url.hostname || url.pathname.replace(/^\/+|\/+$/gu, '');
  }
  if (url.protocol === 'https:' && url.hostname === VERIFIED_LINK_HOST) {
    return url.pathname.replace(/^\/+|\/+$/gu, '');
  }
  if (url.origin === 'https://nava.internal') {
    return url.pathname.replace(/^\/+|\/+$/gu, '');
  }
  return '';
}

export function sanitizeIncomingMobileLink(
  path: string,
  allowDevelopmentLink = false,
): string {
  if (
    allowDevelopmentLink &&
    (path.startsWith('exp:') ||
      path.startsWith('exps:') ||
      path.startsWith('exp+barber-saas-mobile:'))
  ) {
    return path;
  }

  try {
    const url = new URL(path, 'https://nava.internal');
    const route = routeFromUrl(url);
    if (!ALLOWED_ROUTES.has(route)) return '/';

    const token = url.searchParams.get('token') ?? '';
    if (!OPAQUE_TOKEN_PATTERN.test(token)) return '/';
    return `/${route}?token=${encodeURIComponent(token)}`;
  } catch {
    return '/';
  }
}
