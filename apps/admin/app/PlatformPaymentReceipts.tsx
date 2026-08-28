'use client';

import { useEffect, useState } from 'react';

import {
  downloadPlatformPaymentReceipt,
  getPlatformPaymentReceipts,
  type PlatformPaymentReceiptList,
} from './platform-api';

const dateFormatter = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const deliveryLabels: Readonly<Record<string, string>> = {
  failed: 'Entrega fallida',
  pending: 'Pendiente de envío',
  sent: 'Enviado',
};

const paymentLabels: Readonly<Record<string, string>> = {
  applied: 'Aplicado',
  approved: 'Aprobado',
  failed: 'Fallido',
  rejected: 'Rechazado',
};

function formatDate(value: string | null, timezone?: string) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timezone ? { timeZone: timezone } : {}),
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

function label(value: string, labels?: Readonly<Record<string, string>>) {
  return (
    labels?.[value] ??
    value.replaceAll('_', ' ').replace(/^./u, (letter) => letter.toUpperCase())
  );
}

function summaryMetric(
  value: number,
  detail: string,
  tone: 'danger' | 'neutral' | 'success' | 'warning',
) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-value">{value.toLocaleString('es-EC')}</div>
      <p>{detail}</p>
    </article>
  );
}

export function PlatformPaymentReceipts({
  onToast,
  token,
}: {
  readonly onToast: (message: string) => void;
  readonly token: string;
}) {
  const [data, setData] = useState<PlatformPaymentReceiptList | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    let active = true;

    async function loadReceipts() {
      setLoading(true);
      try {
        const result = await getPlatformPaymentReceipts(token, {
          deliveryStatus,
          from,
          page,
          search,
          to,
        });
        if (active) setData(result);
      } catch (error: unknown) {
        if (active)
          onToast(
            error instanceof Error
              ? error.message
              : 'No fue posible cargar los recibos.',
          );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadReceipts();
    return () => {
      active = false;
    };
  }, [deliveryStatus, from, onToast, page, search, to, token]);

  function resetPage<T>(setter: (value: T) => void, value: T) {
    setPage(1);
    setter(value);
  }

  async function downloadReceipt(receiptId: string) {
    setDownloadingId(receiptId);
    try {
      const result = await downloadPlatformPaymentReceipt(token, receiptId);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      onToast(
        error instanceof Error
          ? error.message
          : 'No fue posible descargar el recibo.',
      );
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <>
      <div className="section-header">
        <div>
          <h1>Pagos y recibos</h1>
          <p>
            Historial comercial de pagos confirmados. La facturación SRI está
            desactivada; aquí se muestran únicamente recibos temporales.
          </p>
        </div>
        <div className="live-pill">
          <span /> Registro comercial
        </div>
      </div>
      <div className="metrics-grid">
        {summaryMetric(
          data?.summary.total ?? 0,
          'Recibos registrados',
          'neutral',
        )}
        {summaryMetric(
          data?.summary.sent ?? 0,
          'Enviados por correo',
          'success',
        )}
        {summaryMetric(
          data?.summary.pending ?? 0,
          'Pendientes de envío',
          'warning',
        )}
        {summaryMetric(
          data?.summary.failed ?? 0,
          'Entregas fallidas',
          'danger',
        )}
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
            Entrega del recibo
            <select
              onChange={(event) =>
                resetPage(setDeliveryStatus, event.target.value)
              }
              value={deliveryStatus}
            >
              <option value="all">Todos los estados</option>
              <option value="pending">Pendiente de envío</option>
              <option value="sent">Enviado</option>
              <option value="failed">Entrega fallida</option>
            </select>
          </label>
          <label>
            Desde
            <input
              onChange={(event) => resetPage(setFrom, event.target.value)}
              type="date"
              value={from}
            />
          </label>
          <label>
            Hasta
            <input
              onChange={(event) => resetPage(setTo, event.target.value)}
              type="date"
              value={to}
            />
          </label>
        </div>
      </section>
      <section className="subscription-list" aria-busy={loading}>
        {loading && !data ? (
          <div className="panel-loader">Cargando recibos…</div>
        ) : data?.receipts.length ? (
          data.receipts.map((receipt) => (
            <article className="subscription-card" key={receipt.id}>
              <header className="subscription-card-header">
                <div>
                  <span className="card-kicker">{receipt.receiptNumber}</span>
                  <h2>{receipt.organization.name}</h2>
                  <p>/{receipt.organization.slug}</p>
                </div>
                <div className="subscription-card-statuses">
                  <span
                    className={`status-badge status-badge--${receipt.delivery.status}`}
                  >
                    <span /> {label(receipt.delivery.status, deliveryLabels)}
                  </span>
                  <span className="status-badge status-badge--active">
                    <span /> {label(receipt.payment.status, paymentLabels)}
                  </span>
                </div>
              </header>
              <div className="subscription-card-grid">
                <section>
                  <span className="subscription-card-label">
                    Cobro confirmado
                  </span>
                  <strong>
                    {formatMoney(receipt.totalCents, receipt.currencyCode)}
                  </strong>
                  <small>
                    {receipt.planName} · pagado{' '}
                    {formatDate(
                      receipt.paidAt,
                      receipt.organization.defaultTimezone,
                    )}
                  </small>
                  <small>
                    Periodo:{' '}
                    {formatDate(
                      receipt.periodStartsAt,
                      receipt.organization.defaultTimezone,
                    )}{' '}
                    a{' '}
                    {formatDate(
                      receipt.periodEndsAt,
                      receipt.organization.defaultTimezone,
                    )}
                  </small>
                </section>
                <section>
                  <span className="subscription-card-label">Transacción</span>
                  <strong>{receipt.payment.provider}</strong>
                  <small>
                    ID proveedor: {receipt.payment.providerTransactionId ?? '—'}
                  </small>
                  <small>Referencia: {receipt.payment.internalReference}</small>
                  {receipt.pricing.promotionCode ? (
                    <small>
                      Descuento {receipt.pricing.promotionCode}:{' '}
                      {formatMoney(
                        receipt.pricing.promotionDiscountCents,
                        receipt.currencyCode,
                      )}
                    </small>
                  ) : null}
                </section>
                <section>
                  <span className="subscription-card-label">Destinatario</span>
                  <strong>{receipt.recipient.name}</strong>
                  <small>{receipt.recipient.email}</small>
                  <small>
                    {receipt.delivery.emailedAt
                      ? `Enviado: ${formatDate(receipt.delivery.emailedAt)}`
                      : `Intentos de envío: ${receipt.delivery.attemptCount}`}
                  </small>
                  {receipt.delivery.lastErrorCode ? (
                    <small>Error: {receipt.delivery.lastErrorCode}</small>
                  ) : null}
                </section>
              </div>
              <footer className="subscription-history receipt-footer">
                <span>
                  Recibo temporal · creado {formatDate(receipt.createdAt)}
                </span>
                <button
                  className="button button--secondary"
                  disabled={downloadingId === receipt.id}
                  onClick={() => void downloadReceipt(receipt.id)}
                  type="button"
                >
                  {downloadingId === receipt.id
                    ? 'Descargando…'
                    : 'Descargar PDF'}
                </button>
              </footer>
            </article>
          ))
        ) : (
          <div className="empty-state">
            No hay recibos que coincidan con los filtros seleccionados.
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
            {data.pagination.total} recibos
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
