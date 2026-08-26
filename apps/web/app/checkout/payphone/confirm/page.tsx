import { Suspense } from 'react';

import PayphoneConfirmation from './PayphoneConfirmation';

export default function PayphoneConfirmPage() {
  return (
    <Suspense fallback={<main className="subscription-checkout-page" />}>
      <PayphoneConfirmation />
    </Suspense>
  );
}
