'use client';

import type { PublicBookingCatalog } from '@barber-saas/api-client';
import { Country } from 'country-state-city';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';

import bookingHero from './booking-hero.png';

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

type TimeOfDay = 'afternoon' | 'all' | 'evening' | 'morning';

const TIME_OF_DAY_OPTIONS: ReadonlyArray<{
  id: TimeOfDay;
  label: string;
  matches: (hour: number) => boolean;
}> = [
  { id: 'all', label: 'Todo el día', matches: () => true },
  { id: 'morning', label: 'Mañana', matches: (hour) => hour < 12 },
  {
    id: 'afternoon',
    label: 'Tarde',
    matches: (hour) => hour >= 12 && hour < 18,
  },
  { id: 'evening', label: 'Noche', matches: (hour) => hour >= 18 },
];

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

function hourAtLocation(isoDate: string, timezone: string) {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: timezone,
    }).format(new Date(isoDate)),
  );
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
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('all');
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
  const visibleSlots = slots.filter((slot) => {
    const option = TIME_OF_DAY_OPTIONS.find((item) => item.id === timeOfDay);
    return (
      option?.matches(
        hourAtLocation(slot.startsAt, catalog.location.timezone),
      ) ?? false
    );
  });

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
    <main className="min-h-screen overflow-x-hidden bg-[#FAF9F6] text-[#1C1C1C] [color-scheme:light]">

      {step === 'landing' ? (
        <Landing catalog={catalog} onBook={() => setStep('professional')} />
      ) : (
        <section className="mx-auto grid w-full max-w-6xl min-w-0 gap-6 px-4 py-6 sm:px-5 sm:py-8 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-8">
          <div className="min-w-0 rounded-[2rem] bg-white p-4 shadow-[0_24px_80px_rgba(0,0,0,.08)] sm:p-8">
            <button
              className="mb-5 inline-flex min-h-10 items-center rounded-full border border-[#E4E1DA] bg-[#FAF9F6] px-4 text-sm font-black text-[#555A63] transition hover:border-[#E1B85B] hover:text-[#1C1C1C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B47D17]"
              onClick={() => setStep('landing')}
              type="button"
            >
              Volver al inicio
            </button>

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
                      className={`flex min-w-0 items-center gap-4 rounded-2xl border p-4 text-left transition ${
                        professionalId === item.id
                          ? 'border-[#B47D17] bg-[#EBD8AA] text-[#1C1C1C]'
                          : 'border-black/10 hover:border-black/30'
                      }`}
                      key={item.id}
                      onClick={() => chooseProfessional(item.id)}
                      type="button"
                    >
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-[#ecebe6] font-black text-black">
                        {item.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-black">
                          {item.name}
                        </span>
                        <span
                          className={`mt-1 block truncate text-sm ${
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
                        className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border p-4 text-left ${
                          selected
                            ? 'border-black bg-[#f0efe9]'
                            : 'border-black/10'
                        }`}
                        key={service.id}
                        onClick={() => toggleService(service.id)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-black">
                            {service.name}
                          </span>
                          <span className="mt-1 block truncate text-sm text-black/50">
                            {service.durationMinutes} min
                            {service.description
                              ? ` · ${service.description}`
                              : ''}
                          </span>
                        </span>
                        <span className="shrink-0 font-black">
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
                        className={`min-w-16 shrink-0 rounded-2xl border px-3 py-3 ${
                          selected
                            ? 'border-[#B47D17] bg-[#EBD8AA] text-[#1C1C1C]'
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
                <div
                  aria-label="Filtrar horarios"
                  className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-4"
                  role="group"
                >
                  {TIME_OF_DAY_OPTIONS.map((option) => {
                    const selected = timeOfDay === option.id;
                    return (
                      <button
                        aria-pressed={selected}
                        className={`min-w-0 rounded-xl border px-2 py-2.5 text-xs font-black transition sm:text-sm ${
                          selected
                            ? 'border-[#B47D17] bg-[#EBD8AA] text-[#1C1C1C]'
                            : 'border-black/10 bg-white text-black hover:border-black/30'
                        }`}
                        key={option.id}
                        onClick={() => {
                          setTimeOfDay(option.id);
                          setStartsAt(null);
                        }}
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {loading ? (
                  <p className="py-8 text-center text-black/50">
                    Consultando disponibilidad...
                  </p>
                ) : (
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {visibleSlots.map((slot) => (
                      <button
                        className={`w-full min-w-0 rounded-xl border px-2 py-3 text-sm font-black whitespace-nowrap ${
                          startsAt === slot.startsAt
                            ? 'border-[#B47D17] bg-[#EBD8AA] text-[#1C1C1C]'
                            : 'border-black/10'
                        }`}
                        key={slot.startsAt}
                        onClick={() => setStartsAt(slot.startsAt)}
                        type="button"
                      >
                        {new Date(slot.startsAt).toLocaleTimeString('es-EC', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: catalog.location.timezone,
                        })}
                      </button>
                    ))}
                  </div>
                )}
                {!loading && !visibleSlots.length ? (
                  <p className="rounded-2xl bg-[#f4f3ef] p-5 text-center text-sm text-black/55">
                    No hay horarios disponibles durante la{' '}
                    {TIME_OF_DAY_OPTIONS.find(
                      (item) => item.id === timeOfDay,
                    )?.label.toLowerCase()}
                    .
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
  return <PublicBookingLanding catalog={catalog} onBook={onBook} />;
  /* Previous landing kept below temporarily while the booking flow remains unchanged.
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
  */
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
    <aside className="h-fit min-w-0 rounded-[2rem] border border-[#E4E1DA] bg-white p-5 text-[#1C1C1C] shadow-[0_16px_40px_rgba(28,28,28,.06)] sm:p-6 lg:sticky lg:top-6">
      <p className="text-xs font-bold tracking-[0.18em] text-[#555A63] uppercase">
        Tu cita
      </p>
      <h2 className="mt-2 text-2xl font-black break-words">
        {catalog.organization.name}
      </h2>
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
      <div className="mt-6 flex items-end justify-between border-t border-[#E4E1DA] pt-5">
        <span className="text-sm text-[#555A63]">Total</span>
        <strong className="text-2xl">
          {money(totalCents, catalog.location.currencyCode)}
        </strong>
      </div>
    </aside>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-4">
      <dt className="w-20 shrink-0 text-[#555A63]">{label}</dt>
      <dd className="min-w-0 flex-1 text-right font-bold break-words">
        {value}
      </dd>
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
        className="h-full rounded-full bg-[#C79532] transition-all"
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
      className="mt-8 w-full rounded-2xl bg-[#E1B85B] px-5 py-4 font-black text-[#1C1C1C] shadow-[0_12px_24px_rgba(180,125,23,.12)] transition hover:bg-[#EBD8AA] disabled:cursor-not-allowed disabled:opacity-30"
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

type LandingSection = 'reviews' | 'services' | 'team';

function PublicBookingLanding({
  catalog,
  onBook,
}: {
  catalog: PublicBookingCatalog;
  onBook: () => void;
}) {
  const [activeSection, setActiveSection] =
    useState<LandingSection>('services');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [heroScrollProgress, setHeroScrollProgress] = useState(0);

  useEffect(() => {
    let animationFrame = 0;
    const updateHeroProgress = () => {
      const progress = Math.min(1, Math.max(0, window.scrollY / 300));
      setHeroScrollProgress(progress);
    };
    updateHeroProgress();
    const onScroll = () => {
      animationFrame = window.requestAnimationFrame(updateHeroProgress);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          catalog.services
            .map((service) => service.category)
            .filter((category): category is string => Boolean(category)),
        ),
      ),
    [catalog.services],
  );
  const services = catalog.services.filter((service) => {
    const matchesSearch = `${service.name} ${service.description ?? ''}`
      .toLocaleLowerCase('es')
      .includes(search.trim().toLocaleLowerCase('es'));
    return (
      matchesSearch &&
      (activeCategory === 'all' || service.category === activeCategory)
    );
  });
  const average = catalog.reviews.length
    ? catalog.reviews.reduce((sum, review) => sum + review.rating, 0) /
      catalog.reviews.length
    : null;
  const navigate = (section: LandingSection) => {
    setActiveSection(section);
    document.getElementById(section)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <>
      <BusinessHero
        catalog={catalog}
        onBook={onBook}
        scrollProgress={heroScrollProgress}
      />
      <div className="relative z-20 -mt-12 sm:-mt-16">
        <div className="sticky top-0 z-30 border-b border-[#E4E1DA] bg-[#FAF9F6]/95 shadow-[0_8px_24px_rgba(28,28,28,.05)] backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-5 lg:px-8">
            <h1 className="max-w-xl text-3xl leading-none font-black tracking-[-0.045em] sm:text-4xl">{catalog.organization.name}</h1>
          </div>
          <SectionNavigation active={activeSection} onSelect={navigate} />
        </div>
        <main className="mx-auto max-w-6xl px-4 pb-12 sm:px-5 lg:px-8">
        <section className="py-7">
          <SectionHeading>Sobre nosotros</SectionHeading>
          <p className="max-w-2xl text-sm leading-6 text-black/60 sm:text-base">
            {catalog.organization.name} es un espacio para cuidar tu estilo
            {catalog.location.city ? ` en ${catalog.location.city}` : ''}. Elige
            el servicio y el profesional que mejor se adapten a tu próxima cita.
          </p>
        </section>

        <section className="scroll-mt-20 py-7" id="services">
          <SectionHeading
            action="Ver todos"
            onAction={() => navigate('services')}
          >
            Lo más pedido aquí
          </SectionHeading>
          {catalog.services[0] ? (
            <FeaturedService
              currency={catalog.location.currencyCode}
              onBook={onBook}
              service={catalog.services[0]}
            />
          ) : null}

          <div className="mt-7">
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-black/15 bg-white px-3">
              <span aria-hidden="true" className="text-black/45">
                ⌕
              </span>
              <span className="sr-only">Buscar servicios</span>
              <input
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-black/40"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar servicios..."
                type="search"
                value={search}
              />
            </label>
            <div
              aria-label="Filtrar servicios por categoría"
              className="mt-3 flex [scrollbar-width:none] gap-2 overflow-x-auto pb-1"
            >
              {[
                { id: 'all', label: 'Todos los servicios' },
                ...categories.map((category) => ({
                  id: category,
                  label: category,
                })),
              ].map((category) => (
                <button
                  aria-pressed={activeCategory === category.id}
                  className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${
                    activeCategory === category.id
                      ? 'bg-[#EBD8AA] text-[#1C1C1C]'
                      : 'bg-white text-black/60 hover:text-black'
                  }`}
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  type="button"
                >
                  {category.label}
                  {category.id === 'all' ? ` (${services.length})` : ''}
                </button>
              ))}
            </div>
          </div>

          {services.length ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {services.map((service, index) => (
                <ServiceCard
                  currency={catalog.location.currencyCode}
                  key={service.id}
                  onBook={onBook}
                  popular={index < 3}
                  service={service}
                />
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-xl bg-white p-4 text-sm text-black/55">
              No encontramos servicios con esos filtros.
            </p>
          )}
        </section>

        <section
          className="scroll-mt-20 border-t border-black/8 py-7"
          id="team"
        >
          <SectionHeading>Colaboradores</SectionHeading>
          <div className="-mr-4 flex snap-x [scrollbar-width:none] gap-3 overflow-x-auto pr-4 pb-2 sm:-mr-5 sm:pr-5 lg:-mr-8 lg:pr-8">
            {catalog.professionals.map((professional) => (
              <article
                className="min-w-36 snap-start rounded-xl border border-black/10 bg-white p-4 text-center"
                key={professional.id}
              >
                {professional.photoData ? (
                  <Image
                    alt={`Foto de ${professional.name}`}
                    className="mx-auto rounded-full object-cover"
                    height={56}
                    src={professional.photoData}
                    unoptimized
                    width={56}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#ecebe6] text-lg font-black"
                  >
                    {professional.name.slice(0, 1)}
                  </span>
                )}
                <h3 className="mt-3 truncate text-sm font-black">
                  {professional.name}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-4 text-black/50">
                  {professional.bio || 'Profesional del equipo'}
                </p>
              </article>
            ))}
            {!catalog.professionals.length ? (
              <p className="rounded-xl bg-white p-4 text-sm text-black/55">
                Próximamente conocerás al equipo.
              </p>
            ) : null}
          </div>
        </section>

        <section
          className="scroll-mt-20 border-t border-black/8 py-7"
          id="reviews"
        >
          <SectionHeading>Reseñas</SectionHeading>
          <RatingsSummary average={average} reviews={catalog.reviews} />
          <FeaturedReview reviews={catalog.reviews} />
        </section>

        <BusinessInformation catalog={catalog} onNavigate={navigate} />
      </main>
    </div>
      <footer className="border-t border-black/10 px-4 py-6 text-center text-xs text-black/45 sm:px-5">
        Desarrollado con Nava
        <br />© {new Date().getFullYear()} Nava. Todos los derechos reservados.
      </footer>
    </>
  );
}

function BusinessHero({
  catalog,
  onBook,
  scrollProgress,
}: {
  catalog: PublicBookingCatalog;
  onBook: () => void;
  scrollProgress: number;
}) {
  const address = [catalog.location.addressLine, catalog.location.city]
    .filter(Boolean)
    .join(', ');
  const coverImage = catalog.organization.coverImageUri;
  return (
    <section
      className="relative isolate mx-auto h-[min(132vw,34rem)] min-h-96 max-w-6xl overflow-hidden bg-[#1C1C1C] shadow-[0_20px_56px_rgba(180,125,23,.16)] transition-opacity duration-150 sm:h-[31rem] sm:rounded-b-[2rem]"
      style={{
        opacity: 1 - scrollProgress * 0.78,
        transform: `translateY(${scrollProgress * -16}px)`,
      }}
    >
      <Image
        alt="Interior de una barbería"
        className="object-cover"
        fill
        placeholder={coverImage ? 'empty' : 'blur'}
        priority
        sizes="(max-width: 768px) 100vw, 72rem"
        src={coverImage ?? bookingHero}
        unoptimized={Boolean(coverImage)}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#1C1C1C]/90 via-[#1C1C1C]/38 to-[#1C1C1C]/16" />
      <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-8">
        <p className="text-xs font-black tracking-[0.18em] text-white/75 uppercase">
          {catalog.location.name}
        </p>
        <h2 className="sr-only">
          {catalog.organization.name}
        </h2>
        <span className="mt-4 inline-flex rounded-full border border-[#EBD8AA]/70 bg-[#1C1C1C]/25 px-3 py-1 text-xs font-bold">
          Barbería
        </span>
        <div className="mt-4 grid max-w-xl gap-2 text-sm text-white/85 sm:grid-cols-2">
          <MetaItem icon="pin" value={address || 'Ubicación por confirmar'} />
          <MetaItem icon="clock" value="Reservas online disponibles" />
        </div>
        <button
          className="mt-5 min-h-11 rounded-full bg-[#E1B85B] px-5 text-sm font-black text-[#1C1C1C] shadow-[0_10px_22px_rgba(180,125,23,.28)] transition hover:bg-[#EBD8AA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={onBook}
          type="button"
        >
          Reservar ahora
        </button>
      </div>
    </section>
  );
}

function MetaItem({ icon, value }: { icon: 'clock' | 'pin'; value: string }) {
  return (
    <p className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/35 text-[11px]"
      >
        {icon === 'pin' ? '•' : '◷'}
      </span>
      <span className="truncate">{value}</span>
    </p>
  );
}

function SectionNavigation({
  active,
  onSelect,
}: {
  active: LandingSection;
  onSelect: (section: LandingSection) => void;
}) {
  const sections: ReadonlyArray<{ id: LandingSection; label: string }> = [
    { id: 'services', label: 'Servicios' },
    { id: 'team', label: 'Equipo' },
    { id: 'reviews', label: 'Reseñas' },
  ];
  return (
    <nav
      aria-label="Navegación de la barbería"
      className="bg-transparent"
    >
      <div className="mx-auto flex max-w-6xl px-4 sm:px-5 lg:px-8">
        {sections.map((section) => (
          <button
            aria-current={active === section.id ? 'page' : undefined}
            className={`relative min-h-12 flex-1 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black ${
              active === section.id
                ? 'text-black'
                : 'text-black/45 hover:text-black'
            }`}
            key={section.id}
            onClick={() => onSelect(section.id)}
            type="button"
          >
            {section.label}
            {active === section.id ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-5 bottom-0 h-0.5 bg-black"
              />
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
}

function SectionHeading({
  action,
  children,
  onAction,
}: {
  action?: string;
  children: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-xl font-black tracking-[-0.03em] sm:text-2xl">
        {children}
      </h2>
      {action && onAction ? (
        <button
          className="shrink-0 text-xs font-black text-black/60 hover:text-black focus-visible:outline-2 focus-visible:outline-black"
          onClick={onAction}
          type="button"
        >
          {action} →
        </button>
      ) : null}
    </div>
  );
}

function FeaturedService({
  currency,
  onBook,
  service,
}: {
  currency: string;
  onBook: () => void;
  service: PublicBookingCatalog['services'][number];
}) {
  return (
    <article className="grid gap-4 rounded-2xl border border-black/10 bg-white p-3 shadow-[0_12px_36px_rgba(0,0,0,.06)] sm:grid-cols-[9rem_1fr] sm:p-4">
      <div className="relative min-h-36 overflow-hidden rounded-xl bg-black sm:min-h-full">
        <Image
          alt="Ambiente de barbería"
          className="object-cover"
          fill
          sizes="144px"
          src={bookingHero}
        />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-black tracking-[0.12em] text-black/45 uppercase">
          Reserva online
        </p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black">{service.name}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-black/55">
              {service.description ||
                'Un servicio preparado para tu próxima cita.'}
            </p>
          </div>
          <strong className="shrink-0 text-base">
            {money(service.priceCents, currency)}
          </strong>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-black/50">
            ◷ {service.durationMinutes} min
          </span>
          <button
            className="min-h-10 rounded-lg bg-black px-4 text-sm font-black text-white transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            onClick={onBook}
            type="button"
          >
            Reservar
          </button>
        </div>
        <p className="mt-3 border-t border-black/8 pt-3 text-xs text-black/45">
          Disponible para reservar online
        </p>
      </div>
    </article>
  );
}

function ServiceCard({
  currency,
  onBook,
  popular,
  service,
}: {
  currency: string;
  onBook: () => void;
  popular: boolean;
  service: PublicBookingCatalog['services'][number];
}) {
  return (
    <article className="grid min-h-32 grid-cols-[4.75rem_minmax(0,1fr)] gap-3 rounded-xl border border-black/10 bg-white p-3">
      <div className="relative h-[6.5rem] w-[4.75rem] overflow-hidden rounded-lg bg-[#ecebe6]">
        <Image
          alt={`Servicio ${service.name}`}
          className="object-cover"
          fill
          sizes="76px"
          src={bookingHero}
        />
      </div>
      <div className="flex min-w-0 flex-col">
        {popular ? (
          <span className="w-fit rounded-full bg-[#f4f3ef] px-2 py-0.5 text-[10px] font-bold text-black/55">
            Popular
          </span>
        ) : null}
        <div className="mt-1 flex min-w-0 items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm leading-5 font-black">
            {service.name}
          </h3>
          <strong className="shrink-0 text-sm">
            {money(service.priceCents, currency)}
          </strong>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-4 text-black/50">
          {service.description || 'Servicio disponible para reserva online.'}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="text-[11px] font-bold text-black/45">
            ◷ {service.durationMinutes} min
          </span>
          <button
            className="min-h-8 rounded-md bg-black px-3 text-xs font-black text-white transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            onClick={onBook}
            type="button"
          >
            Reservar
          </button>
        </div>
      </div>
    </article>
  );
}

function RatingsSummary({
  average,
  reviews,
}: {
  average: number | null;
  reviews: PublicBookingCatalog['reviews'];
}) {
  const distribution = [5, 4, 3, 2, 1].map((rating) => ({
    count: reviews.filter((review) => review.rating === rating).length,
    rating,
  }));
  return (
    <div className="grid gap-5 rounded-2xl bg-white p-4 sm:grid-cols-[9rem_1fr] sm:items-center">
      <div>
        <p className="text-4xl font-black">
          {average ? average.toFixed(1) : '—'}
        </p>
        <p className="mt-1 text-sm tracking-[0.12em] text-black/70">★★★★★</p>
        <p className="mt-2 text-xs text-black/45">
          {reviews.length} reseñas verificadas
        </p>
      </div>
      <div className="space-y-2">
        {distribution.map((item) => (
          <div
            className="grid grid-cols-[1.25rem_1fr_1.25rem] items-center gap-2 text-xs"
            key={item.rating}
          >
            <span>{item.rating}★</span>
            <span
              aria-hidden="true"
              className="h-1.5 overflow-hidden rounded-full bg-black/8"
            >
              <span
                className="block h-full rounded-full bg-black"
                style={{
                  width: `${reviews.length ? (item.count / reviews.length) * 100 : 0}%`,
                }}
              />
            </span>
            <span className="text-right text-black/45">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturedReview({
  reviews,
}: {
  reviews: PublicBookingCatalog['reviews'];
}) {
  const review = reviews.find((item) => item.comment) ?? reviews[0];
  if (!review) {
    return (
      <p className="mt-4 rounded-xl border border-black/10 p-4 text-sm text-black/55">
        Las reseñas verificadas aparecerán después de citas completadas.
      </p>
    );
  }
  return (
    <blockquote className="mt-4 rounded-2xl border border-black/10 bg-white p-5">
      <p aria-hidden="true" className="text-2xl leading-none text-black/35">
        “
      </p>
      <p className="mt-2 text-base leading-7 font-bold">
        {review.comment || 'Gracias por confiar en nuestro equipo.'}
      </p>
      <footer className="mt-4 text-sm text-black/55">
        <strong className="text-black">{review.clientName}</strong> · cita con{' '}
        {review.professionalName}
      </footer>
    </blockquote>
  );
}

function BusinessInformation({
  catalog,
  onNavigate,
}: {
  catalog: PublicBookingCatalog;
  onNavigate: (section: LandingSection) => void;
}) {
  const address = [catalog.location.addressLine, catalog.location.city]
    .filter(Boolean)
    .join(', ');
  return (
    <section className="border-t border-black/8 py-7">
      <h2 className="text-xl font-black tracking-[-0.03em]">
        {catalog.organization.name}
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-black/60">
        Reserva tu próximo servicio de forma simple y recibe la confirmación por
        correo.
      </p>
      <div className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <h3 className="font-black">Navegación</h3>
          <div className="mt-3 flex flex-col items-start gap-2">
            <button
              className="text-black/60 hover:text-black"
              onClick={() => onNavigate('services')}
              type="button"
            >
              Servicios
            </button>
            <button
              className="text-black/60 hover:text-black"
              onClick={() => onNavigate('team')}
              type="button"
            >
              Colaboradores
            </button>
            <button
              className="text-black/60 hover:text-black"
              onClick={() => onNavigate('reviews')}
              type="button"
            >
              Reseñas
            </button>
          </div>
        </div>
        <div>
          <h3 className="font-black">Más información</h3>
          <p className="mt-3 flex gap-2 text-black/60">
            <span aria-hidden="true">•</span>
            {address || 'Ubicación por confirmar'}
          </p>
          <p className="mt-2 flex gap-2 text-black/60">
            <span aria-hidden="true">◷</span>Reservas online disponibles
          </p>
          {catalog.location.phone ? (
            <p className="mt-2 text-black/60">{catalog.location.phone}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
