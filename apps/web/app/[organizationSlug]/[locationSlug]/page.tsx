import type { PublicBookingCatalog } from '@barber-saas/api-client';
import { notFound } from 'next/navigation';

import { BookingExperience } from '../../components/BookingExperience';

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ locationSlug: string; organizationSlug: string }>;
}) {
  const { locationSlug, organizationSlug } = await params;
  const response = await fetch(
    `${API_URL.replace(/\/$/u, '')}/v1/public/${encodeURIComponent(
      organizationSlug,
    )}/${encodeURIComponent(locationSlug)}`,
    { cache: 'no-store' },
  );
  if (!response.ok) notFound();
  const catalog = (await response.json()) as PublicBookingCatalog;
  return <BookingExperience apiBaseUrl="/api/public-proxy" catalog={catalog} />;
}
