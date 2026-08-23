'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

interface Plan {
  readonly code: string;
  readonly currencyCode: string;
  readonly monthlyPriceCents: number | null;
  readonly name: string;
}

interface CheckoutSession {
  readonly canCheckout: boolean;
  readonly checkoutEnabled: boolean;
  readonly organization: { readonly name: string } | null;
  readonly reason: string | null;
  readonly role: string | null;
}

interface PaymentAttempt {
  readonly amountCents: number;
  readonly currencyCode: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly invoice: { readonly planName: string; readonly status: string };
  readonly paymentUrl: string | null;
  readonly status: string;
}

interface ApiError {
  readonly message?: string;
}

function formatMoney(cents: number | null, currencyCode: string) {
  if (cents === null) return 'Consulta disponibilidad';
  return new Intl.NumberFormat('es-EC', {
    currency: currencyCode,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(cents / 100);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/checkout/${path}`, {
    cache: 'no-store',
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = (await response.json()) as T & ApiError;
  if (!response.ok)
    throw new Error(body.message ?? 'No pudimos completar la acción.');
  return body;
}

function sessionMessage(session: CheckoutSession) {
  if (session.reason === 'onboarding_required')
    return 'Completa el onboarding y crea tu negocio antes de contratar.';
  if (session.reason === 'organization_selection_required')
    return 'Tu cuenta pertenece a varias organizaciones; selecciona una en la app antes de continuar.';
  if (session.reason === 'owner_required')
    return 'Solo la persona propietaria del negocio puede contratar o renovar el plan.';
  if (session.reason === 'checkout_disabled')
    return 'El piloto de pagos todavía no está habilitado para esta cuenta.';
  return 'No puedes iniciar el checkout en este momento.';
}

export default function CheckoutExperience() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(null);

  const loadSession = useCallback(async () => {
    try {
      setSession(await requestJson<CheckoutSession>('session'));
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      requestJson<{ plans: Plan[] }>('plans').then(({ plans: result }) =>
        setPlans(result),
      ),
      loadSession(),
    ]).catch(() =>
      setError('No pudimos cargar los planes. Inténtalo nuevamente.'),
    );
  }, [loadSession]);

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

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestJson('auth/login', {
        body: JSON.stringify({ email, password }),
        method: 'POST',
      });
      setPassword('');
      await loadSession();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'No pudimos iniciar sesión.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function beginCheckout(planCode: string) {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestJson<PaymentAttempt>('payment', {
        body: JSON.stringify({
          discountCode: discountCode.trim() || undefined,
          planCode,
        }),
        headers: { 'idempotency-key': crypto.randomUUID() },
        method: 'POST',
      });
      setAttempt(result);
      if (result.paymentUrl)
        window.open(result.paymentUrl, '_blank', 'noopener,noreferrer');
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

  async function logout() {
    await requestJson('auth/logout', { body: '{}', method: 'POST' }).catch(
      () => undefined,
    );
    setAttempt(null);
    setSession(null);
  }

  return (
    <main className="min-h-screen bg-[var(--surface)] px-6 py-12 text-[var(--ink)] sm:px-10">
      <section className="mx-auto max-w-3xl">
        <p className="eyebrow">Nava · Suscripción</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          Elige el plan para tu negocio.
        </h1>
        <p className="mt-4 max-w-2xl text-[var(--muted)]">
          Los cobros se confirman únicamente después de la validación del
          proveedor. El regreso desde PayPhone no activa el plan por sí solo.
        </p>

        {error ? (
          <p
            className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-8 text-[var(--muted)]">Cargando checkout…</p>
        ) : null}

        {!loading && !session ? (
          <form
            className="mt-8 max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-sm"
            onSubmit={login}
          >
            <h2 className="text-xl font-bold">Inicia sesión para continuar</h2>
            <label className="mt-5 block text-sm font-semibold" htmlFor="email">
              Correo
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-black/20 px-3 py-2"
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
            <label
              className="mt-4 block text-sm font-semibold"
              htmlFor="password"
            >
              Contraseña
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-black/20 px-3 py-2"
              id="password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <button
              className="mt-6 w-full rounded-lg bg-[var(--accent)] px-4 py-3 font-bold text-white disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? 'Ingresando…' : 'Continuar'}
            </button>
          </form>
        ) : null}

        {session ? (
          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white p-4">
              <span>
                {session.organization
                  ? `Negocio: ${session.organization.name}`
                  : 'Cuenta Nava'}
              </span>
              <button
                className="text-sm font-semibold underline"
                onClick={() => void logout()}
                type="button"
              >
                Cerrar sesión
              </button>
            </div>
            {!session.canCheckout ? (
              <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
                {sessionMessage(session)}
              </p>
            ) : null}
            <div className="mt-6 max-w-md">
              <label
                className="block text-sm font-semibold"
                htmlFor="discount-code"
              >
                Código de descuento
              </label>
              <input
                autoCapitalize="characters"
                className="mt-1 w-full rounded-lg border border-black/20 px-3 py-2"
                id="discount-code"
                maxLength={80}
                onChange={(event) => setDiscountCode(event.target.value)}
                placeholder="Opcional"
                value={discountCode}
              />
              <p className="mt-2 text-sm text-[var(--muted)]">
                Si tienes un código fundador, ingrésalo antes de seleccionar
                Nava Local.
              </p>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {plans
                .filter(
                  (plan) =>
                    plan.monthlyPriceCents && plan.monthlyPriceCents > 0,
                )
                .map((plan) => (
                  <article
                    className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm"
                    key={plan.code}
                  >
                    <h2 className="text-2xl font-bold">{plan.name}</h2>
                    <p className="mt-2 text-lg text-[var(--muted)]">
                      {formatMoney(plan.monthlyPriceCents, plan.currencyCode)} /
                      mes
                    </p>
                    <button
                      className="mt-6 w-full rounded-lg bg-[var(--accent)] px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!session.canCheckout || submitting}
                      onClick={() => void beginCheckout(plan.code)}
                      type="button"
                    >
                      {submitting ? 'Preparando…' : `Elegir ${plan.name}`}
                    </button>
                  </article>
                ))}
            </div>
          </div>
        ) : null}

        {attempt ? (
          <section
            aria-live="polite"
            className="mt-8 rounded-2xl border border-black/10 bg-white p-6"
          >
            <h2 className="text-xl font-bold">
              Estado del pago: {attempt.status}
            </h2>
            <p className="mt-2 text-[var(--muted)]">
              {attempt.invoice.planName} ·{' '}
              {formatMoney(attempt.amountCents, attempt.currencyCode)}.
              Esperamos la confirmación verificable de PayPhone.
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              El enlace vence:{' '}
              {new Intl.DateTimeFormat('es-EC', {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(attempt.expiresAt))}
            </p>
          </section>
        ) : null}
      </section>
    </main>
  );
}
