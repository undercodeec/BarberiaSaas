import { BookingManager } from '../../components/BookingManager';

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';

export default async function BookingManagementPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <BookingManager apiBaseUrl={API_URL} token={token} />;
}
