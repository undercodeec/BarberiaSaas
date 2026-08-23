'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import navaLogo from '../../mobile/assets/nava-logo.png';

import {
  PlatformApiError,
  accessSupport,
  downloadAuditExport,
  getAuditLogs,
  getNotificationFailures,
  getOrganizations,
  getOverview,
  getPlatformSession,
  requestPlatformAccessCode,
  retryNotificationDelivery,
  signOut,
  startDevelopmentSession,
  startPlatformLogin,
  updateOrganization,
  verifyPlatformAccessCode,
  type NotificationFailure,
  type Operator,
  type OrganizationList,
  type PlatformAuditLog,
  type PlatformOrganization,
  type PlatformOverview,
  type SupportDiagnostics,
} from './platform-api';
import ParticleField from './ParticleField';
import PlatformLogin from './PlatformLogin';
import {
  OrganizationDetailModal,
  PlatformOperations,
} from './PlatformOperations';
import { PlatformUsers } from './PlatformUsers';

const SESSION_KEY = 'nava.platform.session';
const dateFormatter = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const auditDefaultTo = new Date().toISOString().slice(0, 10);
const auditDefaultFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

type View =
  | 'alerts'
  | 'audit'
  | 'cases'
  | 'content'
  | 'configuration'
  | 'health'
  | 'notifications'
  | 'operations'
  | 'overrides'
  | 'organizations'
  | 'overview'
  | 'privacy'
  | 'security'
  | 'users';
type ModalState = {
  readonly organization: PlatformOrganization;
  readonly type: 'change_plan' | 'reactivate' | 'support' | 'suspend';
} | null;
type AdminPermissions = {
  readonly billing: boolean;
  readonly operations: boolean;
  readonly support: boolean;
  readonly users: boolean;
};

const statusLabels: Readonly<Record<string, string>> = {
  free: 'Gratuita',
  active: 'Activa',
  cancelled: 'Cancelada',
  past_due: 'Pago pendiente',
  suspended: 'Suspendida',
  trial: 'En prueba',
};

const planLabels: Readonly<Record<string, string>> = {
  essential: 'Esencial',
  free: 'Free',
  local: 'Local',
  multi: 'Multi',
};

const actionLabels: Readonly<Record<string, string>> = {
  'platform.organization.change_plan': 'Cambio de plan',
  'platform.organization.reactivate': 'Reactivación',
  'platform.organization.support_accessed': 'Acceso de soporte',
  'platform.organization.suspend': 'Suspensión',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return dateFormatter.format(new Date(value));
}

function formatReason(value: unknown) {
  return typeof value === 'string' && value ? value : 'Sin detalle';
}

function statusLabel(status: string) {
  return statusLabels[status] ?? status.replaceAll('_', ' ');
}

function planLabel(plan: string | null) {
  if (!plan) return 'Sin plan';
  return planLabels[plan] ?? plan.replaceAll('_', ' ');
}

function initials(name: string) {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function Icon({ name }: { readonly name: string }) {
  const paths: Readonly<Record<string, React.ReactNode>> = {
    audit: <path d="M9 11h6M9 15h4M9 7h6M5 4h14v16H5z" />,
    bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
    building: (
      <path d="M4 21V7l8-4 8 4v14M8 10h2m4 0h2M8 14h2m4 0h2M9 21v-3h6v3" />
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    dashboard: (
      <path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-13h6V4h-6v3Z" />
    ),
    logout: (
      <path d="M10 17l5-5-5-5M15 12H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" />
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    refresh: (
      <path d="M20 6v5h-5M4 18v-5h5m10.1-2A8 8 0 0 0 6.3 6.3L4 8m16 8-2.3 1.7A8 8 0 0 1 4.9 14" />
    ),
    search: <path d="m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
    shield: (
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-5" />
    ),
  };
  return (
    <svg aria-hidden="true" className="icon" fill="none" viewBox="0 0 24 24">
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        {paths[name]}
      </g>
    </svg>
  );
}

function LoadingScreen() {
  return (
    <main className="auth-shell">
      <div className="loading-lockup">
        <div className="brand-mark brand-mark--large">N</div>
        <div aria-label="Cargando" className="loader" role="status" />
        <p>Preparando el centro de operaciones…</p>
      </div>
    </main>
  );
}

function PlatformAccessCodeScreen({
  error,
  expiresAt,
  loading,
  onCancel,
  onResend,
  onSubmit,
}: {
  readonly error: string | null;
  readonly expiresAt: string;
  readonly loading: boolean;
  readonly onCancel: () => Promise<void>;
  readonly onResend: () => Promise<void>;
  readonly onSubmit: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );
  const expired = remainingSeconds === 0;
  const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
  const seconds = String(remainingSeconds % 60).padStart(2, '0');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expired) await onSubmit(code);
  }

  return (
    <main className="auth-shell">
      <section className="login-card otp-card">
        <div className="brand-mark brand-mark--large">N</div>
        <div className="eyebrow">
          <span /> Verificación adicional
        </div>
        <h1>Confirma tu acceso</h1>
        <p className="login-copy">
          Enviamos un código de seis dígitos al correo autorizado. Solo podrás
          usarlo una vez.
        </p>
        <div className={`otp-timer${expired ? 'otp-timer--expired' : ''}`}>
          <Icon name="shield" />
          <span>
            {expired ? 'El código expiró' : `Expira en ${minutes}:${seconds}`}
          </span>
        </div>
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label>
            Código de acceso
            <input
              autoComplete="one-time-code"
              className="otp-input"
              disabled={loading || expired}
              inputMode="numeric"
              maxLength={6}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))
              }
              pattern="[0-9]{6}"
              placeholder="000000"
              required
              value={code}
            />
          </label>
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}
          <button
            className="button button--primary button--wide"
            disabled={loading || expired || code.length !== 6}
            type="submit"
          >
            {loading ? 'Verificando…' : 'Confirmar y entrar'}
          </button>
        </form>
        <div className="otp-actions">
          <button
            className="button button--secondary"
            disabled={loading}
            onClick={() => void onResend()}
            type="button"
          >
            Enviar un código nuevo
          </button>
          <button
            className="otp-cancel"
            disabled={loading}
            onClick={() => void onCancel()}
            type="button"
          >
            Cancelar acceso
          </button>
        </div>
      </section>
    </main>
  );
}

function EmptyState({ children }: { readonly children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

function SectionHeader({
  description,
  title,
}: {
  readonly description: string;
  readonly title: string;
}) {
  return (
    <div className="section-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="live-pill">
        <span /> Datos en vivo
      </div>
    </div>
  );
}

function MetricCard({
  detail,
  tone = 'neutral',
  value,
}: {
  readonly detail: string;
  readonly tone?: 'danger' | 'neutral' | 'success' | 'warning';
  readonly value: number;
}) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-value">{value.toLocaleString('es-EC')}</div>
      <p>{detail}</p>
    </article>
  );
}

function Overview({
  loading,
  overview,
}: {
  readonly loading: boolean;
  readonly overview: PlatformOverview | null;
}) {
  if (loading && !overview)
    return <div className="panel-loader">Cargando indicadores…</div>;
  if (!overview)
    return <EmptyState>No hay indicadores disponibles.</EmptyState>;
  const activation = overview.activation;
  const denominator = Math.max(activation.organizations, 1);
  const stages = [
    { label: 'Negocios registrados', value: activation.organizations },
    { label: 'Configuraron un servicio', value: activation.createdService },
    {
      label: 'Crearon su primera cita',
      value: activation.createdFirstAppointment,
    },
    {
      label: 'Completaron una atención',
      value: activation.completedFirstAppointment,
    },
  ];
  return (
    <>
      <SectionHeader
        description="Salud operativa y avance de los pilotos en un solo lugar."
        title="Resumen de plataforma"
      />
      <div className="metrics-grid">
        <MetricCard
          detail="Negocios registrados"
          tone="success"
          value={activation.organizations}
        />
        <MetricCard
          detail="Trials por vencer en 7 días"
          tone="warning"
          value={overview.trialsEndingSoon}
        />
        <MetricCard
          detail="Suscripciones activas"
          value={overview.subscriptions.active ?? 0}
        />
        <MetricCard
          detail="Fallos de notificación"
          tone="danger"
          value={overview.notificationFailures}
        />
      </div>
      <div className="overview-grid">
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="card-kicker">Activación</span>
              <h2>Embudo de primeros hitos</h2>
            </div>
            <span className="muted">Acumulado</span>
          </div>
          <div className="funnel">
            {stages.map((stage, index) => {
              const percent = Math.round((stage.value / denominator) * 100);
              return (
                <div className="funnel-row" key={stage.label}>
                  <div className="funnel-index">{index + 1}</div>
                  <div className="funnel-main">
                    <div className="funnel-label">
                      <span>{stage.label}</span>
                      <strong>{stage.value}</strong>
                    </div>
                    <div className="progress-track">
                      <span style={{ width: `${Math.min(percent, 100)}%` }} />
                    </div>
                  </div>
                  <span className="funnel-percent">{percent}%</span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="card-kicker">Suscripciones</span>
              <h2>Distribución por estado</h2>
            </div>
          </div>
          <div className="status-summary">
            {[
              'trial',
              'free',
              'active',
              'past_due',
              'suspended',
              'cancelled',
            ].map((status) => (
              <div className="status-summary-row" key={status}>
                <span className={`status-dot status-dot--${status}`} />
                <span>{statusLabel(status)}</span>
                <strong>{overview.subscriptions[status] ?? 0}</strong>
              </div>
            ))}
          </div>
          <p className="privacy-callout">
            <Icon name="shield" /> Este panel muestra únicamente información
            operativa necesaria.
          </p>
        </section>
      </div>
    </>
  );
}

function OrganizationDetails({
  onAction,
  onInspect,
  organization,
  permissions,
}: {
  readonly onAction: (type: NonNullable<ModalState>['type']) => void;
  readonly onInspect: () => void;
  readonly organization: PlatformOrganization;
  readonly permissions: AdminPermissions;
}) {
  const canSuspend =
    organization.status !== 'suspended' && organization.status !== 'cancelled';
  return (
    <aside className="detail-panel">
      <div className="detail-head">
        <div className="organization-avatar organization-avatar--large">
          {initials(organization.name)}
        </div>
        <div>
          <h2>{organization.name}</h2>
          <p>/{organization.slug}</p>
        </div>
      </div>
      <div className={`status-badge status-badge--${organization.status}`}>
        <span /> {statusLabel(organization.status)}
      </div>
      <dl className="details-list">
        <div>
          <dt>Plan</dt>
          <dd>{organization.plan ?? 'Sin plan'}</dd>
        </div>
        <div>
          <dt>Fin de prueba</dt>
          <dd>{formatDate(organization.trialEndsAt)}</dd>
        </div>
        <div>
          <dt>Propietario</dt>
          <dd>
            {organization.owner?.fullName ?? 'Sin propietario'}
            <small>{organization.owner?.email ?? '—'}</small>
          </dd>
        </div>
        <div>
          <dt>Alta</dt>
          <dd>{formatDate(organization.createdAt)}</dd>
        </div>
      </dl>
      <div className="usage-grid">
        <div>
          <strong>{organization.counts.locations}</strong>
          <span>Sucursales</span>
        </div>
        <div>
          <strong>{organization.counts.memberships}</strong>
          <span>Equipo</span>
        </div>
        <div>
          <strong>{organization.counts.services}</strong>
          <span>Servicios</span>
        </div>
        <div>
          <strong>{organization.counts.appointments}</strong>
          <span>Citas</span>
        </div>
      </div>
      <div className="detail-actions">
        <button
          className="button button--primary"
          onClick={onInspect}
          type="button"
        >
          Abrir ficha 360°
        </button>
        {permissions.operations && canSuspend ? (
          <button
            className="button button--danger-outline"
            onClick={() => onAction('suspend')}
            type="button"
          >
            Suspender cuenta
          </button>
        ) : permissions.operations ? (
          <button
            className="button button--success"
            onClick={() => onAction('reactivate')}
            type="button"
          >
            Reactivar cuenta
          </button>
        ) : null}
        {permissions.billing ? (
          <button
            className="button button--secondary"
            onClick={() => onAction('change_plan')}
            type="button"
          >
            Cambiar plan
          </button>
        ) : null}
        {permissions.support ? (
          <button
            className="button button--ghost"
            onClick={() => onAction('support')}
            type="button"
          >
            Diagnóstico de soporte
          </button>
        ) : null}
      </div>
      <p className="detail-disclaimer">
        Soporte consulta contadores y contacto enmascarado. Nunca suplanta al
        propietario.
      </p>
    </aside>
  );
}

function Organizations({
  data,
  loading,
  onAction,
  onFilters,
  onInspect,
  onPage,
  onSelect,
  permissions,
  selected,
}: {
  readonly data: OrganizationList | null;
  readonly loading: boolean;
  readonly onAction: (type: NonNullable<ModalState>['type']) => void;
  readonly onFilters: (
    search: string,
    status: string,
    plan: string,
    trial: string,
  ) => void;
  readonly onInspect: () => void;
  readonly onPage: (page: number) => void;
  readonly onSelect: (organization: PlatformOrganization) => void;
  readonly permissions: AdminPermissions;
  readonly selected: PlatformOrganization | null;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [plan, setPlan] = useState('all');
  const [trial, setTrial] = useState('all');
  const activeFilters = [
    search.trim(),
    status !== 'all',
    plan !== 'all',
    trial !== 'all',
  ].filter(Boolean).length;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onFilters(search.trim(), status, plan, trial);
  }
  function resetFilters() {
    setSearch('');
    setStatus('all');
    setPlan('all');
    setTrial('all');
    onFilters('', 'all', 'all', 'all');
  }
  return (
    <>
      <SectionHeader
        description="Planes, uso y estado de cada negocio registrado."
        title="Organizaciones"
      />
      <form className="filters" onSubmit={submit}>
        <label className="search-field">
          <Icon name="search" />
          <span className="sr-only">Buscar organización</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o slug…"
            value={search}
          />
        </label>
        <label>
          <span>Estado</span>
          <select
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="all">Todos los estados</option>
            <option value="trial">En prueba</option>
            <option value="free">Gratuitas</option>
            <option value="active">Activas</option>
            <option value="past_due">Pago pendiente</option>
            <option value="suspended">Suspendidas</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </label>
        <label>
          <span>Plan</span>
          <select
            onChange={(event) => setPlan(event.target.value)}
            value={plan}
          >
            <option value="all">Todos los planes</option>
            <option value="free">Nava Free</option>
            <option value="essential">Nava Esencial</option>
            <option value="local">Nava Local</option>
            <option value="multi">Nava Multi</option>
          </select>
        </label>
        <label>
          <span>Periodo de prueba</span>
          <select
            onChange={(event) => setTrial(event.target.value)}
            value={trial}
          >
            <option value="all">Cualquier fecha</option>
            <option value="ending_soon">Vence en 7 días</option>
            <option value="expired">Prueba vencida</option>
          </select>
        </label>
        <button className="button button--primary" type="submit">
          Aplicar filtros
        </button>
        {activeFilters > 0 ? (
          <button
            className="button button--ghost"
            onClick={resetFilters}
            type="button"
          >
            Limpiar ({activeFilters})
          </button>
        ) : null}
      </form>
      <div className="organizations-layout">
        <section className="table-card organization-table">
          <div className="table-toolbar">
            <div>
              <span className="card-kicker">Directorio</span>
              <strong>{data?.pagination.total ?? 0} organizaciones</strong>
            </div>
            {loading ? (
              <span className="inline-loader">Actualizando…</span>
            ) : null}
          </div>
          <div className="organization-table-body">
            <div aria-hidden="true" className="organization-table-head">
              <span>Organización</span>
              <span>Plan</span>
              <span>Estado</span>
            </div>
            {loading && !data ? (
              <div className="panel-loader">Cargando organizaciones…</div>
            ) : null}
            {data?.organizations.length === 0 ? (
              <EmptyState>
                No se encontraron organizaciones con estos filtros.
              </EmptyState>
            ) : null}
            {data?.organizations.map((organization) => (
              <button
                aria-pressed={selected?.id === organization.id}
                className={`organization-row${selected?.id === organization.id ? 'organization-row--selected' : ''}`}
                key={organization.id}
                onClick={() => onSelect(organization)}
                type="button"
              >
                <span className="organization-avatar">
                  {initials(organization.name)}
                </span>
                <span className="organization-main">
                  <strong title={organization.name}>{organization.name}</strong>
                  <small>
                    {organization.owner?.fullName ?? 'Sin propietario'} ·{' '}
                    {organization.owner?.email ?? 'Sin contacto'}
                  </small>
                </span>
                <span className="organization-plan">
                  <small>Plan</small>
                  <strong>{planLabel(organization.plan)}</strong>
                </span>
                <span
                  className={`status-badge status-badge--${organization.status}`}
                >
                  <span /> {statusLabel(organization.status)}
                </span>
                <Icon name="chevron" />
              </button>
            ))}
          </div>
          {data ? (
            <div className="pagination">
              <span>{data.pagination.total} organizaciones</span>
              <div>
                <button
                  disabled={data.pagination.page <= 1 || loading}
                  onClick={() => onPage(data.pagination.page - 1)}
                  type="button"
                >
                  Anterior
                </button>
                <span>
                  {data.pagination.page} / {data.pagination.totalPages}
                </span>
                <button
                  disabled={
                    data.pagination.page >= data.pagination.totalPages ||
                    loading
                  }
                  onClick={() => onPage(data.pagination.page + 1)}
                  type="button"
                >
                  Siguiente
                </button>
              </div>
            </div>
          ) : null}
        </section>
        {selected ? (
          <OrganizationDetails
            onAction={onAction}
            onInspect={onInspect}
            organization={selected}
            permissions={permissions}
          />
        ) : (
          <aside className="detail-panel detail-panel--empty">
            <Icon name="building" />
            <p>
              Selecciona una organización para consultar su uso y operar la
              cuenta.
            </p>
          </aside>
        )}
      </div>
    </>
  );
}

function Notifications({
  busy,
  canRetry,
  errors,
  onRetry,
}: {
  readonly busy: boolean;
  readonly canRetry: boolean;
  readonly errors: readonly NotificationFailure[];
  readonly onRetry: (failure: NotificationFailure) => Promise<void>;
}) {
  return (
    <>
      <SectionHeader
        description="Intentos fallidos sin exponer el contenido ni el payload del mensaje."
        title="Errores de notificación"
      />
      <section className="table-card">
        {errors.length === 0 ? (
          <EmptyState>No hay fallos de entrega recientes.</EmptyState>
        ) : (
          errors.map((error) => (
            <article className="event-row" key={error.id}>
              <span className="event-icon event-icon--danger">
                <Icon name="bell" />
              </span>
              <div className="event-main">
                <strong>{error.title}</strong>
                <span>{error.organization.name}</span>
                <small>ID {error.notificationId}</small>
              </div>
              <div className="event-meta">
                <span className="channel-badge">{error.channel}</span>
                <strong>
                  {error.attempts} intento{error.attempts === 1 ? '' : 's'}
                </strong>
                <time>{formatDate(error.createdAt)}</time>
                {canRetry ? (
                  <button
                    className="button button--ghost"
                    disabled={busy}
                    onClick={() => void onRetry(error)}
                    type="button"
                  >
                    Reintentar
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </section>
    </>
  );
}

function Audit({
  logs,
  onToast,
  token,
}: {
  readonly logs: readonly PlatformAuditLog[];
  readonly onToast: (message: string) => void;
  readonly token: string;
}) {
  const [from, setFrom] = useState(auditDefaultFrom);
  const [to, setTo] = useState(auditDefaultTo);
  const [exporting, setExporting] = useState(false);
  async function exportAudit() {
    setExporting(true);
    try {
      const result = await downloadAuditExport(token, {
        from: new Date(`${from}T00:00:00.000Z`).toISOString(),
        to: new Date(`${to}T23:59:59.999Z`).toISOString(),
      });
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      onToast('Exportación generada y registrada en auditoría.');
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : 'No fue posible exportar la auditoría.',
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <SectionHeader
        description="Trazabilidad de operaciones sensibles realizadas desde este panel."
        title="Auditoría de plataforma"
      />
      <div className="filters audit-export-controls">
        <label>
          <span>Desde</span>
          <input
            max={to}
            onChange={(event) => setFrom(event.target.value)}
            type="date"
            value={from}
          />
        </label>
        <label>
          <span>Hasta</span>
          <input
            min={from}
            onChange={(event) => setTo(event.target.value)}
            type="date"
            value={to}
          />
        </label>
        <button
          className="button button--primary"
          disabled={exporting || !from || !to}
          onClick={() => void exportAudit()}
          type="button"
        >
          {exporting ? 'Generando…' : 'Exportar CSV'}
        </button>
      </div>
      <section className="table-card">
        {logs.length === 0 ? (
          <EmptyState>Todavía no hay acciones de plataforma.</EmptyState>
        ) : (
          logs.map((log) => (
            <article className="event-row" key={log.id}>
              <span className="event-icon">
                <Icon name="audit" />
              </span>
              <div className="event-main">
                <strong>{actionLabels[log.action] ?? log.action}</strong>
                <span>{log.organization}</span>
                <small>{formatReason(log.reason)}</small>
              </div>
              <div className="event-meta">
                <strong>{log.actor?.fullName ?? 'Sistema'}</strong>
                <span>{log.actor?.email ?? '—'}</span>
                <time>{formatDate(log.createdAt)}</time>
              </div>
            </article>
          ))
        )}
      </section>
    </>
  );
}

function OperationModal({
  busy,
  diagnostics,
  modal,
  onClose,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly diagnostics: SupportDiagnostics | null;
  readonly modal: NonNullable<ModalState>;
  readonly onClose: () => void;
  readonly onSubmit: (reason: string, planCode: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [planCode, setPlanCode] = useState(modal.organization.plan ?? 'local');
  const [error, setError] = useState<string | null>(null);
  const titles = {
    change_plan: 'Cambiar plan',
    reactivate: 'Reactivar cuenta',
    support: 'Diagnóstico de soporte',
    suspend: 'Suspender cuenta',
  } as const;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 10) {
      setError('Describe el motivo con al menos 10 caracteres.');
      return;
    }
    setError(null);
    await onSubmit(reason.trim(), planCode);
  }
  const counts = diagnostics?.diagnostics.counts;
  return (
    <div aria-modal="true" className="modal-backdrop" role="dialog">
      <div className="modal-card">
        <button
          aria-label="Cerrar"
          className="modal-close"
          disabled={busy}
          onClick={onClose}
          type="button"
        >
          <Icon name="close" />
        </button>
        <span className="card-kicker">{modal.organization.name}</span>
        <h2>{diagnostics ? 'Diagnóstico operativo' : titles[modal.type]}</h2>
        {diagnostics && counts ? (
          <>
            <p className="modal-copy">{diagnostics.notice}</p>
            <div className="diagnostics-grid">
              <div>
                <strong>{counts.locations}</strong>
                <span>Sucursales</span>
              </div>
              <div>
                <strong>{counts.activeMembers}</strong>
                <span>Miembros activos</span>
              </div>
              <div>
                <strong>{counts.activeServices}</strong>
                <span>Servicios activos</span>
              </div>
              <div>
                <strong>{counts.recentAppointments}</strong>
                <span>Citas en 30 días</span>
              </div>
              <div>
                <strong>{counts.openCashRegisters}</strong>
                <span>Cajas abiertas</span>
              </div>
              <div>
                <strong>{counts.notificationFailures}</strong>
                <span>Fallos de entrega</span>
              </div>
            </div>
            <div className="masked-owner">
              <span>Contacto enmascarado</span>
              <strong>
                {diagnostics.diagnostics.owner?.fullName ?? 'Sin propietario'}
              </strong>
              <small>{diagnostics.diagnostics.owner?.email ?? '—'}</small>
            </div>
            <button
              className="button button--primary button--wide"
              onClick={onClose}
              type="button"
            >
              Cerrar diagnóstico
            </button>
          </>
        ) : (
          <form className="modal-form" onSubmit={(event) => void submit(event)}>
            <p className="modal-copy">
              Esta operación quedará registrada con tu identidad y el motivo
              indicado.
            </p>
            {modal.type === 'change_plan' ? (
              <>
                <label>
                  Nuevo plan
                  <select
                    onChange={(event) => setPlanCode(event.target.value)}
                    value={planCode}
                  >
                    <option value="free">Nava Free</option>
                    <option value="essential">Nava Esencial - $9.83</option>
                    <option value="local">Nava Local - $29.83</option>
                    <option value="multi">Nava Multi - $48.83</option>
                  </select>
                </label>
              </>
            ) : null}
            <label>
              Motivo de la operación
              <textarea
                maxLength={500}
                minLength={10}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explica por qué es necesaria esta operación…"
                required
                rows={4}
                value={reason}
              />
              <small>{reason.trim().length}/500 · mínimo 10</small>
            </label>
            {error ? (
              <div className="form-error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="modal-actions">
              <button
                className="button button--ghost"
                disabled={busy}
                onClick={onClose}
                type="button"
              >
                Cancelar
              </button>
              <button
                className={`button ${modal.type === 'suspend' ? 'button--danger' : 'button--primary'}`}
                disabled={busy}
                type="submit"
              >
                {busy
                  ? 'Procesando…'
                  : modal.type === 'support'
                    ? 'Consultar y auditar'
                    : 'Confirmar operación'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AdminConsole() {
  const [authState, setAuthState] = useState<
    'anonymous' | 'authenticated' | 'checking' | 'challenge'
  >('checking');
  const [operator, setOperator] = useState<Operator | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeExpiresAt, setChallengeExpiresAt] = useState<string | null>(
    null,
  );
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [view, setView] = useState<View>('overview');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationList | null>(
    null,
  );
  const [notificationErrors, setNotificationErrors] = useState<
    readonly NotificationFailure[]
  >([]);
  const [auditLogs, setAuditLogs] = useState<readonly PlatformAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [organizationsLoading, setOrganizationsLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [plan, setPlan] = useState('all');
  const [trial, setTrial] = useState('all');
  const [selected, setSelected] = useState<PlatformOrganization | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [detailOrganization, setDetailOrganization] =
    useState<PlatformOrganization | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<SupportDiagnostics | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const storedToken = window.sessionStorage.getItem(SESSION_KEY);
    let active = true;
    if (!storedToken) {
      queueMicrotask(() => {
        if (active) setAuthState('anonymous');
      });
      return () => {
        active = false;
      };
    }
    void getPlatformSession(storedToken)
      .then(({ operator: currentOperator }) => {
        if (!active) return;
        setOperator(currentOperator);
        setToken(storedToken);
        setAuthState('authenticated');
      })
      .catch(() => {
        window.sessionStorage.removeItem(SESSION_KEY);
        if (active) setAuthState('anonymous');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void Promise.all([
      getOverview(token),
      getNotificationFailures(token),
      getAuditLogs(token),
    ])
      .then(([nextOverview, failures, audits]) => {
        if (!active) return;
        setOverview(nextOverview);
        setNotificationErrors(failures.errors);
        setAuditLogs(audits.logs);
        setLastUpdatedAt(new Date());
      })
      .catch((error: unknown) => {
        if (active)
          setToast(
            error instanceof Error
              ? error.message
              : 'No fue posible cargar el panel.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey, token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void getOrganizations(token, { page, plan, search, status, trial })
      .then((result) => {
        if (!active) return;
        setOrganizations(result);
        setSelected(
          (current) =>
            result.organizations.find(({ id }) => id === current?.id) ??
            result.organizations[0] ??
            null,
        );
      })
      .catch((error: unknown) => {
        if (active)
          setToast(
            error instanceof Error
              ? error.message
              : 'No fue posible cargar las organizaciones.',
          );
      })
      .finally(() => {
        if (active) setOrganizationsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, plan, refreshKey, search, status, token, trial]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const operatorPermissions: AdminPermissions = {
    billing: operator?.role === 'super_admin' || operator?.role === 'billing',
    operations:
      operator?.role === 'super_admin' || operator?.role === 'operations',
    support:
      operator?.role === 'super_admin' ||
      operator?.role === 'operations' ||
      operator?.role === 'support',
    users: operator?.role === 'super_admin' || operator?.role === 'operations',
  };

  const navigation = useMemo(
    () => [
      { icon: 'dashboard', id: 'overview' as const, label: 'Resumen' },
      {
        icon: 'building',
        id: 'organizations' as const,
        label: 'Organizaciones',
      },
      { icon: 'users', id: 'users' as const, label: 'Usuarios' },
      {
        badge: notificationErrors.length,
        icon: 'bell',
        id: 'notifications' as const,
        label: 'Notificaciones',
      },
      { icon: 'dashboard', id: 'operations' as const, label: 'Operación' },
      { icon: 'bell', id: 'alerts' as const, label: 'Alertas' },
      ...(operatorPermissions.support
        ? [{ icon: 'shield', id: 'cases' as const, label: 'Incidencias' }]
        : []),
      ...(operatorPermissions.support
        ? [
            {
              icon: 'building',
              id: 'content' as const,
              label: 'Onboarding y reseñas',
            },
            { icon: 'shield', id: 'privacy' as const, label: 'Privacidad' },
          ]
        : []),
      ...(operatorPermissions.billing
        ? [{ icon: 'audit', id: 'overrides' as const, label: 'Excepciones' }]
        : []),
      { icon: 'dashboard', id: 'health' as const, label: 'Estado técnico' },
      ...(operator?.role === 'super_admin'
        ? [
            { icon: 'shield', id: 'security' as const, label: 'Seguridad' },
            {
              icon: 'audit',
              id: 'configuration' as const,
              label: 'Configuración global',
            },
          ]
        : []),
      { icon: 'audit', id: 'audit' as const, label: 'Auditoría' },
    ],
    [
      notificationErrors.length,
      operator?.role,
      operatorPermissions.billing,
      operatorPermissions.support,
    ],
  );

  async function login(email: string, password: string) {
    setLoginBusy(true);
    setLoginError(null);
    try {
      const challenge = await startPlatformLogin(email, password);
      setChallengeToken(challenge.challengeToken);
      setChallengeExpiresAt(challenge.expiresAt);
      setAuthState('challenge');
    } catch (error) {
      setLoginError(
        error instanceof PlatformApiError
          ? error.message
          : 'No fue posible conectar con la API.',
      );
    } finally {
      setLoginBusy(false);
    }
  }

  async function enterDevelopmentDashboard() {
    if (process.env.NODE_ENV === 'production') return;
    setLoginBusy(true);
    setLoginError(null);
    try {
      const { operator: developmentOperator, session } =
        await startDevelopmentSession();
      window.sessionStorage.setItem(SESSION_KEY, session.token);
      setOperator(developmentOperator);
      setToken(session.token);
      setAuthState('authenticated');
    } catch (error) {
      setLoginError(
        error instanceof PlatformApiError
          ? error.message
          : 'No fue posible conectar con la API local.',
      );
    } finally {
      setLoginBusy(false);
    }
  }

  async function verifyAccessCode(code: string) {
    if (!challengeToken) return;
    setLoginBusy(true);
    setLoginError(null);
    try {
      const session = await verifyPlatformAccessCode(challengeToken, code);
      window.sessionStorage.setItem(SESSION_KEY, session.session.token);
      setOperator(session.operator);
      setToken(session.session.token);
      setChallengeToken(null);
      setChallengeExpiresAt(null);
      setAuthState('authenticated');
    } catch (error) {
      setLoginError(
        error instanceof PlatformApiError
          ? error.message
          : 'No fue posible verificar el código.',
      );
    } finally {
      setLoginBusy(false);
    }
  }

  async function resendAccessCode() {
    if (!challengeToken) return;
    setLoginBusy(true);
    setLoginError(null);
    try {
      const challenge = await requestPlatformAccessCode(challengeToken);
      setChallengeExpiresAt(challenge.expiresAt);
    } catch (error) {
      setLoginError(
        error instanceof PlatformApiError
          ? error.message
          : 'No fue posible enviar un nuevo código.',
      );
    } finally {
      setLoginBusy(false);
    }
  }

  async function cancelAccessChallenge() {
    if (challengeToken) await signOut(challengeToken).catch(() => undefined);
    setChallengeToken(null);
    setChallengeExpiresAt(null);
    setLoginError(null);
    setAuthState('anonymous');
  }

  async function logout() {
    if (token) await signOut(token).catch(() => undefined);
    window.sessionStorage.removeItem(SESSION_KEY);
    setToken(null);
    setChallengeToken(null);
    setChallengeExpiresAt(null);
    setOperator(null);
    setAuthState('anonymous');
  }

  function refreshPanel() {
    setLoading(true);
    setOrganizationsLoading(true);
    setRefreshKey((value) => value + 1);
  }

  async function submitOperation(reason: string, planCode: string) {
    if (!token || !modal) return;
    setModalBusy(true);
    try {
      if (modal.type === 'support') {
        const result = await accessSupport(
          token,
          modal.organization.id,
          reason,
        );
        setDiagnostics(result);
        setRefreshKey((value) => value + 1);
        return;
      }
      await updateOrganization(
        token,
        modal.organization.id,
        modal.type === 'change_plan'
          ? { action: 'change_plan', planCode, reason }
          : { action: modal.type, reason },
      );
      setModal(null);
      setToast('Operación completada y registrada en auditoría.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : 'No fue posible completar la operación.',
      );
    } finally {
      setModalBusy(false);
    }
  }

  async function retryNotification(failure: NotificationFailure) {
    if (!token) return;
    const reason = window.prompt(
      'Motivo del reintento (mínimo 10 caracteres):',
    );
    if (!reason) return;
    setModalBusy(true);
    try {
      await retryNotificationDelivery(
        token,
        failure.notificationId,
        failure.channel,
        reason,
      );
      setToast('Reintento encolado y registrado en auditoría.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : 'No fue posible reintentar la entrega.',
      );
    } finally {
      setModalBusy(false);
    }
  }

  if (authState === 'checking') return <LoadingScreen />;
  if (authState === 'anonymous')
    return (
      <PlatformLogin
        error={loginError}
        loading={loginBusy}
        onDevelopmentAccess={enterDevelopmentDashboard}
        onSubmit={login}
      />
    );
  if (authState === 'challenge' && challengeExpiresAt)
    return (
      <PlatformAccessCodeScreen
        error={loginError}
        expiresAt={challengeExpiresAt}
        key={challengeExpiresAt}
        loading={loginBusy}
        onCancel={cancelAccessChallenge}
        onResend={resendAccessCode}
        onSubmit={verifyAccessCode}
      />
    );

  return (
    <div className="admin-shell">
      <aside className={`sidebar${mobileMenu ? 'sidebar--open' : ''}`}>
        <ParticleField className="sidebar-particle-field" />
        <div className="brand">
          <Image alt="Nava" className="brand-logo" priority src={navaLogo} />
        </div>
        <nav aria-label="Navegación principal">
          {navigation.map((item) => (
            <button
              className={
                view === item.id ? 'nav-item nav-item--active' : 'nav-item'
              }
              key={item.id}
              onClick={() => {
                setView(item.id);
                setMobileMenu(false);
              }}
              type="button"
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.badge ? <b>{item.badge}</b> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-security">
          <Icon name="shield" />
          <div>
            <strong>Acceso restringido</strong>
            <span>Solo platform admins</span>
          </div>
        </div>
        <button
          className="nav-item nav-item--logout"
          onClick={() => void logout()}
          type="button"
        >
          <Icon name="logout" />
          <span>Cerrar sesión</span>
        </button>
      </aside>
      {mobileMenu ? (
        <button
          aria-label="Cerrar menú"
          className="sidebar-scrim"
          onClick={() => setMobileMenu(false)}
          type="button"
        />
      ) : null}
      <main className="main-area">
        <header className="topbar">
          <button
            aria-label="Abrir menú"
            className="menu-button"
            onClick={() => setMobileMenu(true)}
            type="button"
          >
            <Icon name="menu" />
          </button>
          <div className="topbar-context">
            <span>
              Panel interno /{' '}
              {navigation.find((item) => item.id === view)?.label}
            </span>
            <strong>Operación de plataforma</strong>
          </div>
          <div className="topbar-actions">
            <div className="sync-status">
              <span />
              <div>
                <strong>API conectada</strong>
                <small>
                  {lastUpdatedAt
                    ? `Actualizado ${lastUpdatedAt.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Sincronizando'}
                </small>
              </div>
            </div>
            <button
              aria-label="Actualizar datos"
              className={`refresh-button${loading ? 'refresh-button--loading' : ''}`}
              disabled={loading}
              onClick={refreshPanel}
              title="Actualizar datos"
              type="button"
            >
              <Icon name="refresh" />
            </button>
          </div>
          <div className="operator">
            <div>
              <strong>{operator?.fullName}</strong>
              <span>{operator?.email}</span>
            </div>
            <span className="operator-avatar">
              {initials(operator?.fullName ?? 'Nava')}
            </span>
          </div>
        </header>
        <div className="page-content">
          {view === 'overview' ? (
            <Overview loading={loading} overview={overview} />
          ) : null}
          {view === 'organizations' ? (
            <Organizations
              data={organizations}
              loading={organizationsLoading}
              onAction={(type) => {
                if (selected) {
                  setDiagnostics(null);
                  setModal({ organization: selected, type });
                }
              }}
              onFilters={(nextSearch, nextStatus, nextPlan, nextTrial) => {
                setOrganizationsLoading(true);
                setPage(1);
                setSearch(nextSearch);
                setStatus(nextStatus);
                setPlan(nextPlan);
                setTrial(nextTrial);
              }}
              onInspect={() => {
                if (selected) setDetailOrganization(selected);
              }}
              onPage={(nextPage) => {
                setOrganizationsLoading(true);
                setPage(nextPage);
              }}
              onSelect={setSelected}
              permissions={operatorPermissions}
              selected={selected}
            />
          ) : null}
          {view === 'users' && token ? (
            <PlatformUsers
              canManage={operatorPermissions.users}
              onToast={setToast}
              token={token}
            />
          ) : null}
          {view === 'notifications' ? (
            <Notifications
              busy={modalBusy}
              canRetry={operatorPermissions.operations}
              errors={notificationErrors}
              onRetry={retryNotification}
            />
          ) : null}
          {view === 'audit' && token ? (
            <Audit logs={auditLogs} onToast={setToast} token={token} />
          ) : null}
          {token &&
          operator &&
          (view === 'alerts' ||
            view === 'cases' ||
            view === 'configuration' ||
            view === 'content' ||
            view === 'health' ||
            view === 'operations' ||
            view === 'overrides' ||
            view === 'privacy' ||
            view === 'security') ? (
            <PlatformOperations
              currentOperatorId={operator.id}
              currentRole={operator.role}
              onToast={setToast}
              organizations={organizations?.organizations ?? []}
              token={token}
              view={view}
            />
          ) : null}
        </div>
      </main>
      {modal ? (
        <OperationModal
          busy={modalBusy}
          diagnostics={diagnostics}
          key={`${modal.organization.id}:${modal.type}`}
          modal={modal}
          onClose={() => {
            if (!modalBusy) {
              setModal(null);
              setDiagnostics(null);
            }
          }}
          onSubmit={submitOperation}
        />
      ) : null}
      {detailOrganization && token ? (
        <OrganizationDetailModal
          onClose={() => setDetailOrganization(null)}
          onMutated={() => setRefreshKey((value) => value + 1)}
          organization={detailOrganization}
          allowExtendTrial={operatorPermissions.billing}
          token={token}
        />
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
