import { notFound, redirect } from 'next/navigation';

import { getWebApiBaseUrl } from '../api-url';
import { LocationSelector } from '../components/LocationSelector';

const API_URL = getWebApiBaseUrl();

export default async function OrganizationBookingPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const response = await fetch(
    `${API_URL.replace(/\/$/u, '')}/v1/public/${encodeURIComponent(
      organizationSlug,
    )}`,
    { cache: 'no-store' },
  );
  if (!response.ok) notFound();
  const result = (await response.json()) as
    | { kind: 'redirect'; redirectPath: string }
    | {
        kind: 'locations';
        locations: ReadonlyArray<{
          formattedAddress: string | null;
          name: string;
          slug: string;
        }>;
        organization: { name: string; slug: string };
      };
  if (result.kind === 'redirect') redirect(result.redirectPath);
  return (
    <LocationSelector
      locations={result.locations}
      organization={result.organization}
    />
  );
}
