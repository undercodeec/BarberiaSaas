'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Plan = {
  readonly code: string;
  readonly currencyCode: string;
  readonly features: readonly string[];
  readonly monthlyPriceCents: number | null;
  readonly name: string;
};

type CheckoutSession = {
  readonly canCheckout: boolean;
  readonly checkoutEnabled: boolean;
  readonly organization: { readonly name: string } | null;
  readonly reason: string | null;
  readonly role: string | null;
};

type PaymentAttempt = {
  readonly amountCents: number;
  readonly currencyCode: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly invoice: { readonly planName: string; readonly status: string };
  readonly paymentUrl: string | null;
  readonly status: string;
};

type ApiError = { readonly message?: string };

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/checkout/${path}`, {
    cache: 'no-store',
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = (await response.json()) as T & ApiError;
  if (!response.ok)
    throw new Error(body.message ?? 'No pudimos completar esta acción.');
  return body;
}

function formatMoney(cents: number, currencyCode: string) {
  return new Intl.NumberFormat('es-EC', {
    currency: currencyCode,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(cents / 100);
}

function checkoutMessage(session: CheckoutSession) {
  if (session.reason === 'onboarding_required')
    return 'Completa el registro de tu negocio antes de contratar un plan.';
  if (session.reason === 'organization_selection_required')
    return 'Esta cuenta tiene varios negocios. Selecciona uno en la app para continuar.';
  if (session.reason === 'owner_required')
    return 'Solo la persona propietaria del negocio puede contratar o renovar el plan.';
  if (session.reason === 'checkout_disabled')
    return 'Los pagos de suscripción todavía no están habilitados para este entorno.';
  return 'No puedes iniciar el checkout en este momento.';
}

function attemptMessage(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'applied')
    return 'Pago confirmado. Tus funcionalidades se activaron para el negocio.';
  if (normalized === 'rejected')
    return 'El pago fue rechazado. Puedes intentar de nuevo con otro método.';
  if (normalized === 'expired')
    return 'El enlace venció. Genera uno nuevo para continuar.';
  return 'Estamos esperando la confirmación segura de PayPhone. No cierres esta página.';
}

export default function SubscriptionCheckout() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPlan = searchParams.get('plan');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCheckout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planResult, sessionResult] = await Promise.all([
        requestJson<{ plans: Plan[] }>('plans'),
        requestJson<CheckoutSession>('session').catch(() => null),
      ]);
      setPlans(planResult.plans);
      setSession(sessionResult);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No pudimos cargar el checkout.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCheckout();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCheckout]);

  const paidPlans = useMemo(
    () => plans.filter((plan) => (plan.monthlyPriceCents ?? 0) > 0),
    [plans],
  );
  const selectedPlan =
    paidPlans.find((plan) => plan.code === requestedPlan) ??
    paidPlans[0] ??
    null;

  useEffect(() => {
    if (
      !attempt ||
      !['created', 'link_created', 'pending_provider'].includes(attempt.status)
    )
      return;
    const timer = window.setInterval(() => {
      void requestJson<PaymentAttempt>(`payments/${attempt.id}`)
        .then(setAttempt)
        .catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [attempt]);

  async function startPayment() {
    if (!selectedPlan) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestJson<PaymentAttempt>('payment', {
        body: JSON.stringify({
          discountCode: discountCode.trim() || undefined,
          planCode: selectedPlan.code,
        }),
        headers: { 'idempotency-key': crypto.randomUUID() },
        method: 'POST',
      });
      setAttempt(result);
      if (result.paymentUrl) window.location.assign(result.paymentUrl);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No pudimos crear el enlace de pago.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function switchPlan(planCode: string) {
    router.replace(`/checkout?plan=${encodeURIComponent(planCode)}`);
    setAttempt(null);
    setError(null);
  }

  return (
    <main className="subscription-checkout-page">
      <header className="commercial-nav subscription-checkout-nav">
        <a aria-label="Nava, inicio" className="commercial-logo" href="/">
          <img alt="Nava" src="/images/nava-logo.png" />
        </a>
        <a className="subscription-checkout-back" href="/suscripciones">
          ← Ver planes
        </a>
      </header>

      <section
        className="subscription-checkout-shell"
        aria-labelledby="checkout-title"
      >
        <div className="subscription-checkout-heading">
          <p className="eyebrow">Nava · Checkout seguro</p>
          <h1 id="checkout-title">Confirma tu plan.</h1>
          <ol
            aria-label="Progreso de la compra"
            className="subscription-checkout-steps"
          >
            <li className="is-complete">1. Plan</li>
            <li className="is-current">2. Pago</li>
            <li>3. Activación</li>
          </ol>
        </div>

        {error ? (
          <p className="subscription-checkout-alert is-error" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="subscription-checkout-loading">Cargando tu checkout…</p>
        ) : null}

        {!loading && !session ? (
          <section className="subscription-checkout-signin">
            <span aria-hidden="true">N</span>
            <h2>Inicia sesión para continuar</h2>
            <p>
              La suscripción se vincula al negocio de la persona propietaria.
              Regístrate o inicia sesión y volverás a elegir el plan.
            </p>
            <a className="subscription-checkout-primary" href="/suscripciones">
              Iniciar sesión o registrarme
            </a>
          </section>
        ) : null}

        {!loading && session && selectedPlan ? (
          <div className="subscription-checkout-layout">
            <section className="subscription-checkout-order">
              <p className="subscription-checkout-kicker">Resumen del pedido</p>
              <h2>{selectedPlan.name}</h2>
              <strong>
                {formatMoney(
                  selectedPlan.monthlyPriceCents!,
                  selectedPlan.currencyCode,
                )}
                <small> / cada 30 días</small>
              </strong>
              <ul>
                {selectedPlan.features.slice(0, 4).map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <button
                className="subscription-checkout-link"
                onClick={() => router.push('/suscripciones')}
                type="button"
              >
                Comparar todos los planes
              </button>
            </section>

            <section className="subscription-checkout-payment">
              <p className="subscription-checkout-kicker">Datos de compra</p>
              <h2>
                {session.organization
                  ? session.organization.name
                  : 'Tu negocio'}
              </h2>
              {!session.canCheckout ? (
                <p className="subscription-checkout-alert">
                  {checkoutMessage(session)}
                </p>
              ) : (
                <>
                  <label htmlFor="discount-code">
                    Código fundador{' '}
                    <small>Opcional, solo para Nava Local</small>
                  </label>
                  <input
                    autoCapitalize="characters"
                    id="discount-code"
                    maxLength={80}
                    onChange={(event) => setDiscountCode(event.target.value)}
                    placeholder="Ingresa tu código"
                    value={discountCode}
                  />
                  <button
                    className="subscription-checkout-primary"
                    disabled={submitting || Boolean(attempt)}
                    onClick={() => void startPayment()}
                    type="button"
                  >
                    {submitting
                      ? 'Preparando pago…'
                      : `Pagar ${formatMoney(selectedPlan.monthlyPriceCents!, selectedPlan.currencyCode)}`}
                  </button>
                  <p className="subscription-checkout-security">
                    Serás dirigido a PayPhone. La activación ocurre solo después
                    de confirmar el pago con PayPhone.
                  </p>
                </>
              )}
            </section>
          </div>
        ) : null}

        {!loading && session && paidPlans.length > 1 ? (
          <nav
            aria-label="Cambiar plan"
            className="subscription-checkout-plans"
          >
            {paidPlans.map((plan) => (
              <button
                className={
                  selectedPlan?.code === plan.code ? 'is-selected' : undefined
                }
                key={plan.code}
                onClick={() => switchPlan(plan.code)}
                type="button"
              >
                {plan.name.replace('Nava ', '')}
              </button>
            ))}
          </nav>
        ) : null}

        {attempt ? (
          <section aria-live="polite" className="subscription-checkout-status">
            <span
              className={
                attempt.status.toLowerCase() === 'applied'
                  ? 'is-success'
                  : undefined
              }
            >
              {attempt.status.toLowerCase() === 'applied' ? '✓' : '…'}
            </span>
            <div>
              <p>Estado del pago</p>
              <h2>{attemptMessage(attempt.status)}</h2>
              <small>
                {attempt.invoice.planName} · Enlace válido hasta{' '}
                {new Intl.DateTimeFormat('es-EC', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(attempt.expiresAt))}
              </small>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
