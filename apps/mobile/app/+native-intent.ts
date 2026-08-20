import { sanitizeIncomingMobileLink } from '../src/lib/incoming-link';

export function redirectSystemPath({ path }: { path: string }): string {
  return sanitizeIncomingMobileLink(
    path,
    process.env.NODE_ENV !== 'production',
  );
}
