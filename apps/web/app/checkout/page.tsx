import { Suspense } from 'react';

import SubscriptionCheckout from './SubscriptionCheckout';

export default function CheckoutPage() {
  return (
    <Suspense fallback={<main className="subscription-checkout-page" />}>
      <SubscriptionCheckout />
    </Suspense>
  );
}
