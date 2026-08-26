'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Confirmation = {
  readonly invoice: { readonly planName: string; readonly status: string };
  readonly status: string;
};

async function confirmPayment(id: string, clientTransactionId: string) {
  const response = await fetch('/api/checkout/payment/confirm', {
    body: JSON.stringify({ clientTransactionId, id }),
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const body = (await response.json().catch(() => ({}))) as Confirmation & {
    readonly message?: string;
  };
  if (!response.ok)
    throw new Error(body.message ?? 'No pudimos confirmar el pago.');
  return body;
}

export default function PayphoneConfirmation() {
  const params = useSearchParams();
  const id = params.get('id');
  const clientTransactionId = params.get('clientTransactionId');
  const [status, setStatus] = useState<
    'confirming' | 'approved' | 'rejected' | 'error'
  >('confirming');
  const [message, setMessage] = useState('Confirmando tu pago con PayPhone…');

  const runConfirmation = useCallback(async () => {
    if (!id || !clientTransactionId) {
      setStatus('error');
      setMessage('No recibimos los datos necesarios para confirmar el pago.');
      return;
    }
    setStatus('confirming');
    setMessage('Confirmando tu pago con PayPhone…');
    try {
      const payment = await confirmPayment(id, clientTransactionId);
      if (payment.status === 'applied') {
        setStatus('approved');
        setMessage(
          `Pago aprobado. ${payment.invoice.planName} ya está activo.`,
        );
        return;
      }
      setStatus('rejected');
      setMessage('El pago fue rechazado o cancelado. Tu plan no fue activado.');
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos confirmar el pago.',
      );
    }
  }, [clientTransactionId, id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runConfirmation();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [runConfirmation]);

  return (
    <main className="subscription-checkout-page">
      <section
        aria-live="polite"
        className="subscription-checkout-shell subscription-checkout-return"
      >
        <p className="eyebrow">Nava · PayPhone</p>
        <h1>
          {status === 'approved'
            ? 'Pago aprobado'
            : status === 'rejected'
              ? 'Pago rechazado'
              : status === 'error'
                ? 'No pudimos confirmar el pago'
                : 'Confirmando pago…'}
        </h1>
        <p
          className={
            status === 'approved'
              ? 'subscription-checkout-alert is-success'
              : 'subscription-checkout-alert'
          }
        >
          {message}
        </p>
        {status === 'confirming' ? (
          <p className="subscription-checkout-loading">
            No cierres esta página.
          </p>
        ) : null}
        {status === 'error' && id && clientTransactionId ? (
          <button
            className="subscription-checkout-primary"
            onClick={() => void runConfirmation()}
            type="button"
          >
            Reintentar confirmación
          </button>
        ) : null}
        <a className="subscription-checkout-back" href="/checkout">
          Volver al checkout
        </a>
      </section>
    </main>
  );
}
