'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';

import {
  formatPhoneNumber,
  getRegistrationCountryOptions,
  validateRegistrationBeforeSubmit,
} from './registration';
import { detectTimezone, TIMEZONE_OPTIONS } from './timezones';

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
  readonly invoice: {
    readonly discount: {
      readonly code: string;
      readonly discountCents: number;
      readonly percentage: number;
    } | null;
    readonly planName: string;
    readonly status: string;
  };
  readonly paymentUrl: string | null;
  readonly status: string;
}

interface ApiError {
  readonly message?: string;
}

type AccessView = 'login' | 'register' | 'setup' | 'verify';

type RegistrationForm = {
  accountType: 'business' | 'professional';
  businessCategory:
    | 'AESTHETICS'
    | 'BARBERSHOP'
    | 'BEAUTY_SALON'
    | 'NAIL_STUDIO'
    | 'PERSONAL_CARE_OTHER'
    | 'SPA_WELLNESS';
  businessName: string;
  city: string;
  closingTime: string;
  confirmPassword: string;
  countryCode: string;
  email: string;
  fullName: string;
  marketingOptIn: boolean;
  openingTime: string;
  password: string;
  phoneCountryCode: string;
  phone: string;
  privacyPolicyAccepted: boolean;
  timezone: string;
};

type FirstServiceForm = {
  durationMinutes: number;
  name: string;
  price: number;
};

const commercialPlans = [
  {
    code: 'free',
    description: 'Para conocer Nava',
    featured: false,
    name: 'Nava Free',
    price: 'USD 0',
  },
  {
    code: 'essential',
    description: 'Para quien trabaja solo',
    featured: false,
    name: 'Nava Esencial',
    price: 'USD 9,83',
  },
  {
    code: 'local',
    description: 'Para un negocio que trabaja en equipo',
    featured: true,
    name: 'Nava Local',
    price: 'USD 29,83',
  },
  {
    code: 'multi',
    description: 'Para crecer con varias sedes',
    featured: false,
    name: 'Nava Multi',
    price: 'USD 48,83',
  },
] as const;

const comparisonGroups = [
  {
    label: 'Operación diaria',
    features: [
      {
        label: 'Profesionales totales por organización',
        values: ['1', '1', 'Hasta 12', 'Hasta 40'],
      },
      { label: 'Sucursales', values: ['1', '1', 'Hasta 3', 'Hasta 6'] },
      {
        label: 'Reservas',
        values: ['25 / 30 días', 'Ilimitadas', 'Ilimitadas', 'Ilimitadas'],
      },
      {
        label: 'Clientes activos',
        values: ['100', 'Ilimitados', 'Ilimitados', 'Ilimitados'],
      },
    ],
  },
  {
    label: 'Reservas y clientes',
    features: [
      { label: 'Agenda y reservas online', values: [true, true, true, true] },
      { label: 'Historial de clientes', values: [true, true, true, true] },
      { label: 'Servicios y horarios', values: [true, true, true, true] },
      {
        label: 'Reservas directas sin comisión',
        values: [false, false, true, true],
      },
    ],
  },
  {
    label: 'Control del negocio',
    features: [
      { label: 'Caja', values: [true, true, true, true] },
      { label: 'Reportes completos', values: [false, true, true, true] },
      { label: 'Comisiones', values: [false, false, true, true] },
      { label: 'Inventario', values: [false, true, true, true] },
      { label: 'Roles y permisos', values: [false, false, true, true] },
    ],
  },
] as const;

function FeatureValue({
  dark = false,
  value,
}: {
  readonly dark?: boolean;
  readonly value: boolean | string;
}) {
  if (typeof value === 'string')
    return <span className="subscription-value-text">{value}</span>;

  return (
    <svg
      aria-label={value ? 'Incluido' : 'No incluido'}
      className={dark ? 'subscription-glyph is-dark' : 'subscription-glyph'}
      fill="none"
      role="img"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.8"
      viewBox="0 0 24 24"
    >
      <path d={value ? 'M20 6 9 17l-5-5' : 'M6 12h12'} />
    </svg>
  );
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
  const router = useRouter();
  const registrationCountries = useMemo(
    () => getRegistrationCountryOptions(),
    [],
  );
  const [plans, setPlans] = useState<Plan[]>([]);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(null);
  const [isAccessDialogOpen, setIsAccessDialogOpen] = useState(false);
  const [accessView, setAccessView] = useState<AccessView>('login');
  const [selectedPlanCode, setSelectedPlanCode] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [firstService, setFirstService] = useState<FirstServiceForm>({
    durationMinutes: 30,
    name: '',
    price: 0,
  });
  const [registration, setRegistration] = useState<RegistrationForm>({
    accountType: 'business',
    businessCategory: 'BARBERSHOP',
    businessName: '',
    city: '',
    closingTime: '19:00',
    confirmPassword: '',
    countryCode: 'EC',
    email: '',
    fullName: '',
    marketingOptIn: false,
    openingTime: '09:00',
    password: '',
    phoneCountryCode: 'EC',
    phone: '',
    privacyPolicyAccepted: false,
    timezone: detectTimezone(),
  });

  const loadSession = useCallback(async () => {
    try {
      const nextSession = await requestJson<CheckoutSession>('session');
      setSession(nextSession);
      return nextSession;
    } catch {
      setSession(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void Promise.all([
        requestJson<{ plans: Plan[] }>('plans').then(({ plans: result }) =>
          setPlans(result),
        ),
        loadSession(),
      ]).catch(() =>
        setError('No pudimos cargar los planes. Inténtalo nuevamente.'),
      );
    });
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
      const nextSession = await loadSession();
      if (nextSession?.reason === 'onboarding_required') {
        setAccessView('setup');
      } else if (nextSession && selectedPlanCode) {
        setIsAccessDialogOpen(false);
        router.push(`/checkout?plan=${encodeURIComponent(selectedPlanCode)}`);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'No pudimos iniciar sesión.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateRegistrationBeforeSubmit(
      registration.privacyPolicyAccepted,
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    const { phoneCountryCode, ...registrationInput } = registration;
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestJson<{ email: string }>('auth/register', {
        body: JSON.stringify({
          ...registrationInput,
          phone: formatPhoneNumber(phoneCountryCode, registration.phone),
        }),
        method: 'POST',
      });
      setVerificationEmail(result.email);
      setVerificationCode('');
      setAccessView('verify');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No pudimos iniciar tu registro.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestJson('auth/verify-email', {
        body: JSON.stringify({
          code: verificationCode,
          email: verificationEmail,
        }),
        method: 'POST',
      });
      await loadSession();
      setAccessView('setup');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No pudimos verificar el código.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openAccessDialog(view: AccessView) {
    setError(null);
    setAccessView(view);
    setIsAccessDialogOpen(true);
  }

  function selectPlan(planCode: string) {
    if (planCode === 'free') {
      setSelectedPlanCode(null);
      openAccessDialog('register');
      return;
    }
    if (session) {
      router.push(`/checkout?plan=${encodeURIComponent(planCode)}`);
      return;
    }
    setSelectedPlanCode(planCode);
    openAccessDialog('login');
  }

  async function completeAccountSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestJson('onboarding/services', {
        body: JSON.stringify({
          agendaColor: '#B7791F',
          category: null,
          description: null,
          downPaymentPercentage: 0,
          durationMinutes: firstService.durationMinutes,
          imageUri: null,
          name: firstService.name,
          onlineBooking: true,
          price: firstService.price,
          priceType: firstService.price === 0 ? 'free' : 'fixed',
          showServiceTime: true,
          tax: null,
        }),
        method: 'POST',
      });
      await requestJson('onboarding/complete-account-setup', {
        body: '{}',
        method: 'POST',
      });
      const nextSession = await loadSession();
      if (nextSession && selectedPlanCode) {
        setIsAccessDialogOpen(false);
        router.push(`/checkout?plan=${encodeURIComponent(selectedPlanCode)}`);
      } else {
        setIsAccessDialogOpen(false);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No pudimos completar la configuración del negocio.',
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
    <main className="subscription-page min-h-screen bg-[var(--surface)] px-6 py-12 text-[var(--ink)] sm:px-10">
      <header className="commercial-nav">
        <a aria-label="Nava, inicio" className="commercial-logo" href="/">
          <img alt="Nava" src="/images/nava-logo.png" />
        </a>
        <nav aria-label="Navegación principal">
          <a href="/politicas">Políticas</a>
          <a href="https://wa.me/593979046329">Soporte</a>
        </nav>
        <div className="subscription-access-actions">
          <button onClick={() => openAccessDialog('login')} type="button">
            Iniciar sesión
          </button>
          <button
            className="is-primary"
            onClick={() => openAccessDialog('register')}
            type="button"
          >
            Registrarme
          </button>
        </div>
      </header>
      <section className="subscription-shell mx-auto max-w-3xl" id="checkout">
        <p className="eyebrow">Nava · Suscripción</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          Elige el plan para tu negocio.
        </h1>
        <p className="mt-4 max-w-2xl text-[var(--muted)]">
          Los cobros se confirman únicamente después de la validación del
          proveedor. El regreso desde PayPhone no activa el plan por sí solo.
        </p>
        <div className="subscription-assurance">
          <span>10 días de prueba</span>
          <span>Renovación manual</span>
          <span>Sin cargos inesperados</span>
        </div>
        <section
          className="subscription-comparison"
          aria-labelledby="comparison-title"
        >
          <div className="subscription-comparison-heading">
            <div>
              <p>Planes Nava</p>
              <h2 id="comparison-title">Cada detalle, comparado.</h2>
              <span>
                Elige lo que tu operación necesita hoy. Puedes crecer de plan
                cuando el negocio lo requiera.
              </span>
            </div>
            <div className="subscription-cycle">
              <span>Facturación</span>
              <strong>Ciclo de 30 días</strong>
              <small>Renovación manual</small>
            </div>
          </div>

          <div className="subscription-matrix" role="table">
            <div className="subscription-matrix-brand" role="columnheader">
              <span>N</span>
              <p>
                Planes para
                <br />
                cada etapa
              </p>
            </div>
            {commercialPlans.map((plan) => (
              <div
                className={
                  plan.featured
                    ? 'subscription-matrix-plan is-highlighted'
                    : 'subscription-matrix-plan'
                }
                key={plan.name}
                role="columnheader"
              >
                {plan.featured ? <b>Recomendado</b> : null}
                <h3>{plan.name}</h3>
                <strong>
                  {plan.price}
                  <em>{plan.price === 'USD 0' ? '' : ' / mes'}</em>
                </strong>
                <p>{plan.description}</p>
                <a
                  href={
                    plan.code === 'free'
                      ? '#registrarme'
                      : `/checkout?plan=${plan.code}`
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    selectPlan(plan.code);
                  }}
                >
                  {plan.price === 'USD 0'
                    ? 'Empezar gratis'
                    : 'Elegir ' + plan.name}
                </a>
              </div>
            ))}

            {comparisonGroups.map((group) => (
              <div className="subscription-matrix-group" key={group.label}>
                <div>{group.label}</div>
                {commercialPlans.map((plan) => (
                  <div
                    aria-hidden="true"
                    className={plan.featured ? 'is-highlighted' : undefined}
                    key={plan.name}
                  />
                ))}
                {group.features.map((feature) => (
                  <div
                    className="subscription-matrix-row"
                    key={feature.label}
                    role="row"
                  >
                    <div role="rowheader">{feature.label}</div>
                    {feature.values.map((value, index) => (
                      <div
                        className={index === 2 ? 'is-highlighted' : undefined}
                        key={commercialPlans[index]!.name}
                        role="cell"
                      >
                        <FeatureValue dark={index === 2} value={value} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}

            <div className="subscription-matrix-actions">
              <span aria-hidden="true" />
              {commercialPlans.map((plan) => (
                <div
                  className={plan.featured ? 'is-highlighted' : undefined}
                  key={plan.name}
                >
                  <a
                    href={
                      plan.code === 'free'
                        ? '#registrarme'
                        : `/checkout?plan=${plan.code}`
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      selectPlan(plan.code);
                    }}
                  >
                    {plan.price === 'USD 0'
                      ? 'Elegir Free'
                      : 'Elegir ' + plan.name.replace('Nava ', '')}
                  </a>
                </div>
              ))}
            </div>
          </div>

          <div className="subscription-mobile-plans">
            {[
              commercialPlans[2],
              commercialPlans[0],
              commercialPlans[1],
              commercialPlans[3],
            ].map((plan) => {
              const planIndex = commercialPlans.indexOf(plan);
              return (
                <article
                  className={plan.featured ? 'is-highlighted' : undefined}
                  key={plan.name}
                >
                  {plan.featured ? <b>Recomendado</b> : null}
                  <h3>{plan.name}</h3>
                  <strong>
                    {plan.price}
                    <em>{plan.price === 'USD 0' ? '' : ' / mes'}</em>
                  </strong>
                  <p>{plan.description}</p>
                  <a
                    href={
                      plan.code === 'free'
                        ? '#registrarme'
                        : `/checkout?plan=${plan.code}`
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      selectPlan(plan.code);
                    }}
                  >
                    {plan.price === 'USD 0'
                      ? 'Empezar gratis'
                      : 'Elegir ' + plan.name}
                  </a>
                  {comparisonGroups.map((group) => (
                    <section key={group.label}>
                      <h4>{group.label}</h4>
                      <dl>
                        {group.features.map((feature) => (
                          <div key={feature.label}>
                            <dt>{feature.label}</dt>
                            <dd>
                              <FeatureValue
                                dark={plan.featured}
                                value={feature.values[planIndex]!}
                              />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ))}
                </article>
              );
            })}
          </div>
          <p className="subscription-comparison-note">
            Todos los planes comienzan con 10 días de prueba. No hay renovación
            automática. El máximo de profesionales se cuenta por organización,
            no por sucursal; puedes distribuirlos entre tus sucursales sin
            duplicar el conteo.
          </p>
        </section>

        {isAccessDialogOpen ? (
          <div className="subscription-access-overlay">
            <button
              aria-label="Cerrar acceso"
              className="subscription-access-backdrop"
              onClick={() => setIsAccessDialogOpen(false)}
              type="button"
            />
            <section
              aria-label="Acceso a Nava"
              aria-modal="true"
              className="subscription-access-dialog"
              role="dialog"
            >
              <button
                aria-label="Cerrar"
                className="subscription-access-close"
                onClick={() => setIsAccessDialogOpen(false)}
                type="button"
              >
                ×
              </button>
              <div className="subscription-access-intro">
                <span>N</span>
                <p>Acceso Nava</p>
                <h2>
                  {accessView === 'register'
                    ? 'Crea tu espacio.'
                    : accessView === 'verify'
                      ? 'Verifica tu correo.'
                      : accessView === 'setup'
                        ? 'Tu primer servicio.'
                        : 'Continúa con tu negocio.'}
                </h2>
                <small>
                  {accessView === 'register'
                    ? 'Completa los datos de tu negocio y activa tus 10 días de prueba.'
                    : accessView === 'verify'
                      ? 'Te enviamos un código de seis dígitos para activar la cuenta.'
                      : accessView === 'setup'
                        ? 'Este paso crea tu negocio y deja lista la suscripción.'
                        : 'Inicia sesión para elegir, contratar o renovar un plan.'}
                </small>
              </div>
              <div className="subscription-access-content">
                {!session && accessView !== 'verify' ? (
                  <div className="subscription-access-tabs">
                    <button
                      className={
                        accessView === 'login' ? 'is-active' : undefined
                      }
                      onClick={() => {
                        setError(null);
                        setAccessView('login');
                      }}
                      type="button"
                    >
                      Iniciar sesión
                    </button>
                    <button
                      className={
                        accessView === 'register' ? 'is-active' : undefined
                      }
                      onClick={() => {
                        setError(null);
                        setAccessView('register');
                      }}
                      type="button"
                    >
                      Registrarme
                    </button>
                  </div>
                ) : null}

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

                {!loading && !session && accessView === 'login' ? (
                  <form
                    className="mt-8 max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-sm"
                    onSubmit={login}
                  >
                    <h2 className="text-xl font-bold">
                      Inicia sesión para continuar
                    </h2>
                    <label
                      className="mt-5 block text-sm font-semibold"
                      htmlFor="email"
                    >
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

                {!loading && !session && accessView === 'register' ? (
                  <form
                    className="subscription-registration-form"
                    onSubmit={register}
                  >
                    <h2>Crea tu cuenta</h2>
                    <p>
                      Todos los campos son necesarios para configurar tu
                      negocio.
                    </p>
                    <div className="subscription-form-grid">
                      <label>
                        Nombre completo
                        <input
                          onChange={(event) =>
                            setRegistration((current) => ({
                              ...current,
                              fullName: event.target.value,
                            }))
                          }
                          required
                          value={registration.fullName}
                        />
                      </label>
                      <label>
                        Correo
                        <input
                          onChange={(event) =>
                            setRegistration((current) => ({
                              ...current,
                              email: event.target.value,
                            }))
                          }
                          required
                          type="email"
                          value={registration.email}
                        />
                      </label>
                      <label>
                        País de atención
                        <select
                          aria-label="País"
                          onChange={(event) =>
                            setRegistration((current) => ({
                              ...current,
                              countryCode: event.target.value,
                            }))
                          }
                          required
                          value={registration.countryCode}
                        >
                          {registrationCountries.map((country) => (
                            <option key={country.code} value={country.code}>
                              {country.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Código de país
                        <select
                          aria-label="Código de país"
                          onChange={(event) =>
                            setRegistration((current) => ({
                              ...current,
                              phoneCountryCode: event.target.value,
                            }))
                          }
                          required
                          value={registration.phoneCountryCode}
                        >
                          {registrationCountries.map((country) => (
                            <option key={country.code} value={country.code}>
                              {country.name} ({country.dial})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Teléfono
                        <input
                          inputMode="tel"
                          onChange={(event) =>
                            setRegistration((current) => ({
                              ...current,
                              phone: event.target.value,
                            }))
                          }
                          placeholder="Número de teléfono"
                          required
                          value={registration.phone}
                        />
                      </label>
                      <label>
                        Ciudad
                        <input
                          onChange={(event) =>
                            setRegistration((current) => ({
                              ...current,
                              city: event.target.value,
                            }))
                          }
                          required
                          value={registration.city}
                        />
                      </label>
                      <label>
                        Zona horaria del negocio
                        <select
                          aria-label="Zona horaria"
                          onChange={(event) =>
                            setRegistration((current) => ({
                              ...current,
                              timezone: event.target.value,
                            }))
                          }
                          required
                          value={registration.timezone}
                        >
                          {TIMEZONE_OPTIONS.map((timezone) => (
                            <option key={timezone.value} value={timezone.value}>
                              {timezone.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Tipo de cuenta
                        <select
                          onChange={(event) =>
                            setRegistration((current) => ({
                              ...current,
                              accountType: event.target
                                .value as RegistrationForm['accountType'],
                            }))
                          }
                          value={registration.accountType}
                        >
                          <option value="business">Negocio</option>
                          <option value="professional">
                            Profesional independiente
                          </option>
                        </select>
                      </label>
                      <label>
                        Tipo de negocio
                        <select
                          onChange={(event) =>
                            setRegistration((current) => ({
                              ...current,
                              businessCategory: event.target
                                .value as RegistrationForm['businessCategory'],
                            }))
                          }
                          value={registration.businessCategory}
                        >
                          <option value="BARBERSHOP">Barbería</option>
                          <option value="BEAUTY_SALON">Salón de belleza</option>
                          <option value="NAIL_STUDIO">Estudio de uñas</option>
                          <option value="SPA_WELLNESS">Spa y bienestar</option>
                          <option value="AESTHETICS">Centro de estética</option>
                          <option value="PERSONAL_CARE_OTHER">
                            Otro cuidado personal
                          </option>
                        </select>
                      </label>
                      <label>
                        Nombre del negocio
                        <input
                          onChange={(event) =>
                            setRegistration((current) => ({
                              ...current,
                              businessName: event.target.value,
                            }))
                          }
                          required
                          value={registration.businessName}
                        />
                      </label>
                      <label>
                        Apertura
                        <input
                          onChange={(event) =>
                            setRegistration((current) => ({
                              ...current,
                              openingTime: event.target.value,
                            }))
                          }
                          required
                          type="time"
                          value={registration.openingTime}
                        />
                      </label>
                      <label>
                        Cierre
                        <input
                          onChange={(event) =>
                            setRegistration((current) => ({
                              ...current,
                              closingTime: event.target.value,
                            }))
                          }
                          required
                          type="time"
                          value={registration.closingTime}
                        />
                      </label>
                      <label>
                        Contraseña
                        <input
                          minLength={8}
                          onChange={(event) =>
                            setRegistration((current) => ({
                              ...current,
                              password: event.target.value,
                            }))
                          }
                          required
                          type="password"
                          value={registration.password}
                        />
                      </label>
                      <label>
                        Repite tu contraseña
                        <input
                          minLength={8}
                          onChange={(event) =>
                            setRegistration((current) => ({
                              ...current,
                              confirmPassword: event.target.value,
                            }))
                          }
                          required
                          type="password"
                          value={registration.confirmPassword}
                        />
                      </label>
                    </div>
                    <label className="subscription-checkbox">
                      <input
                        checked={registration.privacyPolicyAccepted}
                        onChange={(event) =>
                          setRegistration((current) => ({
                            ...current,
                            privacyPolicyAccepted: event.target.checked,
                          }))
                        }
                        required
                        type="checkbox"
                      />
                      <span>
                        Acepto la{' '}
                        <a href="/tratamiento-de-datos" target="_blank">
                          Política de Privacidad
                        </a>{' '}
                        y declaro tener 18 años o capacidad legal para
                        contratar.
                      </span>
                    </label>
                    <label className="subscription-checkbox">
                      <input
                        checked={registration.marketingOptIn}
                        onChange={(event) =>
                          setRegistration((current) => ({
                            ...current,
                            marketingOptIn: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      <span>Quiero recibir novedades y ofertas de Nava.</span>
                    </label>
                    <button disabled={submitting} type="submit">
                      {submitting ? 'Preparando…' : 'Crear cuenta'}
                    </button>
                  </form>
                ) : null}

                {!loading && !session && accessView === 'verify' ? (
                  <form
                    className="subscription-verification-form"
                    onSubmit={verifyEmail}
                  >
                    <h2>Revisa tu correo</h2>
                    <p>
                      Escribe el código enviado a{' '}
                      <strong>{verificationEmail}</strong>.
                    </p>
                    <label>
                      Código de verificación
                      <input
                        inputMode="numeric"
                        maxLength={6}
                        onChange={(event) =>
                          setVerificationCode(event.target.value)
                        }
                        pattern="[0-9]{6}"
                        required
                        value={verificationCode}
                      />
                    </label>
                    <button disabled={submitting} type="submit">
                      {submitting ? 'Verificando…' : 'Verificar cuenta'}
                    </button>
                    <button
                      className="subscription-text-button"
                      onClick={() => setAccessView('register')}
                      type="button"
                    >
                      Corregir datos de registro
                    </button>
                  </form>
                ) : null}

                {session && accessView === 'setup' ? (
                  <form
                    className="subscription-verification-form"
                    onSubmit={completeAccountSetup}
                  >
                    <h2>Configura tu primer servicio</h2>
                    <p>
                      Crearemos tu negocio, la sede principal, tus horarios y
                      este primer servicio.
                    </p>
                    <label>
                      Nombre del servicio
                      <input
                        minLength={2}
                        onChange={(event) =>
                          setFirstService((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Ej. Corte clásico"
                        required
                        value={firstService.name}
                      />
                    </label>
                    <div className="subscription-form-grid">
                      <label>
                        Duración (minutos)
                        <input
                          min={5}
                          onChange={(event) =>
                            setFirstService((current) => ({
                              ...current,
                              durationMinutes: Number(event.target.value),
                            }))
                          }
                          required
                          step={5}
                          type="number"
                          value={firstService.durationMinutes}
                        />
                      </label>
                      <label>
                        Precio (USD)
                        <input
                          min={0}
                          onChange={(event) =>
                            setFirstService((current) => ({
                              ...current,
                              price: Number(event.target.value),
                            }))
                          }
                          required
                          step="0.01"
                          type="number"
                          value={firstService.price}
                        />
                      </label>
                    </div>
                    <button disabled={submitting} type="submit">
                      {submitting
                        ? 'Creando negocio…'
                        : 'Crear negocio y continuar'}
                    </button>
                  </form>
                ) : null}

                {session && accessView !== 'setup' ? (
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
                        onChange={(event) =>
                          setDiscountCode(event.target.value)
                        }
                        placeholder="Opcional"
                        value={discountCode}
                      />
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        Si tienes un código fundador, ingrésalo antes de
                        seleccionar Nava Local.
                      </p>
                    </div>
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      {plans
                        .filter(
                          (plan) =>
                            plan.monthlyPriceCents &&
                            plan.monthlyPriceCents > 0,
                        )
                        .map((plan) => (
                          <article
                            className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm"
                            key={plan.code}
                          >
                            <h2 className="text-2xl font-bold">{plan.name}</h2>
                            <p className="mt-2 text-lg text-[var(--muted)]">
                              {formatMoney(
                                plan.monthlyPriceCents,
                                plan.currencyCode,
                              )}{' '}
                              / mes
                            </p>
                            <button
                              className="mt-6 w-full rounded-lg bg-[var(--accent)] px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={!session.canCheckout || submitting}
                              onClick={() => void beginCheckout(plan.code)}
                              type="button"
                            >
                              {submitting
                                ? 'Preparando…'
                                : `Elegir ${plan.name}`}
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
                    {attempt.invoice.discount ? (
                      <p className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
                        Cupón <strong>{attempt.invoice.discount.code}</strong>{' '}
                        aplicado: {attempt.invoice.discount.percentage}% de
                        descuento ({formatMoney(
                          attempt.invoice.discount.discountCents,
                          attempt.currencyCode,
                        )} de ahorro). El total mostrado ya incluye este
                        descuento; el canje se confirma al validarse el pago.
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      El enlace vence:{' '}
                      {new Intl.DateTimeFormat('es-EC', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(attempt.expiresAt))}
                    </p>
                  </section>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
