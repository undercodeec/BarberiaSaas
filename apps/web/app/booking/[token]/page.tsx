import { BookingManager } from '../../components/BookingManager';

export default async function BookingManagementPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <BookingManager token={token} />;
}
