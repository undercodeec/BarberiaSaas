import type { PublicBookingCatalogV2 } from '@barber-saas/api-client';
import { notFound } from 'next/navigation';

import { getWebApiBaseUrl } from '../../api-url';
import { BookingExperience } from '../../components/BookingExperience';

const API_URL = getWebApiBaseUrl();

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ locationSlug: string; organizationSlug: string }>;
}) {
  const { locationSlug, organizationSlug } = await params;
  const response = await fetch(
    `${API_URL.replace(/\/$/u, '')}/v1/public/${encodeURIComponent(
      organizationSlug,
    )}/${encodeURIComponent(locationSlug)}/catalog`,
    { next: { revalidate: 60 } },
  );
  if (!response.ok) notFound();
  const catalog = (await response.json()) as PublicBookingCatalogV2;
  return <BookingExperience apiBaseUrl="/api/public-proxy" catalog={catalog} />;
}
