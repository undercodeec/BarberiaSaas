import { notFound, redirect } from 'next/navigation';

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';

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
  const result = (await response.json()) as { redirectPath: string };
  redirect(result.redirectPath);
}
