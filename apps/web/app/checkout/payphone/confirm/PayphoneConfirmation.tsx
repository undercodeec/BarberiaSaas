'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Confirmation = {
  readonly invoice: { readonly planName: string; readonly status: string };
  readonly status: string;
};

const playStoreUrl = process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim();

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
      <section aria-live="polite" className="subscription-checkout-return">
        <div className="subscription-checkout-return-card">
          <div
            aria-hidden="true"
            className={`subscription-checkout-return-icon is-${status}`}
          >
            {status === 'approved' ? '✓' : status === 'confirming' ? '…' : '!'}
          </div>
          <p className="eyebrow">Nava · Suscripciones</p>
          <h1>
            {status === 'approved'
              ? 'Tu plan ya está activo.'
              : status === 'rejected'
                ? 'El pago no fue aprobado.'
                : status === 'error'
                  ? 'No pudimos confirmar el pago.'
                  : 'Confirmando tu pago…'}
          </h1>
          <p className="subscription-checkout-return-message">{message}</p>

          {status === 'confirming' ? (
            <p className="subscription-checkout-return-hint">
              Esta validación se realiza de forma segura con PayPhone. No
              cierres esta página.
            </p>
          ) : null}

          {status === 'approved' ? (
            <section className="subscription-checkout-app-card">
              <span
                aria-hidden="true"
                className="subscription-checkout-app-icon"
              >
                N
              </span>
              <div>
                <p>Todo listo para empezar</p>
                <h2>Ingresa a Nava con el usuario que acabas de crear.</h2>
                <small>
                  Descarga la app para administrar tu negocio, agenda y
                  clientes.
                </small>
              </div>
              {playStoreUrl ? (
                <a
                  className="subscription-checkout-play-store"
                  href={playStoreUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span aria-hidden="true">▶</span>
                  Descargar en Google Play
                </a>
              ) : (
                <span className="subscription-checkout-play-store is-pending">
                  Google Play · Próximamente
                </span>
              )}
            </section>
          ) : null}

          <div className="subscription-checkout-return-actions">
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
              {status === 'approved'
                ? 'Ver mi suscripción'
                : 'Volver al checkout'}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
