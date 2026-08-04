'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  API_URL,
  PlatformApiError,
  accessSupport,
  getAuditLogs,
  getNotificationFailures,
  getOrganizations,
  getOverview,
  getPlatformSession,
  requestPlatformAccessCode,
  signIn,
  signOut,
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

const SESSION_KEY = 'nava.platform.session';
const dateFormatter = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

type View = 'audit' | 'notifications' | 'organizations' | 'overview';
type ModalState = {
  readonly organization: PlatformOrganization;
  readonly type: 'change_plan' | 'reactivate' | 'support' | 'suspend';
} | null;

const statusLabels: Readonly<Record<string, string>> = {
  active: 'Activa',
  cancelled: 'Cancelada',
  past_due: 'Pago pendiente',
  suspended: 'Suspendida',
  trial: 'En prueba',
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
      <div aria-label="Cargando" className="loader" role="status" />
    </main>
  );
}

function LoginScreen({
  error,
  loading,
  onSubmit,
}: {
  readonly error: string | null;
  readonly loading: boolean;
  readonly onSubmit: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(email, password);
  }

  return (
    <main className="auth-shell">
      <section className="login-card">
        <div className="brand-mark brand-mark--large">N</div>
        <div className="eyebrow">
          <span /> Operación interna
        </div>
        <h1>Control de plataforma</h1>
        <p className="login-copy">
          Acceso exclusivo para operadores autorizados de Nava.
        </p>
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label>
            Correo del operador
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="operaciones@nava.ec"
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Contraseña
            <input
              autoComplete="current-password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}
          <button
            className="button button--primary button--wide"
            disabled={loading}
            type="submit"
          >
            {loading ? 'Verificando…' : 'Ingresar al panel'}
          </button>
        </form>
        <div className="security-note">
          <Icon name="shield" />
          <span>Sesión protegida y acciones auditadas</span>
        </div>
        <p className="api-hint">API: {API_URL}</p>
      </section>
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
            {['trial', 'active', 'past_due', 'suspended', 'cancelled'].map(
              (status) => (
                <div className="status-summary-row" key={status}>
                  <span className={`status-dot status-dot--${status}`} />
                  <span>{statusLabel(status)}</span>
                  <strong>{overview.subscriptions[status] ?? 0}</strong>
                </div>
              ),
            )}
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
  organization,
}: {
  readonly onAction: (type: NonNullable<ModalState>['type']) => void;
  readonly organization: PlatformOrganization;
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
        {canSuspend ? (
          <button
            className="button button--danger-outline"
            onClick={() => onAction('suspend')}
            type="button"
          >
            Suspender cuenta
          </button>
        ) : (
          <button
            className="button button--success"
            onClick={() => onAction('reactivate')}
            type="button"
          >
            Reactivar cuenta
          </button>
        )}
        <button
          className="button button--secondary"
          onClick={() => onAction('change_plan')}
          type="button"
        >
          Cambiar plan
        </button>
        <button
          className="button button--ghost"
          onClick={() => onAction('support')}
          type="button"
        >
          Diagnóstico de soporte
        </button>
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
  onPage,
  onSelect,
  selected,
}: {
  readonly data: OrganizationList | null;
  readonly loading: boolean;
  readonly onAction: (type: NonNullable<ModalState>['type']) => void;
  readonly onFilters: (search: string, status: string) => void;
  readonly onPage: (page: number) => void;
  readonly onSelect: (organization: PlatformOrganization) => void;
  readonly selected: PlatformOrganization | null;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onFilters(search.trim(), status);
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
          <span className="sr-only">Filtrar por estado</span>
          <select
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="all">Todos los estados</option>
            <option value="trial">En prueba</option>
            <option value="active">Activas</option>
            <option value="past_due">Pago pendiente</option>
            <option value="suspended">Suspendidas</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </label>
        <button className="button button--primary" type="submit">
          Aplicar filtros
        </button>
      </form>
      <div className="organizations-layout">
        <section className="table-card">
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
              className={`organization-row${selected?.id === organization.id ? 'organization-row--selected' : ''}`}
              key={organization.id}
              onClick={() => onSelect(organization)}
              type="button"
            >
              <span className="organization-avatar">
                {initials(organization.name)}
              </span>
              <span className="organization-main">
                <strong>{organization.name}</strong>
                <small>
                  {organization.owner?.fullName ?? 'Sin propietario'} ·{' '}
                  {organization.owner?.email ?? 'Sin contacto'}
                </small>
              </span>
              <span className="organization-plan">
                <small>Plan</small>
                <strong>{organization.plan ?? '—'}</strong>
              </span>
              <span
                className={`status-badge status-badge--${organization.status}`}
              >
                <span /> {statusLabel(organization.status)}
              </span>
              <Icon name="chevron" />
            </button>
          ))}
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
          <OrganizationDetails onAction={onAction} organization={selected} />
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
  errors,
}: {
  readonly errors: readonly NotificationFailure[];
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
              </div>
            </article>
          ))
        )}
      </section>
    </>
  );
}

function Audit({ logs }: { readonly logs: readonly PlatformAuditLog[] }) {
  return (
    <>
      <SectionHeader
        description="Trazabilidad de operaciones sensibles realizadas desde este panel."
        title="Auditoría de plataforma"
      />
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
  const [planCode, setPlanCode] = useState(
    modal.organization.plan ?? 'essential',
  );
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
              <label>
                Nuevo plan
                <select
                  onChange={(event) => setPlanCode(event.target.value)}
                  value={planCode}
                >
                  <option value="essential">Esencial</option>
                  <option value="multi">Multi</option>
                </select>
              </label>
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
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<PlatformOrganization | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
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
    void getOrganizations(token, { page, search, status })
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
      });
    return () => {
      active = false;
    };
  }, [page, refreshKey, search, status, token]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const navigation = useMemo(
    () => [
      { icon: 'dashboard', id: 'overview' as const, label: 'Resumen' },
      {
        icon: 'building',
        id: 'organizations' as const,
        label: 'Organizaciones',
      },
      {
        badge: notificationErrors.length,
        icon: 'bell',
        id: 'notifications' as const,
        label: 'Notificaciones',
      },
      { icon: 'audit', id: 'audit' as const, label: 'Auditoría' },
    ],
    [notificationErrors.length],
  );

  async function login(email: string, password: string) {
    setLoginBusy(true);
    setLoginError(null);
    try {
      const response = await signIn(email, password);
      try {
        const challenge = await requestPlatformAccessCode(
          response.session.token,
        );
        setChallengeToken(response.session.token);
        setChallengeExpiresAt(challenge.expiresAt);
        setAuthState('challenge');
      } catch (error) {
        await signOut(response.session.token).catch(() => undefined);
        throw error;
      }
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

  async function verifyAccessCode(code: string) {
    if (!challengeToken) return;
    setLoginBusy(true);
    setLoginError(null);
    try {
      const session = await verifyPlatformAccessCode(challengeToken, code);
      window.sessionStorage.setItem(SESSION_KEY, challengeToken);
      setOperator(session.operator);
      setToken(challengeToken);
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

  if (authState === 'checking') return <LoadingScreen />;
  if (authState === 'anonymous')
    return (
      <LoginScreen error={loginError} loading={loginBusy} onSubmit={login} />
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
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <strong>Nava</strong>
            <span>Plataforma</span>
          </div>
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
            <span>Panel interno</span>
            <strong>Operación de pilotos</strong>
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
              loading={loading}
              onAction={(type) => {
                if (selected) {
                  setDiagnostics(null);
                  setModal({ organization: selected, type });
                }
              }}
              onFilters={(nextSearch, nextStatus) => {
                setPage(1);
                setSearch(nextSearch);
                setStatus(nextStatus);
              }}
              onPage={setPage}
              onSelect={setSelected}
              selected={selected}
            />
          ) : null}
          {view === 'notifications' ? (
            <Notifications errors={notificationErrors} />
          ) : null}
          {view === 'audit' ? <Audit logs={auditLogs} /> : null}
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
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
