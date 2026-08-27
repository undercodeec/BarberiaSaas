const defaultEnvironment = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NODE_ENV: process.env.NODE_ENV,
};

function isLocalHostname(hostname: string) {
  return (
    hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
  );
}

export function getAdminApiBaseUrl(
  environment: Partial<
    Pick<NodeJS.ProcessEnv, 'NEXT_PUBLIC_API_URL' | 'NODE_ENV'>
  > = defaultEnvironment,
) {
  const configuredApiUrl = environment.NEXT_PUBLIC_API_URL?.trim();
  const isProduction = environment.NODE_ENV === 'production';
  const value = configuredApiUrl;

  if (!value) {
    throw new Error(
      isProduction
        ? 'NEXT_PUBLIC_API_URL is required for the Admin production build.'
        : 'NEXT_PUBLIC_API_URL is required to run the Admin.',
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('NEXT_PUBLIC_API_URL must be a valid absolute URL.');
  }

  if (
    isProduction &&
    (url.protocol !== 'https:' || isLocalHostname(url.hostname))
  ) {
    throw new Error(
      'NEXT_PUBLIC_API_URL must use HTTPS and cannot point to localhost in production.',
    );
  }

  return url.toString().replace(/\/+$/u, '');
}
