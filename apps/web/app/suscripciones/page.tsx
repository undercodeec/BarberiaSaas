import type { Metadata } from 'next';

import CheckoutExperience from '../checkout/CheckoutExperience';

export const metadata: Metadata = {
  title: 'Suscripciones | Nava',
  description:
    'Planes Nava para organizar las reservas, clientes y operación de tu negocio.',
};

export default function SubscriptionsPage() {
  return <CheckoutExperience />;
}
