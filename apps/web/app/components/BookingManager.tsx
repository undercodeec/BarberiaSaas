'use client';

import { useEffect, useMemo, useState } from 'react';

interface ManagedAppointment {
  attendanceConfirmedAt: string | null;
  canCancel: boolean;
  canReschedule: boolean;
  clientEmail: string;
  clientName: string;
  endsAt: string;
  id: string;
  location: {
    addressLine: string | null;
    city: string | null;
    currencyCode: string;
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
  locationId: string;
  organization: { name: string; slug: string };
  professionalMembershipId: string;
  professionalName: string;
  review: { comment: string | null; id: string; rating: number } | null;
  services: ReadonlyArray<{
    durationMinutes: number;
    id: string;
    priceCents: number;
    serviceId: string;
    serviceName: string;
  }>;
  startsAt: string;
  status: string;
  totalCents: number;
}

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

async function responseError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  return body?.message ?? 'No pudimos completar la acción.';
}

export function BookingManager({
  apiBaseUrl,
  token,
}: {
  apiBaseUrl: string;
  token: string;
}) {
  const apiUrl = apiBaseUrl.replace(/\/$/u, '');
  const [appointment, setAppointment] = useState<ManagedAppointment | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'details' | 'reschedule' | 'review'>(
    'details',
  );
  const [cancelReason, setCancelReason] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const dates = useMemo(() => {
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    return Array.from({ length: 21 }, (_, index) => {
      const value = new Date(start);
      value.setDate(start.getDate() + index);
      return value;
    });
  }, []);
  const [date, setDate] = useState(dates[0]!);
  const [slots, setSlots] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/v1/public/booking/${encodeURIComponent(token)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error(await responseError(response));
      const result = (await response.json()) as {
        appointment: ManagedAppointment;
      };
      setAppointment(result.appointment);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'No pudimos cargar la cita.',
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${apiUrl}/v1/public/booking/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        return response.json() as Promise<{
          appointment: ManagedAppointment;
        }>;
      })
      .then((result) => {
        setAppointment(result.appointment);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : 'No pudimos cargar la cita.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [apiUrl, token]);

  const action = async (path: string, body: Record<string, unknown> = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/v1/public/booking/${encodeURIComponent(token)}/${path}`,
        {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      const result = (await response.json()) as {
        appointment?: ManagedAppointment;
      };
      if (result.appointment) setAppointment(result.appointment);
      setMode('details');
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No pudimos completar la acción.',
      );
      return false;
    } finally {
      setLoading(false);
    }
  };
  const loadSlots = async (nextDate: Date) => {
    if (!appointment) return;
    setLoading(true);
    setError(null);
    setDate(nextDate);
    setStartsAt(null);
    try {
      const query = new URLSearchParams({
        date: dateKey(nextDate),
        membershipId: appointment.professionalMembershipId,
        serviceIds: appointment.services
          .map((service) => service.serviceId)
          .join(','),
      });
      const response = await fetch(
        `${apiUrl}/v1/public/${appointment.organization.slug}/${appointment.location.slug}/availability?${query.toString()}`,
      );
      if (!response.ok) throw new Error(await responseError(response));
      const result = (await response.json()) as {
        slots: ReadonlyArray<{ startsAt: string }>;
      };
      setSlots(result.slots.map((slot) => slot.startsAt));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No pudimos consultar disponibilidad.',
      );
    } finally {
      setLoading(false);
    }
  };
  const submitReview = async () => {
    const success = await action('review', { comment, rating });
    if (success) await refresh();
  };

  if (loading && !appointment) {
    return <StatusPage copy="Cargando tu cita..." />;
  }
  if (!appointment) {
    return (
      <StatusPage
        copy={error || 'El enlace no es válido o ya venció.'}
        title="No pudimos abrir la cita"
      />
    );
  }

  const currency = appointment.location.currencyCode || 'USD';
  const formatter = new Intl.NumberFormat('es-EC', {
    currency,
    style: 'currency',
  });
  const dateLabel = new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: appointment.location.timezone,
  }).format(new Date(appointment.startsAt));

  return (
    <main className="min-h-screen bg-[#f4f3ef] px-5 py-8 text-[#161616] [color-scheme:light]">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.2em] uppercase">
              Nava
            </p>
            <p className="mt-1 text-sm text-black/45">
              Enlace privado de gestión
            </p>
          </div>
          <span className="rounded-full bg-black px-4 py-2 text-xs font-black text-white">
            {appointment.status.replace(/_/gu, ' ')}
          </span>
        </header>

        <section className="rounded-[2rem] bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,.08)] sm:p-9">
          {mode === 'details' ? (
            <>
              <div className="text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-black text-2xl text-white">
                  ✓
                </span>
                <h1 className="mt-5 text-4xl font-black tracking-[-0.05em]">
                  Tu cita
                </h1>
                <p className="mt-2 text-black/50">
                  {appointment.organization.name}
                </p>
              </div>
              <dl className="mt-8 divide-y divide-black/8 rounded-2xl bg-[#f4f3ef] px-5">
                <Detail label="Cliente" value={appointment.clientName} />
                <Detail label="Fecha" value={dateLabel} />
                <Detail
                  label="Profesional"
                  value={appointment.professionalName}
                />
                <Detail
                  label="Servicios"
                  value={appointment.services
                    .map((service) => service.serviceName)
                    .join(', ')}
                />
                <Detail
                  label="Total"
                  value={formatter.format(appointment.totalCents / 100)}
                />
                <Detail
                  label="Lugar"
                  value={[
                    appointment.location.name,
                    appointment.location.addressLine,
                    appointment.location.city,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              </dl>

              {appointment.status === 'awaiting_confirmation' ? (
                <button
                  className="mt-6 w-full rounded-2xl bg-black px-5 py-4 font-black text-white disabled:opacity-30"
                  disabled={loading}
                  onClick={() => void action('confirm-attendance')}
                  type="button"
                >
                  Confirmar asistencia
                </button>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  className="rounded-2xl border border-black/15 px-5 py-4 font-black disabled:opacity-30"
                  disabled={!appointment.canReschedule}
                  onClick={() => {
                    setMode('reschedule');
                    void loadSlots(date);
                  }}
                  type="button"
                >
                  Reprogramar
                </button>
                <button
                  className="rounded-2xl border border-red-200 px-5 py-4 font-black text-red-700 disabled:opacity-30"
                  disabled={!appointment.canCancel}
                  onClick={() => {
                    const reason = window.prompt(
                      'Motivo de cancelación (opcional)',
                      cancelReason,
                    );
                    if (reason === null) return;
                    setCancelReason(reason);
                    void action('cancel', { reason });
                  }}
                  type="button"
                >
                  Cancelar cita
                </button>
              </div>

              {appointment.status === 'completed' ? (
                appointment.review ? (
                  <div className="mt-6 rounded-2xl bg-[#f4f3ef] p-5 text-center">
                    <p className="text-xl tracking-widest">
                      {'★'.repeat(appointment.review.rating)}
                    </p>
                    <p className="mt-2 text-sm text-black/55">
                      Gracias por compartir tu experiencia.
                    </p>
                  </div>
                ) : (
                  <button
                    className="mt-6 w-full rounded-2xl bg-[#f4f3ef] px-5 py-4 font-black"
                    onClick={() => setMode('review')}
                    type="button"
                  >
                    Dejar una reseña
                  </button>
                )
              ) : null}
            </>
          ) : null}

          {mode === 'reschedule' ? (
            <>
              <button
                className="mb-6 text-sm font-black text-black/45"
                onClick={() => setMode('details')}
                type="button"
              >
                ← Regresar
              </button>
              <h1 className="text-3xl font-black">Nuevo horario</h1>
              <p className="mt-2 text-black/50">
                Tu horario actual se mantiene hasta confirmar el cambio.
              </p>
              <div className="mt-6 flex gap-2 overflow-x-auto pb-3">
                {dates.map((item) => (
                  <button
                    className={`min-w-16 rounded-2xl border p-3 ${
                      dateKey(item) === dateKey(date)
                        ? 'border-black bg-black text-white'
                        : 'border-black/10'
                    }`}
                    key={dateKey(item)}
                    onClick={() => void loadSlots(item)}
                    type="button"
                  >
                    <span className="block text-xs font-bold uppercase">
                      {item.toLocaleDateString('es-EC', { weekday: 'short' })}
                    </span>
                    <span className="mt-1 block text-lg font-black">
                      {item.getDate()}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {slots.map((slot) => (
                  <button
                    className={`rounded-xl border p-3 text-sm font-black ${
                      startsAt === slot
                        ? 'border-black bg-black text-white'
                        : 'border-black/10'
                    }`}
                    key={slot}
                    onClick={() => setStartsAt(slot)}
                    type="button"
                  >
                    {new Date(slot).toLocaleTimeString('es-EC', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </button>
                ))}
              </div>
              {error ? <ErrorMessage message={error} /> : null}
              <button
                className="mt-7 w-full rounded-2xl bg-black px-5 py-4 font-black text-white disabled:opacity-30"
                disabled={!startsAt || loading}
                onClick={() => void action('reschedule', { startsAt })}
                type="button"
              >
                Confirmar nuevo horario
              </button>
            </>
          ) : null}

          {mode === 'review' ? (
            <>
              <button
                className="mb-6 text-sm font-black text-black/45"
                onClick={() => setMode('details')}
                type="button"
              >
                ← Regresar
              </button>
              <h1 className="text-3xl font-black">Tu experiencia</h1>
              <p className="mt-2 text-black/50">
                La reseña se publicará automáticamente y el negocio podrá
                ocultarla, pero no editarla.
              </p>
              <div className="mt-6 flex gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    className={`text-3xl ${
                      value <= rating ? 'opacity-100' : 'opacity-20'
                    }`}
                    key={value}
                    onClick={() => setRating(value)}
                    type="button"
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                className="mt-5 min-h-32 w-full rounded-2xl border border-black/15 p-4"
                maxLength={1000}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Comentario opcional"
                value={comment}
              />
              {error ? <ErrorMessage message={error} /> : null}
              <button
                className="mt-5 w-full rounded-2xl bg-black px-5 py-4 font-black text-white"
                onClick={() => void submitReview()}
                type="button"
              >
                Publicar reseña
              </button>
            </>
          ) : null}

          {error && mode === 'details' ? (
            <ErrorMessage message={error} />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 py-4">
      <dt className="w-24 text-sm text-black/45">{label}</dt>
      <dd className="flex-1 text-right text-sm font-black">{value}</dd>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">
      {message}
    </p>
  );
}

function StatusPage({
  copy,
  title = 'Un momento',
}: {
  copy: string;
  title?: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f3ef] px-5 text-[#161616] [color-scheme:light]">
      <div className="max-w-md rounded-[2rem] bg-white p-8 text-center">
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="mt-3 text-black/50">{copy}</p>
      </div>
    </main>
  );
}
