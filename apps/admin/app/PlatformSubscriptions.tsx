'use client';

import { useEffect, useState } from 'react';

import {
  getPlatformSubscriptions,
  type PlatformSubscriptionList,
} from './platform-api';

const dateFormatter = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatSubscriptionDate(value: string | null, timezone: string) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return dateFormatter.format(new Date(value));
  }
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('es-EC', {
    currency,
    style: 'currency',
  }).format(cents / 100);
}

function label(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/^./u, (letter) => letter.toUpperCase());
}

export function PlatformSubscriptions({
  onToast,
  token,
}: {
  readonly onToast: (message: string) => void;
  readonly token: string;
}) {
  const [data, setData] = useState<PlatformSubscriptionList | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [invoiceStatus, setInvoiceStatus] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState('all');

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void getPlatformSubscriptions(token, {
        invoiceStatus,
        page,
        paymentStatus,
        search,
        status,
      })
        .then((result) => {
          if (active) setData(result);
        })
        .catch((error: unknown) => {
          if (active)
            onToast(
              error instanceof Error
                ? error.message
                : 'No fue posible cargar las suscripciones.',
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [invoiceStatus, onToast, page, paymentStatus, search, status, token]);

  function resetPage(action: (value: string) => void, value: string) {
    setPage(1);
    action(value);
  }

  return (
    <>
      <div className="section-header">
        <div>
          <h1>Suscripciones</h1>
          <p>
            Estado comercial y última evidencia de cobro, sin inferir pagos a
            partir del plan asignado.
          </p>
        </div>
        <div className="live-pill">
          <span /> Datos transaccionales
        </div>
      </div>
      <section className="content-card subscription-filters-card">
        <div className="filters-grid subscription-filters">
          <label className="form-span">
            Buscar organización
            <input
              onChange={(event) => resetPage(setSearch, event.target.value)}
              placeholder="Nombre o slug de la organización"
              value={search}
            />
          </label>
          <label>
            Suscripción
            <select
              onChange={(event) => resetPage(setStatus, event.target.value)}
              value={status}
            >
              <option value="all">Todos los estados</option>
              <option value="trial">En prueba</option>
              <option value="free">Free</option>
              <option value="active">Activa</option>
              <option value="past_due">Pago pendiente</option>
              <option value="suspended">Suspendida</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </label>
          <label>
            Última factura
            <select
              onChange={(event) =>
                resetPage(setInvoiceStatus, event.target.value)
              }
              value={invoiceStatus}
            >
              <option value="all">Cualquier estado</option>
              <option value="open">Abierta</option>
              <option value="pending">Pendiente</option>
              <option value="paid">Pagada</option>
              <option value="expired">Vencida</option>
              <option value="void">Anulada</option>
              <option value="refunded">Reembolsada</option>
            </select>
          </label>
          <label>
            Último intento de pago
            <select
              onChange={(event) =>
                resetPage(setPaymentStatus, event.target.value)
              }
              value={paymentStatus}
            >
              <option value="all">Cualquier resultado</option>
              <option value="created">Creado</option>
              <option value="link_created">Enlace creado</option>
              <option value="pending_provider">Pendiente proveedor</option>
              <option value="approved">Aprobado</option>
              <option value="applied">Aplicado</option>
              <option value="failed">Fallido</option>
              <option value="expired">Vencido</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </label>
        </div>
      </section>
      <section className="subscription-list" aria-busy={loading}>
        {loading && !data ? (
          <div className="panel-loader">Cargando suscripciones…</div>
        ) : data?.subscriptions.length ? (
          data.subscriptions.map((subscription) => (
            <article className="subscription-card" key={subscription.id}>
              <header className="subscription-card-header">
                <div>
                  <span className="card-kicker">{subscription.plan.name}</span>
                  <h2>{subscription.organization.name}</h2>
                  <p>/{subscription.organization.slug}</p>
                </div>
                <div className="subscription-card-statuses">
                  <span
                    className={`status-badge status-badge--${subscription.status}`}
                  >
                    <span /> {label(subscription.status)}
                  </span>
                  {subscription.latestInvoice ? (
                    <span
                      className={`status-badge status-badge--${subscription.latestInvoice.status}`}
                    >
                      <span /> Factura{' '}
                      {label(subscription.latestInvoice.status)}
                    </span>
                  ) : (
                    <span className="status-badge">Sin factura emitida</span>
                  )}
                </div>
              </header>
              <div className="subscription-card-grid">
                <section>
                  <span className="subscription-card-label">
                    {subscription.status === 'active'
                      ? 'Suscripción activa'
                      : 'Periodo vigente'}
                  </span>
                  <strong>
                    Suscrito desde:{' '}
                    {formatSubscriptionDate(
                      subscription.subscriptionStartedAt ??
                        subscription.currentPeriodStart,
                      subscription.organization.defaultTimezone,
                    )}
                  </strong>
                  <small>
                    {subscription.status === 'trial'
                      ? `Finaliza prueba: ${formatSubscriptionDate(subscription.trialEndsAt, subscription.organization.defaultTimezone)}`
                      : `Vence: ${formatSubscriptionDate(subscription.currentPeriodEnd, subscription.organization.defaultTimezone)}`}
                  </small>
                  <small>
                    Zona horaria: {subscription.organization.defaultTimezone}
                  </small>
                </section>
                <section>
                  <span className="subscription-card-label">
                    Última factura
                  </span>
                  {subscription.latestInvoice ? (
                    <>
                      <strong>
                        {formatMoney(
                          subscription.latestInvoice.totalCents,
                          subscription.latestInvoice.currencyCode,
                        )}
                      </strong>
                      <small>
                        Vence {formatSubscriptionDate(subscription.latestInvoice.dueAt, subscription.latestInvoice.billingTimezone)} ·{' '}
                        pagada {formatSubscriptionDate(subscription.latestInvoice.paidAt, subscription.latestInvoice.billingTimezone)}
                      </small>
                      <small>
                        Pago proveedor: {subscription.latestInvoice.providerPaidAt ? formatSubscriptionDate(subscription.latestInvoice.providerPaidAt, subscription.latestInvoice.billingTimezone) : 'No informado por PayPhone'} · {subscription.latestInvoice.billingTimezone}
                      </small>
                    </>
                  ) : (
                    <strong className="subscription-empty-value">
                      Sin cobro registrado
                    </strong>
                  )}
                </section>
                <section>
                  <span className="subscription-card-label">
                    Último intento
                  </span>
                  {subscription.latestPayment ? (
                    <>
                      <strong>
                        {label(subscription.latestPayment.status)} ·{' '}
                        {formatMoney(
                          subscription.latestPayment.amountCents,
                          subscription.latestPayment.currencyCode,
                        )}
                      </strong>
                      <small>
                        {label(subscription.latestPayment.provider)} · creado{' '}
                        {formatSubscriptionDate(subscription.latestPayment.createdAt, subscription.latestPayment.billingTimezone)}
                      </small>
                      <small>
                        Verificado: {formatSubscriptionDate(subscription.latestPayment.appliedAt, subscription.latestPayment.billingTimezone)}
                      </small>
                    </>
                  ) : (
                    <strong className="subscription-empty-value">
                      Sin intento registrado
                    </strong>
                  )}
                </section>
              </div>
              {subscription.history.length ? (
                <footer className="subscription-history">
                  <span>Movimientos recientes</span>
                  {subscription.history.map((entry) => (
                    <small key={entry.id}>
                      {label(entry.kind)} · {label(entry.status)} ·{' '}
                      {formatSubscriptionDate(entry.createdAt, entry.billingTimezone)}
                    </small>
                  ))}
                </footer>
              ) : null}
            </article>
          ))
        ) : (
          <div className="empty-state">
            No hay suscripciones que coincidan con los filtros seleccionados.
          </div>
        )}
      </section>
      {data ? (
        <div className="pagination">
          <button
            className="button button--ghost"
            disabled={data.pagination.page <= 1 || loading}
            onClick={() => setPage((current) => current - 1)}
            type="button"
          >
            Anterior
          </button>
          <span>
            Página {data.pagination.page} de {data.pagination.totalPages} ·{' '}
            {data.pagination.total} suscripciones
          </span>
          <button
            className="button button--ghost"
            disabled={
              data.pagination.page >= data.pagination.totalPages || loading
            }
            onClick={() => setPage((current) => current + 1)}
            type="button"
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </>
  );
}
