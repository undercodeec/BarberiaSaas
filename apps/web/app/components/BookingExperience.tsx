'use client';

import type { PublicBookingCatalog } from '@barber-saas/api-client';
import { Country } from 'country-state-city';
import { useMemo, useState } from 'react';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/u, '') ??
  'http://localhost:4000';

type Step =
  | 'landing'
  | 'professional'
  | 'services'
  | 'schedule'
  | 'contact'
  | 'verify'
  | 'confirmed';

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function futureDates() {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  return Array.from({ length: 21 }, (_, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);
    return value;
  });
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('es-EC', {
    currency,
    style: 'currency',
  }).format(cents / 100);
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  return body?.message ?? 'No pudimos completar la solicitud.';
}

export function BookingExperience({
  catalog,
}: {
  catalog: PublicBookingCatalog;
}) {
  const [step, setStep] = useState<Step>('landing');
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const dates = useMemo(() => futureDates(), []);
  const [date, setDate] = useState(dates[0]!);
  const [slots, setSlots] = useState<
    ReadonlyArray<{ endsAt: string; startsAt: string }>
  >([]);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countries = useMemo(
    () =>
      Country.getAllCountries()
        .filter((country) => country.phonecode)
        .sort((first, second) => first.name.localeCompare(second.name, 'es')),
    [],
  );
  const [countryCode, setCountryCode] = useState(
    catalog.location.countryCode || 'EC',
  );
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [managementUrl, setManagementUrl] = useState<string | null>(null);
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  const professional = catalog.professionals.find(
    (item) => item.id === professionalId,
  );
  const availableServices = professional
    ? catalog.services.filter((service) =>
        professional.serviceIds.includes(service.id),
      )
    : [];
  const selectedServices = catalog.services.filter((service) =>
    serviceIds.includes(service.id),
  );
  const totalCents = selectedServices.reduce(
    (total, service) => total + service.priceCents,
    0,
  );
  const totalMinutes = selectedServices.reduce(
    (total, service) => total + service.durationMinutes,
    0,
  );
  const selectedCountry = countries.find(
    (country) => country.isoCode === countryCode,
  );
  const normalizedPhone = `+${selectedCountry?.phonecode.replace(/\D/gu, '') ?? ''}${phone.replace(/\D/gu, '')}`;

  const chooseProfessional = (id: string) => {
    setProfessionalId(id);
    setServiceIds([]);
    setStartsAt(null);
    setSlots([]);
    setError(null);
  };
  const toggleService = (id: string) => {
    setServiceIds((current) =>
      current.includes(id)
        ? current.filter((serviceId) => serviceId !== id)
        : [...current, id],
    );
    setStartsAt(null);
    setSlots([]);
    setError(null);
  };
  const loadAvailability = async (nextDate: Date = date) => {
    if (!professionalId || !serviceIds.length) return;
    setLoading(true);
    setError(null);
    setStartsAt(null);
    try {
      const query = new URLSearchParams({
        date: dateKey(nextDate),
        membershipId: professionalId,
        serviceIds: serviceIds.join(','),
      });
      const response = await fetch(
        `${API_URL}/v1/public/${catalog.organization.slug}/${catalog.location.slug}/availability?${query.toString()}`,
      );
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as {
        slots: ReadonlyArray<{ endsAt: string; startsAt: string }>;
      };
      setSlots(data.slots);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'No pudimos consultar.',
      );
    } finally {
      setLoading(false);
    }
  };
  const submitBooking = async () => {
    if (!professionalId || !startsAt) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/v1/public/${catalog.organization.slug}/${catalog.location.slug}/bookings`,
        {
          body: JSON.stringify({
            email,
            fullName,
            membershipId: professionalId,
            phone: normalizedPhone,
            policyAccepted,
            serviceIds,
            startsAt,
          }),
          headers: {
            'content-type': 'application/json',
            'idempotency-key': idempotencyKey,
          },
          method: 'POST',
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as {
        bookingId: string;
        developmentVerificationCode?: string;
      };
      setBookingId(result.bookingId);
      setDevelopmentCode(result.developmentVerificationCode ?? null);
      setStep('verify');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'No pudimos crear la reserva.',
      );
      setIdempotencyKey(crypto.randomUUID());
    } finally {
      setLoading(false);
    }
  };
  const verifyBooking = async () => {
    if (!bookingId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/v1/public/bookings/${bookingId}/verify`,
        {
          body: JSON.stringify({ code: verificationCode }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as {
        managementToken: string;
        managementUrl: string;
      };
      setManagementUrl(
        `${window.location.origin}/booking/${encodeURIComponent(
          result.managementToken,
        )}`,
      );
      setStep('confirmed');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No pudimos verificar el código.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f3ef] text-[#161616] [color-scheme:light]">
      <header className="border-b border-black/8 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-xs font-black tracking-[0.2em] uppercase">
              Nava
            </p>
            <p className="mt-1 text-sm text-black/55">
              Reservas de {catalog.organization.name}
            </p>
          </div>
          <div className="rounded-full bg-black px-4 py-2 text-xs font-bold text-white">
            {catalog.location.name}
          </div>
        </div>
      </header>

      {step === 'landing' ? (
        <Landing catalog={catalog} onBook={() => setStep('professional')} />
      ) : (
        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[1fr_330px]">
          <div className="rounded-[2rem] bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,.08)] sm:p-8">
            <Progress step={step} />
            {step === 'professional' ? (
              <>
                <Heading
                  copy="Selecciona la persona que realizará tu cita."
                  title="Elige un profesional"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  {catalog.professionals.map((item) => (
                    <button
                      className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${
                        professionalId === item.id
                          ? 'border-black bg-black text-white'
                          : 'border-black/10 hover:border-black/30'
                      }`}
                      key={item.id}
                      onClick={() => chooseProfessional(item.id)}
                      type="button"
                    >
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-[#ecebe6] font-black text-black">
                        {item.name.slice(0, 1)}
                      </span>
                      <span>
                        <span className="block font-black">{item.name}</span>
                        <span
                          className={`mt-1 block text-sm ${
                            professionalId === item.id
                              ? 'text-white/65'
                              : 'text-black/50'
                          }`}
                        >
                          {item.bio || 'Profesional de Nava'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                <NextButton
                  disabled={!professionalId}
                  label="Elegir servicios"
                  onClick={() => setStep('services')}
                />
              </>
            ) : null}

            {step === 'services' ? (
              <>
                <Back onClick={() => setStep('professional')} />
                <Heading
                  copy="Puedes combinar varios servicios consecutivos."
                  title="Selecciona tus servicios"
                />
                <div className="space-y-3">
                  {availableServices.map((service) => {
                    const selected = serviceIds.includes(service.id);
                    return (
                      <button
                        className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left ${
                          selected
                            ? 'border-black bg-[#f0efe9]'
                            : 'border-black/10'
                        }`}
                        key={service.id}
                        onClick={() => toggleService(service.id)}
                        type="button"
                      >
                        <span>
                          <span className="block font-black">
                            {service.name}
                          </span>
                          <span className="mt-1 block text-sm text-black/50">
                            {service.durationMinutes} min
                            {service.description
                              ? ` · ${service.description}`
                              : ''}
                          </span>
                        </span>
                        <span className="font-black">
                          {money(
                            service.priceCents,
                            catalog.location.currencyCode,
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <NextButton
                  disabled={!serviceIds.length}
                  label="Buscar horarios"
                  onClick={() => {
                    setStep('schedule');
                    void loadAvailability();
                  }}
                />
              </>
            ) : null}

            {step === 'schedule' ? (
              <>
                <Back onClick={() => setStep('services')} />
                <Heading
                  copy="Sólo mostramos espacios que cubren la duración completa."
                  title="Elige fecha y hora"
                />
                <div className="flex gap-2 overflow-x-auto pb-3">
                  {dates.map((item) => {
                    const selected = dateKey(item) === dateKey(date);
                    return (
                      <button
                        className={`min-w-16 rounded-2xl border px-3 py-3 ${
                          selected
                            ? 'border-black bg-black text-white'
                            : 'border-black/10'
                        }`}
                        key={dateKey(item)}
                        onClick={() => {
                          setDate(item);
                          void loadAvailability(item);
                        }}
                        type="button"
                      >
                        <span className="block text-[11px] font-bold uppercase opacity-65">
                          {item.toLocaleDateString('es-EC', {
                            weekday: 'short',
                          })}
                        </span>
                        <span className="mt-1 block text-lg font-black">
                          {item.getDate()}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {loading ? (
                  <p className="py-8 text-center text-black/50">
                    Consultando disponibilidad...
                  </p>
                ) : (
                  <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {slots.map((slot) => (
                      <button
                        className={`rounded-xl border px-3 py-3 text-sm font-black ${
                          startsAt === slot.startsAt
                            ? 'border-black bg-black text-white'
                            : 'border-black/10'
                        }`}
                        key={slot.startsAt}
                        onClick={() => setStartsAt(slot.startsAt)}
                        type="button"
                      >
                        {new Date(slot.startsAt).toLocaleTimeString('es-EC', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </button>
                    ))}
                  </div>
                )}
                {!loading && !slots.length ? (
                  <p className="rounded-2xl bg-[#f4f3ef] p-5 text-center text-sm text-black/55">
                    No hay espacios disponibles en esta fecha.
                  </p>
                ) : null}
                <NextButton
                  disabled={!startsAt}
                  label="Ingresar mis datos"
                  onClick={() => setStep('contact')}
                />
              </>
            ) : null}

            {step === 'contact' ? (
              <>
                <Back onClick={() => setStep('schedule')} />
                <Heading
                  copy="Usaremos estos datos únicamente para gestionar tu cita."
                  title="Tus datos"
                />
                <div className="space-y-4">
                  <Field
                    label="Nombre completo"
                    onChange={setFullName}
                    type="text"
                    value={fullName}
                  />
                  <Field
                    label="Correo electrónico"
                    onChange={setEmail}
                    type="email"
                    value={email}
                  />
                  <label className="block">
                    <span className="mb-2 block text-sm font-bold">
                      País y teléfono
                    </span>
                    <div className="grid gap-2 sm:grid-cols-[210px_1fr]">
                      <select
                        className="min-h-12 rounded-xl border border-black/15 bg-white px-3"
                        onChange={(event) => setCountryCode(event.target.value)}
                        value={countryCode}
                      >
                        {countries.map((country) => (
                          <option key={country.isoCode} value={country.isoCode}>
                            {country.flag} {country.name} +{country.phonecode}
                          </option>
                        ))}
                      </select>
                      <div className="flex min-h-12 items-center rounded-xl border border-black/15 px-3">
                        <span className="border-r border-black/10 pr-3 text-sm font-bold">
                          +{selectedCountry?.phonecode}
                        </span>
                        <input
                          className="min-w-0 flex-1 px-3 outline-none"
                          inputMode="tel"
                          onChange={(event) => setPhone(event.target.value)}
                          placeholder="Número de teléfono"
                          value={phone}
                        />
                      </div>
                    </div>
                  </label>
                  <label className="flex cursor-pointer gap-3 rounded-2xl bg-[#f4f3ef] p-4">
                    <input
                      checked={policyAccepted}
                      className="mt-1 h-4 w-4 accent-black"
                      onChange={(event) =>
                        setPolicyAccepted(event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span className="text-sm leading-6 text-black/65">
                      {catalog.policy.policyText}
                    </span>
                  </label>
                </div>
                {error ? <ErrorMessage message={error} /> : null}
                <NextButton
                  disabled={
                    loading ||
                    fullName.trim().length < 2 ||
                    !email.includes('@') ||
                    normalizedPhone.length < 9 ||
                    !policyAccepted
                  }
                  label={loading ? 'Creando reserva...' : 'Confirmar reserva'}
                  onClick={() => void submitBooking()}
                />
              </>
            ) : null}

            {step === 'verify' ? (
              <>
                <Heading
                  copy={`Enviamos un código de seis dígitos a ${email}. El horario está retenido durante 10 minutos.`}
                  title="Verifica tu correo"
                />
                <input
                  autoComplete="one-time-code"
                  className="mx-auto block w-full max-w-xs rounded-2xl border border-black/15 px-4 py-4 text-center text-3xl font-black tracking-[0.35em]"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) =>
                    setVerificationCode(
                      event.target.value.replace(/\D/gu, '').slice(0, 6),
                    )
                  }
                  value={verificationCode}
                />
                {developmentCode ? (
                  <p className="mt-3 text-center text-xs text-black/40">
                    Código local: {developmentCode}
                  </p>
                ) : null}
                {error ? <ErrorMessage message={error} /> : null}
                <NextButton
                  disabled={loading || verificationCode.length !== 6}
                  label={loading ? 'Verificando...' : 'Verificar y agendar'}
                  onClick={() => void verifyBooking()}
                />
              </>
            ) : null}

            {step === 'confirmed' ? (
              <div className="py-8 text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-black text-3xl text-white">
                  ✓
                </span>
                <h1 className="mt-6 text-4xl font-black tracking-[-0.04em]">
                  Cita agendada
                </h1>
                <p className="mx-auto mt-3 max-w-md text-black/55">
                  Enviamos los detalles a tu correo. Conserva el enlace privado
                  para confirmar asistencia, reprogramar o cancelar.
                </p>
                {managementUrl ? (
                  <a
                    className="mt-7 inline-flex rounded-full bg-black px-6 py-3 font-black text-white"
                    href={managementUrl}
                  >
                    Ver mi cita
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          <BookingSummary
            catalog={catalog}
            professionalName={professional?.name ?? null}
            selectedServices={selectedServices}
            startsAt={startsAt}
            totalCents={totalCents}
            totalMinutes={totalMinutes}
          />
        </section>
      )}
    </main>
  );
}

function Landing({
  catalog,
  onBook,
}: {
  catalog: PublicBookingCatalog;
  onBook: () => void;
}) {
  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-14 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
        <div>
          <p className="text-xs font-black tracking-[0.22em] uppercase">
            {catalog.location.city || 'Reserva online'}
          </p>
          <h1 className="mt-5 text-5xl leading-[.94] font-black tracking-[-0.06em] sm:text-7xl">
            Tu próxima cita,
            <span className="block text-black/35">sin llamadas.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-black/55">
            Elige profesional, combina servicios y reserva únicamente entre
            horarios disponibles.
          </p>
          <button
            className="mt-8 rounded-full bg-black px-7 py-4 font-black text-white"
            onClick={onBook}
            type="button"
          >
            Reservar cita
          </button>
        </div>
        <div className="rounded-[2rem] bg-black p-7 text-white">
          <p className="text-xs font-bold tracking-[0.18em] text-white/45 uppercase">
            {catalog.organization.name}
          </p>
          <h2 className="mt-3 text-3xl font-black">{catalog.location.name}</h2>
          <p className="mt-4 leading-7 text-white/60">
            {[catalog.location.addressLine, catalog.location.city]
              .filter(Boolean)
              .join(', ') || 'Consulta la ubicación con el negocio.'}
          </p>
          <p className="mt-8 border-t border-white/15 pt-6 text-sm text-white/50">
            Confirmación segura por correo · Reprogramación y cancelación online
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-10">
        <h2 className="text-3xl font-black tracking-[-0.04em]">Servicios</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.services.map((service) => (
            <div className="rounded-2xl bg-white p-5" key={service.id}>
              <p className="text-xs font-bold text-black/40 uppercase">
                {service.category || 'Servicio'}
              </p>
              <h3 className="mt-2 text-xl font-black">{service.name}</h3>
              <p className="mt-2 text-sm text-black/50">
                {service.durationMinutes} minutos
              </p>
              <p className="mt-5 text-lg font-black">
                {money(service.priceCents, catalog.location.currencyCode)}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-10">
        <h2 className="text-3xl font-black tracking-[-0.04em]">Equipo</h2>
        <div className="mt-6 flex gap-3 overflow-x-auto">
          {catalog.professionals.map((professional) => (
            <div
              className="min-w-64 rounded-2xl bg-white p-5"
              key={professional.id}
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#ecebe6] text-lg font-black">
                {professional.name.slice(0, 1)}
              </span>
              <h3 className="mt-4 font-black">{professional.name}</h3>
              <p className="mt-2 text-sm text-black/50">
                {professional.bio || 'Profesional del equipo'}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-10 pb-20">
        <h2 className="text-3xl font-black tracking-[-0.04em]">Reseñas</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {catalog.reviews.slice(0, 6).map((review) => (
            <blockquote className="rounded-2xl bg-white p-5" key={review.id}>
              <p className="text-lg tracking-widest">
                {'★'.repeat(review.rating)}
              </p>
              <p className="mt-3 leading-7 text-black/65">
                {review.comment || 'Excelente servicio.'}
              </p>
              <footer className="mt-4 text-sm font-black">
                {review.clientName}
              </footer>
            </blockquote>
          ))}
          {!catalog.reviews.length ? (
            <p className="rounded-2xl bg-white p-5 text-black/50">
              Las reseñas verificadas aparecerán después de citas completadas.
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}

function BookingSummary({
  catalog,
  professionalName,
  selectedServices,
  startsAt,
  totalCents,
  totalMinutes,
}: {
  catalog: PublicBookingCatalog;
  professionalName: string | null;
  selectedServices: PublicBookingCatalog['services'];
  startsAt: string | null;
  totalCents: number;
  totalMinutes: number;
}) {
  return (
    <aside className="h-fit rounded-[2rem] bg-black p-6 text-white lg:sticky lg:top-6">
      <p className="text-xs font-bold tracking-[0.18em] text-white/45 uppercase">
        Tu cita
      </p>
      <h2 className="mt-2 text-2xl font-black">{catalog.organization.name}</h2>
      <dl className="mt-6 space-y-4 text-sm">
        <SummaryItem
          label="Profesional"
          value={professionalName || 'Por seleccionar'}
        />
        <SummaryItem
          label="Servicios"
          value={
            selectedServices.length
              ? selectedServices.map((service) => service.name).join(', ')
              : 'Por seleccionar'
          }
        />
        <SummaryItem
          label="Duración"
          value={totalMinutes ? `${totalMinutes} min` : '—'}
        />
        <SummaryItem
          label="Horario"
          value={
            startsAt
              ? new Date(startsAt).toLocaleString('es-EC', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : 'Por seleccionar'
          }
        />
      </dl>
      <div className="mt-6 flex items-end justify-between border-t border-white/15 pt-5">
        <span className="text-sm text-white/50">Total</span>
        <strong className="text-2xl">
          {money(totalCents, catalog.location.currencyCode)}
        </strong>
      </div>
    </aside>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4">
      <dt className="w-20 text-white/45">{label}</dt>
      <dd className="flex-1 text-right font-bold">{value}</dd>
    </div>
  );
}

function Progress({ step }: { step: Step }) {
  const order: Step[] = [
    'professional',
    'services',
    'schedule',
    'contact',
    'verify',
    'confirmed',
  ];
  const value = Math.max(order.indexOf(step) + 1, 1);
  return (
    <div className="mb-8 h-1.5 overflow-hidden rounded-full bg-black/8">
      <div
        className="h-full rounded-full bg-black transition-all"
        style={{ width: `${(value / order.length) * 100}%` }}
      />
    </div>
  );
}

function Heading({ copy, title }: { copy: string; title: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 text-black/50">{copy}</p>
    </div>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="mb-6 text-sm font-black text-black/50 hover:text-black"
      onClick={onClick}
      type="button"
    >
      ← Regresar
    </button>
  );
}

function NextButton({
  disabled,
  label,
  onClick,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="mt-8 w-full rounded-2xl bg-black px-5 py-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-30"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Field({
  label,
  onChange,
  type,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type: 'email' | 'text';
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold">{label}</span>
      <input
        className="min-h-12 w-full rounded-xl border border-black/15 px-4 outline-none focus:border-black"
        onChange={(event) => onChange(event.target.value)}
        required
        type={type}
        value={value}
      />
    </label>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">
      {message}
    </p>
  );
}
