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
    <main className="min-h-screen bg-[#FAF9F6] px-4 py-6 text-[#1C1C1C] [color-scheme:light] sm:px-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-5 flex items-center justify-between rounded-[24px] border border-[#E4E1DA] bg-white px-5 py-4 shadow-[0_10px_28px_rgba(28,28,28,.045)]">
          <div>
            <p className="text-[10px] font-black tracking-[0.2em] text-[#956816] uppercase">
              Nava
            </p>
            <p className="mt-1 text-sm font-semibold text-[#555A63]">
              Enlace privado de gestión
            </p>
          </div>
          <span className="rounded-full bg-[#C79532] px-4 py-2 text-[11px] font-black tracking-wide text-white shadow-[0_5px_12px_rgba(180,125,23,.2)]">
            {appointment.status.replace(/_/gu, ' ')}
          </span>
        </header>

        <section className="rounded-[30px] border border-[#E4E1DA] bg-white p-5 shadow-[0_18px_52px_rgba(28,28,28,.07)] sm:p-8">
          {mode === 'details' ? (
            <>
              <div className="rounded-[24px] border border-[#E4E1DA] bg-[#FAF9F6] px-5 py-7 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#C79532] text-2xl text-white shadow-[0_8px_18px_rgba(180,125,23,.2)]">
                  ✓
                </span>
                <p className="mt-5 text-[10px] font-black tracking-[0.18em] text-[#956816] uppercase">
                  Reserva confirmada
                </p>
                <h1 className="mt-1 text-3xl font-black tracking-[-0.04em]">
                  Tu cita
                </h1>
                <p className="mt-2 text-sm font-semibold text-[#555A63]">
                  {appointment.organization.name}
                </p>
              </div>
              <dl className="mt-5 divide-y divide-[#E4E1DA] rounded-[22px] border border-[#E4E1DA] bg-[#FAF9F6] px-5">
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
                  className="mt-5 w-full rounded-[17px] bg-[#C79532] px-5 py-4 font-black text-white shadow-[0_10px_20px_rgba(180,125,23,.18)] transition hover:bg-[#956816] disabled:opacity-40"
                  disabled={loading}
                  onClick={() => void action('confirm-attendance')}
                  type="button"
                >
                  Confirmar asistencia
                </button>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  className="rounded-[17px] border border-[#C79532] bg-[#FFFDF8] px-5 py-4 font-black text-[#956816] transition hover:bg-[#F7EBD1] disabled:opacity-40"
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
                  className="rounded-[17px] border border-[#BD2D2D] bg-[#FFF0EE] px-5 py-4 font-black text-[#A72D27] transition hover:bg-[#FDE1DD] disabled:opacity-40"
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
                  <div className="mt-5 rounded-[22px] border border-[#E4E1DA] bg-[#FAF9F6] p-5 text-center">
                    <p className="text-xl tracking-widest text-[#C79532]">
                      {'★'.repeat(appointment.review.rating)}
                    </p>
                    <p className="mt-2 text-sm text-[#555A63]">
                      Gracias por compartir tu experiencia.
                    </p>
                  </div>
                ) : (
                  <button
                    className="mt-5 w-full rounded-[17px] border border-[#E4E1DA] bg-[#FAF9F6] px-5 py-4 font-black text-[#1C1C1C] transition hover:border-[#C79532]"
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
                className="mb-5 rounded-full bg-[#F7EBD1] px-4 py-2 text-sm font-black text-[#956816]"
                onClick={() => setMode('details')}
                type="button"
              >
                ← Regresar
              </button>
              <p className="text-[10px] font-black tracking-[0.18em] text-[#956816] uppercase">
                Agenda
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-[-0.04em]">Nuevo horario</h1>
              <p className="mt-2 text-[#555A63]">
                Tu horario actual se mantiene hasta confirmar el cambio.
              </p>
              <div className="mt-6 flex gap-2 overflow-x-auto pb-3">
                {dates.map((item) => (
                  <button
                    className={`min-w-16 rounded-2xl border p-3 ${
                      dateKey(item) === dateKey(date)
                        ? 'border-[#C79532] bg-[#C79532] text-white shadow-[0_6px_15px_rgba(180,125,23,.18)]'
                        : 'border-[#E4E1DA] bg-[#FAF9F6] text-[#555A63] hover:border-[#C79532]'
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
                        ? 'border-[#C79532] bg-[#C79532] text-white shadow-[0_6px_15px_rgba(180,125,23,.18)]'
                        : 'border-[#E4E1DA] bg-white text-[#1C1C1C] hover:border-[#C79532]'
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
                className="mt-6 w-full rounded-[17px] bg-[#C79532] px-5 py-4 font-black text-white shadow-[0_10px_20px_rgba(180,125,23,.18)] transition hover:bg-[#956816] disabled:opacity-40"
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
                className="mb-5 rounded-full bg-[#F7EBD1] px-4 py-2 text-sm font-black text-[#956816]"
                onClick={() => setMode('details')}
                type="button"
              >
                ← Regresar
              </button>
              <h1 className="text-3xl font-black tracking-[-0.04em]">Tu experiencia</h1>
              <p className="mt-2 text-[#555A63]">
                La reseña se publicará automáticamente y el negocio podrá
                ocultarla, pero no editarla.
              </p>
              <div className="mt-6 flex gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    className={`text-3xl ${
                      value <= rating ? 'text-[#C79532]' : 'text-[#E4E1DA]'
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
                className="mt-5 min-h-32 w-full rounded-[17px] border border-[#E4E1DA] bg-[#FAF9F6] p-4 outline-none transition focus:border-[#C79532]"
                maxLength={1000}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Comentario opcional"
                value={comment}
              />
              {error ? <ErrorMessage message={error} /> : null}
              <button
                className="mt-5 w-full rounded-[17px] bg-[#C79532] px-5 py-4 font-black text-white shadow-[0_10px_20px_rgba(180,125,23,.18)] transition hover:bg-[#956816]"
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
      <dt className="w-24 text-sm font-semibold text-[#555A63]">{label}</dt>
      <dd className="flex-1 text-right text-sm font-black text-[#1C1C1C]">{value}</dd>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="mt-5 rounded-[17px] border border-[#BD2D2D] bg-[#FFF0EE] p-4 text-sm font-bold text-[#A72D27]">
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
    <main className="grid min-h-screen place-items-center bg-[#FAF9F6] px-5 text-[#1C1C1C] [color-scheme:light]">
      <div className="max-w-md rounded-[30px] border border-[#E4E1DA] bg-white p-8 text-center shadow-[0_18px_52px_rgba(28,28,28,.07)]">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#F7EBD1] text-xl font-black text-[#956816]">N</span>
        <h1 className="mt-4 text-3xl font-black tracking-[-0.04em]">{title}</h1>
        <p className="mt-3 text-[#555A63]">{copy}</p>
      </div>
    </main>
  );
}
