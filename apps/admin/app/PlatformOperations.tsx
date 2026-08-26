'use client';

import { useEffect, useState, type FormEvent } from 'react';

import {
  createOrganizationNote,
  createPlatformConfiguration,
  createPlatformOverride,
  createPrivacyRequest,
  createSupportCase,
  getOnboardingProfiles,
  getOrganizationDetail,
  getPlatformAlerts,
  getPlatformConfigurations,
  getPlatformOperationalRecords,
  getPlatformOperators,
  getPlatformOverrides,
  getPlatformReviews,
  getPrivacyRequests,
  getPlatformSessions,
  getSupportCases,
  getSystemHealth,
  revokePlatformSession,
  revokePlatformOverride,
  resendPendingVerification,
  savePlatformOperator,
  publishPlatformConfiguration,
  rollbackPlatformConfiguration,
  updateOrganization,
  updatePlatformAlert,
  updatePlatformOperator,
  updatePlatformReviewVisibility,
  updatePrivacyRequest,
  updateSupportCase,
  type PlatformAlert,
  type PlatformConfigurationVersion,
  type PlatformFeatureOverride,
  type PlatformOnboardingProfile,
  type PlatformOnboardingResult,
  type PlatformOperatorRecord,
  type PlatformOperationalDomain,
  type PlatformOperationalRecord,
  type PlatformOrganization,
  type PlatformOrganizationDetail,
  type PlatformPrivacyRequest,
  type PlatformReview,
  type PlatformSession,
  type PlatformSupportCase,
  type PlatformSystemHealth,
} from './platform-api';

type OperationsView =
  | 'alerts'
  | 'cases'
  | 'configuration'
  | 'content'
  | 'health'
  | 'operations'
  | 'overrides'
  | 'privacy'
  | 'security';
type PlatformOverrideInput = Parameters<typeof createPlatformOverride>[1];

const dateFormatter = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : '—';
}

function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/^./u, (letter) => letter.toUpperCase());
}

function Empty({ children }: { readonly children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

function Heading({
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
        <span /> Datos protegidos
      </div>
    </div>
  );
}

function AlertsView({
  alerts,
  busy,
  canManage,
  onAction,
}: {
  readonly alerts: readonly PlatformAlert[];
  readonly busy: boolean;
  readonly canManage: boolean;
  readonly onAction: (
    alert: PlatformAlert,
    status: 'acknowledged' | 'resolved',
  ) => Promise<void>;
}) {
  return (
    <>
      <Heading
        description="Riesgos detectados en trials, caja, inventario, pedidos y entregas."
        title="Alertas operativas"
      />
      <section className="table-card">
        {alerts.length === 0 ? (
          <Empty>No hay alertas registradas.</Empty>
        ) : (
          alerts.map((alert) => (
            <article className="event-row" key={alert.id}>
              <span
                className={`event-icon event-icon--${alert.severity === 'critical' ? 'danger' : 'warning'}`}
              >
                !
              </span>
              <div className="event-main">
                <strong>{alert.title}</strong>
                <span>{alert.detail}</span>
                <small>
                  {alert.organization?.name ?? 'Plataforma'} ·{' '}
                  {titleCase(alert.type)}
                </small>
              </div>
              <div className="event-meta">
                <span className="channel-badge">{titleCase(alert.status)}</span>
                <time>{formatDate(alert.occurredAt)}</time>
                {canManage && alert.status !== 'resolved' ? (
                  <div className="inline-actions">
                    {alert.status === 'open' ? (
                      <button
                        className="button button--ghost"
                        disabled={busy}
                        onClick={() => void onAction(alert, 'acknowledged')}
                        type="button"
                      >
                        Reconocer
                      </button>
                    ) : null}
                    <button
                      className="button button--secondary"
                      disabled={busy}
                      onClick={() => void onAction(alert, 'resolved')}
                      type="button"
                    >
                      Resolver
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))
        )}
      </section>
    </>
  );
}

function CasesView({
  cases,
  organizations,
  busy,
  onCreate,
  onStatus,
  onUpdate,
  operators,
  summary,
}: {
  readonly cases: readonly PlatformSupportCase[];
  readonly organizations: readonly PlatformOrganization[];
  readonly busy: boolean;
  readonly onCreate: (input: {
    category: string;
    description: string;
    organizationId: string;
    priority: string;
    title: string;
  }) => Promise<void>;
  readonly onStatus: (
    supportCase: PlatformSupportCase,
    status: string,
  ) => Promise<void>;
  readonly onUpdate: (
    supportCase: PlatformSupportCase,
    input: {
      assignedToUserId?: string | null;
      priority?: string;
      slaDueAt?: string | null;
    },
  ) => Promise<void>;
  readonly operators: readonly {
    readonly fullName: string;
    readonly id: string;
  }[];
  readonly summary: { readonly breached: number; readonly open: number };
}) {
  const [creating, setCreating] = useState(false);
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.id ?? '',
  );
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('soporte');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate({ category, description, organizationId, priority, title });
    setCreating(false);
    setTitle('');
    setDescription('');
  }

  return (
    <>
      <Heading
        description="Casos con responsable, prioridad, SLA y trazabilidad."
        title="Centro de incidencias"
      />
      <div className="toolbar-row">
        <button
          className="button button--primary"
          onClick={() => setCreating((value) => !value)}
          type="button"
        >
          {creating ? 'Cancelar' : 'Nueva incidencia'}
        </button>
        <span className="channel-badge">{summary.open} abiertas</span>
        <span className="channel-badge">{summary.breached} fuera de SLA</span>
      </div>
      {creating ? (
        <form
          className="content-card compact-form"
          onSubmit={(event) => void submit(event)}
        >
          <label>
            Organización
            <select
              onChange={(event) => setOrganizationId(event.target.value)}
              required
              value={organizationId}
            >
              <option value="">Selecciona…</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Título
            <input
              maxLength={160}
              minLength={5}
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </label>
          <label>
            Categoría
            <input
              maxLength={60}
              minLength={2}
              onChange={(event) => setCategory(event.target.value)}
              required
              value={category}
            />
          </label>
          <label>
            Prioridad
            <select
              onChange={(event) => setPriority(event.target.value)}
              value={priority}
            >
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
              <option value="critical">Crítica</option>
            </select>
          </label>
          <label className="form-span">
            Descripción
            <textarea
              maxLength={2000}
              minLength={10}
              onChange={(event) => setDescription(event.target.value)}
              required
              rows={4}
              value={description}
            />
          </label>
          <button
            className="button button--primary"
            disabled={busy || !organizationId}
            type="submit"
          >
            Crear y asignarme
          </button>
        </form>
      ) : null}
      <section className="table-card">
        {cases.length === 0 ? (
          <Empty>No hay incidencias.</Empty>
        ) : (
          cases.map((supportCase) => (
            <article className="event-row" key={supportCase.id}>
              <span
                className={`priority-marker priority-marker--${supportCase.priority}`}
              />
              <div className="event-main">
                <strong>{supportCase.title}</strong>
                <span>
                  {supportCase.organization.name} · {supportCase.category}
                </span>
                <small>{supportCase.description}</small>
                {supportCase.events[0]?.note ? (
                  <small>Última nota: {supportCase.events[0].note}</small>
                ) : null}
              </div>
              <div className="event-meta">
                <span className="channel-badge">
                  {titleCase(supportCase.status)}
                </span>
                <strong>{titleCase(supportCase.priority)}</strong>
                <span className="channel-badge">
                  SLA {titleCase(supportCase.sla.state)}
                </span>
                <time>Vence {formatDate(supportCase.slaDueAt)}</time>
                <label>
                  Responsable
                  <select
                    aria-label={`Responsable de ${supportCase.title}`}
                    defaultValue={supportCase.assignedTo?.id ?? ''}
                    disabled={busy}
                    onChange={(event) =>
                      void onUpdate(supportCase, {
                        assignedToUserId: event.target.value || null,
                      })
                    }
                  >
                    <option value="">Sin asignar</option>
                    {operators.map((operator) => (
                      <option key={operator.id} value={operator.id}>
                        {operator.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Fecha límite SLA
                  <input
                    aria-label={`SLA de ${supportCase.title}`}
                    defaultValue={supportCase.slaDueAt?.slice(0, 16) ?? ''}
                    disabled={busy}
                    onBlur={(event) => {
                      const next = event.target.value
                        ? new Date(event.target.value).toISOString()
                        : null;
                      if (next !== supportCase.slaDueAt)
                        void onUpdate(supportCase, { slaDueAt: next });
                    }}
                    type="datetime-local"
                  />
                </label>
                <time>{formatDate(supportCase.updatedAt)}</time>
                {supportCase.status !== 'closed' ? (
                  <button
                    className="button button--secondary"
                    disabled={busy}
                    onClick={() =>
                      void onStatus(
                        supportCase,
                        supportCase.status === 'open'
                          ? 'in_progress'
                          : 'closed',
                      )
                    }
                    type="button"
                  >
                    {supportCase.status === 'open'
                      ? 'Tomar caso'
                      : 'Cerrar caso'}
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

function SecurityView({
  operators,
  sessions,
  busy,
  currentOperatorId,
  onRevoke,
  onSave,
  onToggle,
}: {
  readonly operators: readonly PlatformOperatorRecord[];
  readonly sessions: readonly PlatformSession[];
  readonly busy: boolean;
  readonly currentOperatorId: string;
  readonly onRevoke: (session: PlatformSession) => Promise<void>;
  readonly onSave: (email: string, role: string) => Promise<void>;
  readonly onToggle: (operator: PlatformOperatorRecord) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('read_only');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(email, role);
    setEmail('');
  }
  return (
    <>
      <Heading
        description="Roles de mínimo privilegio y sesiones verificadas con OTP."
        title="Operadores y seguridad"
      />
      <form
        className="content-card compact-form"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          Correo de una cuenta Nava verificada
          <input
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          Rol
          <select
            onChange={(event) => setRole(event.target.value)}
            value={role}
          >
            <option value="read_only">Solo lectura</option>
            <option value="support">Soporte</option>
            <option value="operations">Operaciones</option>
            <option value="billing">Facturación</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </label>
        <button
          className="button button--primary"
          disabled={busy}
          type="submit"
        >
          Guardar operador
        </button>
      </form>
      <div className="overview-grid">
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="card-kicker">Accesos</span>
              <h2>Operadores</h2>
            </div>
          </div>
          {operators.map((operator) => (
            <div className="status-summary-row" key={operator.id}>
              <span
                className={`status-dot status-dot--${operator.isActive ? 'active' : 'suspended'}`}
              />
              <span>
                <strong>{operator.fullName}</strong>
                <small>{operator.email}</small>
              </span>
              <span className="channel-badge">{titleCase(operator.role)}</span>
              <button
                className="button button--ghost"
                disabled={
                  busy ||
                  operator.userId === currentOperatorId ||
                  operator.id.startsWith('bootstrap:')
                }
                onClick={() => void onToggle(operator)}
                type="button"
              >
                {operator.isActive ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          ))}
        </section>
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="card-kicker">OTP verificado</span>
              <h2>Sesiones activas</h2>
            </div>
          </div>
          {sessions.map((session) => (
            <div className="status-summary-row" key={session.id}>
              <span className="status-dot status-dot--active" />
              <span>
                <strong>
                  {session.operator.fullName}
                  {session.current ? ' (actual)' : ''}
                </strong>
                <small>
                  Última actividad {formatDate(session.lastActiveAt)}
                </small>
              </span>
              <button
                className="button button--ghost"
                disabled={busy || session.current}
                onClick={() => void onRevoke(session)}
                type="button"
              >
                {session.current ? 'Sesión actual' : 'Revocar'}
              </button>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function HealthView({
  health,
}: {
  readonly health: PlatformSystemHealth | null;
}) {
  return (
    <>
      <Heading
        description="Comprobación segura de API, base de datos y entrega de mensajes."
        title="Estado de plataforma"
      />
      {!health ? (
        <Empty>No hay diagnóstico disponible.</Empty>
      ) : (
        <>
          <div className="metrics-grid">
            <article className="metric-card metric-card--success">
              <div className="metric-value">
                {health.components.api?.status === 'operational' ? 'OK' : '—'}
              </div>
              <p>API</p>
            </article>
            <article className="metric-card metric-card--success">
              <div className="metric-value">
                {health.components.database?.status === 'operational'
                  ? 'OK'
                  : '—'}
              </div>
              <p>Base de datos</p>
            </article>
            <article className="metric-card metric-card--danger">
              <div className="metric-value">{health.openAlerts}</div>
              <p>Alertas abiertas</p>
            </article>
            <article className="metric-card metric-card--warning">
              <div className="metric-value">{health.openSupportCases}</div>
              <p>Incidencias abiertas</p>
            </article>
          </div>
          <p className="muted">
            Comprobado {formatDate(health.checkedAt)}. No se exponen secretos ni
            credenciales.
          </p>
        </>
      )}
    </>
  );
}

function OperationalViews({
  onToast,
  organizations,
  token,
}: {
  readonly onToast: (message: string) => void;
  readonly organizations: readonly PlatformOrganization[];
  readonly token: string;
}) {
  const [domain, setDomain] = useState<PlatformOperationalDomain>('bookings');
  const [organizationId, setOrganizationId] = useState('');
  const [records, setRecords] = useState<readonly PlatformOperationalRecord[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const domains: ReadonlyArray<{
    id: PlatformOperationalDomain;
    label: string;
  }> = [
    { id: 'bookings', label: 'Reservas' },
    { id: 'orders', label: 'Pedidos' },
    { id: 'cash-health', label: 'Caja' },
    { id: 'commissions-health', label: 'Comisiones' },
    { id: 'inventory-health', label: 'Inventario' },
    { id: 'payphone-health', label: 'PayPhone' },
  ];
  useEffect(() => {
    let active = true;
    void getPlatformOperationalRecords(
      token,
      domain,
      organizationId || undefined,
    )
      .then((result) => {
        if (active) setRecords(result);
      })
      .catch((error: unknown) => {
        if (active)
          onToast(
            error instanceof Error
              ? error.message
              : 'No fue posible cargar la operación.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [domain, onToast, organizationId, token]);
  return (
    <>
      <Heading
        description="Visibilidad de soporte sin datos de clientes ni capacidad de alterar finanzas."
        title="Operación de negocios"
      />
      <div className="operation-tabs">
        {domains.map((item) => (
          <button
            className={
              domain === item.id
                ? 'button button--primary'
                : 'button button--ghost'
            }
            key={item.id}
            onClick={() => {
              setLoading(true);
              setDomain(item.id);
            }}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="filters single-filter">
        <label>
          <span>Organización</span>
          <select
            onChange={(event) => {
              setLoading(true);
              setOrganizationId(event.target.value);
            }}
            value={organizationId}
          >
            <option value="">Todas las organizaciones</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="table-card">
        {loading ? (
          <div className="panel-loader">Cargando operación…</div>
        ) : records.length === 0 ? (
          <Empty>No hay registros para este filtro.</Empty>
        ) : (
          records.map((record) => (
            <article className="event-row" key={record.id}>
              <span
                className={`event-icon${record.status === 'low_stock' || record.status === 'error' ? 'event-icon--danger' : ''}`}
              >
                •
              </span>
              <div className="event-main">
                <strong>{record.title}</strong>
                <span>{record.organization?.name ?? 'Sin organización'}</span>
                <small>{record.detail}</small>
              </div>
              <div className="event-meta">
                <span className="channel-badge">
                  {titleCase(record.status)}
                </span>
                {record.amountCents !== null ? (
                  <strong>
                    {new Intl.NumberFormat('es-EC', {
                      currency: 'USD',
                      style: 'currency',
                    }).format(record.amountCents / 100)}
                  </strong>
                ) : null}
                <time>{formatDate(record.timestamp)}</time>
              </div>
            </article>
          ))
        )}
      </section>
    </>
  );
}

function PrivacyView({
  busy,
  organizations,
  requests,
  onCreate,
  onStatus,
}: {
  readonly busy: boolean;
  readonly organizations: readonly PlatformOrganization[];
  readonly requests: readonly PlatformPrivacyRequest[];
  readonly onCreate: (input: {
    dueAt?: string;
    organizationId: string;
    reason: string;
    type: string;
  }) => Promise<void>;
  readonly onStatus: (
    request: PlatformPrivacyRequest,
    status: string,
  ) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.id ?? '',
  );
  const [type, setType] = useState('data_export');
  const [reason, setReason] = useState('');
  const [dueAt, setDueAt] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate({
      ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
      organizationId,
      reason,
      type,
    });
    setCreating(false);
    setReason('');
    setDueAt('');
  }
  return (
    <>
      <Heading
        description="Solicitudes de acceso o eliminación con responsable, vencimiento y resolución auditada."
        title="Privacidad y derechos de datos"
      />
      <div className="toolbar-row">
        <button
          className="button button--primary"
          onClick={() => setCreating((value) => !value)}
          type="button"
        >
          {creating ? 'Cancelar' : 'Nueva solicitud'}
        </button>
      </div>
      {creating ? (
        <form
          className="content-card compact-form"
          onSubmit={(event) => void submit(event)}
        >
          <label>
            Organización
            <select
              onChange={(event) => setOrganizationId(event.target.value)}
              required
              value={organizationId}
            >
              <option value="">Selecciona…</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Derecho solicitado
            <select
              onChange={(event) => setType(event.target.value)}
              value={type}
            >
              <option value="data_export">Acceso / exportación</option>
              <option value="deletion">Eliminación</option>
            </select>
          </label>
          <label>
            Fecha límite
            <input
              onChange={(event) => setDueAt(event.target.value)}
              type="datetime-local"
              value={dueAt}
            />
          </label>
          <label className="form-span">
            Motivo y alcance
            <textarea
              maxLength={1000}
              minLength={10}
              onChange={(event) => setReason(event.target.value)}
              required
              rows={3}
              value={reason}
            />
          </label>
          <button
            className="button button--primary"
            disabled={busy || !organizationId}
            type="submit"
          >
            Registrar solicitud
          </button>
        </form>
      ) : null}
      <section className="table-card">
        {requests.length === 0 ? (
          <Empty>No hay solicitudes de privacidad.</Empty>
        ) : (
          requests.map((privacyRequest) => (
            <article className="event-row" key={privacyRequest.id}>
              <span className="event-icon">§</span>
              <div className="event-main">
                <strong>{titleCase(privacyRequest.type)}</strong>
                <span>
                  {privacyRequest.organization?.name ?? 'Sin organización'} ·{' '}
                  {privacyRequest.subject?.email ?? 'solicitud organizacional'}
                </span>
                <small>{privacyRequest.reason}</small>
                {privacyRequest.resolutionNote ? (
                  <small>Resolución: {privacyRequest.resolutionNote}</small>
                ) : null}
              </div>
              <div className="event-meta">
                <span className="channel-badge">
                  {titleCase(privacyRequest.status)}
                </span>
                <span>
                  Responsable:{' '}
                  {privacyRequest.assignedTo?.fullName ?? 'sin asignar'}
                </span>
                <time>Vence {formatDate(privacyRequest.dueAt)}</time>
                {!['completed', 'rejected'].includes(privacyRequest.status) ? (
                  <button
                    className="button button--secondary"
                    disabled={busy}
                    onClick={() =>
                      void onStatus(
                        privacyRequest,
                        privacyRequest.status === 'open'
                          ? 'in_progress'
                          : 'completed',
                      )
                    }
                    type="button"
                  >
                    {privacyRequest.status === 'open' ? 'Tomar' : 'Completar'}
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

function OverridesView({
  busy,
  organizations,
  overrides,
  onCreate,
  onRevoke,
}: {
  readonly busy: boolean;
  readonly organizations: readonly PlatformOrganization[];
  readonly overrides: readonly PlatformFeatureOverride[];
  readonly onCreate: (input: PlatformOverrideInput) => Promise<void>;
  readonly onRevoke: (override: PlatformFeatureOverride) => Promise<void>;
}) {
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.id ?? '',
  );
  const [kind, setKind] = useState<'feature' | 'limit'>('feature');
  const [key, setKey] = useState('inventory');
  const [value, setValue] = useState('true');
  const [expiresAt, setExpiresAt] = useState('');
  const [reason, setReason] = useState('');
  const featureKeys = [
    'commissions',
    'inventory',
    'multiLocation',
    'publicBooking',
    'reports',
    'team',
    'wallet',
  ];
  const limitKeys = [
    'clients',
    'locations',
    'rolling30DayBookings',
    'teamMembers',
  ];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const common = {
      expiresAt: new Date(expiresAt).toISOString(),
      key,
      organizationId,
      reason,
    };
    if (kind === 'feature') {
      await onCreate({ ...common, booleanValue: value === 'true', kind });
    } else {
      await onCreate({
        ...common,
        integerValue: value.trim() === '' ? null : Number(value),
        kind,
      });
    }
    setReason('');
  }
  return (
    <>
      <Heading
        description="Excepciones temporales a planes; vencen automáticamente y cada cambio queda auditado."
        title="Límites y funcionalidades temporales"
      />
      <form
        className="content-card compact-form"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          Organización
          <select
            onChange={(event) => setOrganizationId(event.target.value)}
            required
            value={organizationId}
          >
            <option value="">Selecciona…</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select
            onChange={(event) => {
              const nextKind = event.target.value as 'feature' | 'limit';
              setKind(nextKind);
              setKey(nextKind === 'feature' ? 'inventory' : 'clients');
              setValue(nextKind === 'feature' ? 'true' : '');
            }}
            value={kind}
          >
            <option value="feature">Funcionalidad</option>
            <option value="limit">Límite</option>
          </select>
        </label>
        <label>
          Clave
          <select onChange={(event) => setKey(event.target.value)} value={key}>
            {(kind === 'feature' ? featureKeys : limitKeys).map((item) => (
              <option key={item} value={item}>
                {titleCase(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor
          {kind === 'feature' ? (
            <select
              onChange={(event) => setValue(event.target.value)}
              value={value}
            >
              <option value="true">Habilitado</option>
              <option value="false">Deshabilitado</option>
            </select>
          ) : (
            <input
              min={0}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Vacío = ilimitado"
              required={key === 'locations'}
              type="number"
              value={value}
            />
          )}
        </label>
        <label>
          Vence
          <input
            onChange={(event) => setExpiresAt(event.target.value)}
            required
            type="datetime-local"
            value={expiresAt}
          />
        </label>
        <label className="form-span">
          Motivo
          <textarea
            maxLength={500}
            minLength={10}
            onChange={(event) => setReason(event.target.value)}
            required
            rows={2}
            value={reason}
          />
        </label>
        <button
          className="button button--primary"
          disabled={busy || !organizationId || !expiresAt}
          type="submit"
        >
          Aplicar excepción
        </button>
      </form>
      <section className="table-card">
        {overrides.length === 0 ? (
          <Empty>No hay excepciones registradas.</Empty>
        ) : (
          overrides.map((override) => {
            const active =
              !override.revokedAt && new Date(override.expiresAt) > new Date();
            return (
              <article className="event-row" key={override.id}>
                <span className="event-icon">±</span>
                <div className="event-main">
                  <strong>{titleCase(override.key)}</strong>
                  <span>{override.organization.name}</span>
                  <small>{override.reason}</small>
                </div>
                <div className="event-meta">
                  <span className="channel-badge">
                    {active
                      ? 'Activa'
                      : override.revokedAt
                        ? 'Revocada'
                        : 'Vencida'}
                  </span>
                  <strong>
                    {override.kind === 'feature'
                      ? override.booleanValue
                        ? 'Habilitado'
                        : 'Deshabilitado'
                      : (override.integerValue ?? 'Ilimitado')}
                  </strong>
                  <time>Vence {formatDate(override.expiresAt)}</time>
                  {active ? (
                    <button
                      className="button button--secondary"
                      disabled={busy}
                      onClick={() => void onRevoke(override)}
                      type="button"
                    >
                      Revocar
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </section>
    </>
  );
}

function ContentView({
  abandonedAfterHours,
  busy,
  pendingRegistrations,
  profiles,
  reviews,
  summary,
  onResendVerification,
  onReviewVisibility,
}: {
  readonly abandonedAfterHours: number;
  readonly busy: boolean;
  readonly pendingRegistrations: PlatformOnboardingResult['pendingRegistrations'];
  readonly profiles: readonly PlatformOnboardingProfile[];
  readonly reviews: readonly PlatformReview[];
  readonly summary: PlatformOnboardingResult['summary'];
  readonly onResendVerification: (
    registration: PlatformOnboardingResult['pendingRegistrations'][number],
  ) => Promise<void>;
  readonly onReviewVisibility: (review: PlatformReview) => Promise<void>;
}) {
  const [tab, setTab] = useState<'onboarding' | 'reviews'>('onboarding');
  return (
    <>
      <Heading
        description="Seguimiento de activación y moderación de contenido con identidad personal minimizada."
        title="Onboarding y reseñas"
      />
      <div className="operation-tabs">
        <button
          className={
            tab === 'onboarding'
              ? 'button button--primary'
              : 'button button--ghost'
          }
          onClick={() => setTab('onboarding')}
          type="button"
        >
          Onboarding
        </button>
        <button
          className={
            tab === 'reviews'
              ? 'button button--primary'
              : 'button button--ghost'
          }
          onClick={() => setTab('reviews')}
          type="button"
        >
          Reseñas
        </button>
      </div>
      <section className="table-card">
        {tab === 'onboarding' ? (
          profiles.length === 0 && pendingRegistrations.length === 0 ? (
            <Empty>No hay perfiles de onboarding.</Empty>
          ) : (
            <>
              <div className="diagnostics-grid">
                <div>
                  <strong>{summary.completed}</strong>
                  <span>Completados</span>
                </div>
                <div>
                  <strong>{summary.pending}</strong>
                  <span>Pendientes</span>
                </div>
                <div>
                  <strong>{summary.abandoned}</strong>
                  <span>Abandonados +{abandonedAfterHours} h</span>
                </div>
                <div>
                  <strong>{summary.pendingVerification}</strong>
                  <span>Sin verificar</span>
                </div>
              </div>
              {pendingRegistrations.map((registration) => (
                <article className="event-row" key={registration.id}>
                  <span className="event-icon">!</span>
                  <div className="event-main">
                    <strong>Registro pendiente de verificación</strong>
                    <span>{registration.email}</span>
                    <small>
                      {registration.failedAttempts} intentos fallidos
                    </small>
                  </div>
                  <div className="event-meta">
                    <span className="channel-badge">
                      {registration.locked
                        ? 'Bloqueado'
                        : registration.expired
                          ? 'Expirado'
                          : registration.abandoned
                            ? 'Abandonado'
                            : 'En curso'}
                    </span>
                    <time>{formatDate(registration.createdAt)}</time>
                    <button
                      className="button button--ghost"
                      disabled={busy || registration.locked}
                      onClick={() => void onResendVerification(registration)}
                      type="button"
                    >
                      Reenviar código
                    </button>
                  </div>
                </article>
              ))}
              {profiles.map((profile) => (
                <article className="event-row" key={profile.userId}>
                  <span className="event-icon">✓</span>
                  <div className="event-main">
                    <strong>{profile.businessName}</strong>
                    <span>
                      {profile.organization?.name ?? 'Sin organización'} ·{' '}
                      {profile.owner.email}
                    </span>
                    <small>
                      Progreso {profile.progressPercent}% · etapas:{' '}
                      {Object.entries(profile.stages)
                        .filter(([, completed]) => completed)
                        .map(([stage]) => titleCase(stage))
                        .join(', ')}
                    </small>
                    <small>
                      {profile.services} servicios · {profile.collaborators}{' '}
                      colaboradores · {profile.appointments} citas
                    </small>
                  </div>
                  <div className="event-meta">
                    <span className="channel-badge">
                      {profile.completedAt
                        ? 'Completado'
                        : profile.abandoned
                          ? 'Abandonado'
                          : 'Pendiente'}
                    </span>
                    <time>{formatDate(profile.updatedAt)}</time>
                  </div>
                </article>
              ))}
            </>
          )
        ) : reviews.length === 0 ? (
          <Empty>No hay reseñas.</Empty>
        ) : (
          reviews.map((review) => (
            <article className="event-row" key={review.id}>
              <span className="event-icon">★</span>
              <div className="event-main">
                <strong>
                  {review.rating}/5 · {review.client}
                </strong>
                <span>
                  {review.organization.name} · {review.location.name}
                </span>
                <small>{review.comment ?? 'Sin comentario'}</small>
              </div>
              <div className="event-meta">
                <span className="channel-badge">
                  {review.isVisible ? 'Visible' : 'Oculta'}
                </span>
                <time>{formatDate(review.createdAt)}</time>
                <button
                  className="button button--secondary"
                  disabled={busy}
                  onClick={() => void onReviewVisibility(review)}
                  type="button"
                >
                  {review.isVisible ? 'Ocultar' : 'Restaurar'}
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </>
  );
}

function ConfigurationView({
  busy,
  configurations,
  onCreate,
  onPublish,
  onRollback,
}: {
  readonly busy: boolean;
  readonly configurations: readonly PlatformConfigurationVersion[];
  readonly onCreate: (input: {
    key: string;
    reason: string;
    value: Readonly<Record<string, number>>;
  }) => Promise<void>;
  readonly onPublish: (
    configuration: PlatformConfigurationVersion,
  ) => Promise<void>;
  readonly onRollback: (
    configuration: PlatformConfigurationVersion,
  ) => Promise<void>;
}) {
  const [key, setKey] = useState('support.default_sla_hours');
  const [value, setValue] = useState('24');
  const [reason, setReason] = useState('');
  const keys = [
    'support.default_sla_hours',
    'onboarding.abandoned_hours',
    'alerts.cash_open_hours',
    'exports.retention_days',
  ];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate({
      key,
      reason,
      value:
        key === 'exports.retention_days'
          ? { days: Number(value) }
          : { hours: Number(value) },
    });
    setReason('');
  }
  return (
    <>
      <Heading
        description="Borradores versionados, aprobación por un segundo operador y rollback auditable."
        title="Configuración global"
      />
      <form
        className="content-card compact-form"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          Política
          <select onChange={(event) => setKey(event.target.value)} value={key}>
            {keys.map((item) => (
              <option key={item} value={item}>
                {titleCase(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor ({key === 'exports.retention_days' ? 'días' : 'horas'})
          <input
            min={1}
            onChange={(event) => setValue(event.target.value)}
            required
            type="number"
            value={value}
          />
        </label>
        <label className="form-span">
          Motivo del borrador
          <textarea
            maxLength={500}
            minLength={10}
            onChange={(event) => setReason(event.target.value)}
            required
            rows={2}
            value={reason}
          />
        </label>
        <button
          className="button button--primary"
          disabled={busy}
          type="submit"
        >
          Crear borrador
        </button>
      </form>
      <section className="table-card">
        {configurations.length === 0 ? (
          <Empty>No hay versiones de configuración.</Empty>
        ) : (
          configurations.map((configuration) => (
            <article className="event-row" key={configuration.id}>
              <span className="event-icon">v{configuration.version}</span>
              <div className="event-main">
                <strong>{titleCase(configuration.key)}</strong>
                <span>Valor: {JSON.stringify(configuration.value)}</span>
                <small>{configuration.reason}</small>
                <small>Creada por {configuration.createdBy}</small>
              </div>
              <div className="event-meta">
                <span className="channel-badge">
                  {titleCase(configuration.status)}
                </span>
                {configuration.approvedBy ? (
                  <span>Aprobó {configuration.approvedBy}</span>
                ) : null}
                <time>
                  {formatDate(
                    configuration.publishedAt ?? configuration.createdAt,
                  )}
                </time>
                {configuration.status === 'draft' ? (
                  <button
                    className="button button--secondary"
                    disabled={busy}
                    onClick={() => void onPublish(configuration)}
                    type="button"
                  >
                    Aprobar y publicar
                  </button>
                ) : configuration.status === 'archived' ? (
                  <button
                    className="button button--secondary"
                    disabled={busy}
                    onClick={() => void onRollback(configuration)}
                    type="button"
                  >
                    Restaurar versión
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

export function PlatformOperations({
  currentOperatorId,
  currentRole,
  organizations,
  token,
  view,
  onToast,
}: {
  readonly currentOperatorId: string;
  readonly currentRole: string;
  readonly organizations: readonly PlatformOrganization[];
  readonly token: string;
  readonly view: OperationsView;
  readonly onToast: (message: string) => void;
}) {
  const [alerts, setAlerts] = useState<readonly PlatformAlert[]>([]);
  const [cases, setCases] = useState<readonly PlatformSupportCase[]>([]);
  const [caseOperators, setCaseOperators] = useState<
    readonly { readonly fullName: string; readonly id: string }[]
  >([]);
  const [caseSummary, setCaseSummary] = useState({ breached: 0, open: 0 });
  const [operators, setOperators] = useState<readonly PlatformOperatorRecord[]>(
    [],
  );
  const [sessions, setSessions] = useState<readonly PlatformSession[]>([]);
  const [health, setHealth] = useState<PlatformSystemHealth | null>(null);
  const [privacyRequests, setPrivacyRequests] = useState<
    readonly PlatformPrivacyRequest[]
  >([]);
  const [overrides, setOverrides] = useState<
    readonly PlatformFeatureOverride[]
  >([]);
  const [profiles, setProfiles] = useState<
    readonly PlatformOnboardingProfile[]
  >([]);
  const [onboardingSummary, setOnboardingSummary] = useState<
    PlatformOnboardingResult['summary']
  >({ abandoned: 0, completed: 0, pending: 0, pendingVerification: 0 });
  const [pendingRegistrations, setPendingRegistrations] = useState<
    PlatformOnboardingResult['pendingRegistrations']
  >([]);
  const [abandonedAfterHours, setAbandonedAfterHours] = useState(24);
  const [reviews, setReviews] = useState<readonly PlatformReview[]>([]);
  const [configurations, setConfigurations] = useState<
    readonly PlatformConfigurationVersion[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (view === 'operations') return;
    let active = true;
    const load =
      view === 'alerts'
        ? getPlatformAlerts(token).then(
            (result) => active && setAlerts(result.alerts),
          )
        : view === 'cases'
          ? getSupportCases(token).then((result) => {
              if (active) {
                setCases(result.cases);
                setCaseOperators(result.operators);
                setCaseSummary(result.summary);
              }
            })
          : view === 'privacy'
            ? getPrivacyRequests(token).then(
                (result) => active && setPrivacyRequests(result.requests),
              )
            : view === 'overrides'
              ? getPlatformOverrides(token).then(
                  (result) => active && setOverrides(result.overrides),
                )
              : view === 'content'
                ? Promise.all([
                    getOnboardingProfiles(token),
                    getPlatformReviews(token),
                  ]).then(([profileResult, reviewResult]) => {
                    if (active) {
                      setProfiles(profileResult.profiles);
                      setOnboardingSummary(profileResult.summary);
                      setPendingRegistrations(
                        profileResult.pendingRegistrations,
                      );
                      setAbandonedAfterHours(profileResult.abandonedAfterHours);
                      setReviews(reviewResult.reviews);
                    }
                  })
                : view === 'configuration'
                  ? getPlatformConfigurations(token).then(
                      (result) =>
                        active && setConfigurations(result.configurations),
                    )
                  : view === 'security'
                    ? Promise.all([
                        getPlatformOperators(token),
                        getPlatformSessions(token),
                      ]).then(([operatorResult, sessionResult]) => {
                        if (active) {
                          setOperators(operatorResult.operators);
                          setSessions(sessionResult.sessions);
                        }
                      })
                    : getSystemHealth(token).then(
                        (result) => active && setHealth(result),
                      );
    void load.catch((error: unknown) => {
      if (active)
        onToast(
          error instanceof Error
            ? error.message
            : 'No fue posible cargar esta sección.',
        );
    });
    return () => {
      active = false;
    };
  }, [onToast, reload, token, view]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      onToast(success);
      setReload((value) => value + 1);
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : 'No fue posible completar la operación.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (view === 'alerts')
    return (
      <AlertsView
        alerts={alerts}
        busy={busy}
        canManage={
          currentRole === 'super_admin' || currentRole === 'operations'
        }
        onAction={async (alert, status) => {
          const note = window.prompt(
            'Motivo de la acción (mínimo 5 caracteres):',
          );
          if (note)
            await run(
              () => updatePlatformAlert(token, alert.id, { note, status }),
              'Alerta actualizada y auditada.',
            );
        }}
      />
    );
  if (view === 'cases')
    return (
      <CasesView
        busy={busy}
        cases={cases}
        operators={caseOperators}
        organizations={organizations}
        onCreate={(input) =>
          run(
            () => createSupportCase(token, input),
            'Incidencia creada.',
          ) as Promise<void>
        }
        onStatus={async (supportCase, status) => {
          const note = window.prompt(
            'Añade una nota para la bitácora (mínimo 3 caracteres):',
          );
          if (note)
            await run(
              () => updateSupportCase(token, supportCase.id, { note, status }),
              'Incidencia actualizada.',
            );
        }}
        onUpdate={async (supportCase, input) => {
          const note = window.prompt(
            'Motivo del cambio de responsable/SLA (mínimo 3 caracteres):',
          );
          if (note)
            await run(
              () =>
                updateSupportCase(token, supportCase.id, { ...input, note }),
              'Gestión de la incidencia actualizada.',
            );
        }}
        summary={caseSummary}
      />
    );
  if (view === 'security')
    return (
      <SecurityView
        busy={busy}
        currentOperatorId={currentOperatorId}
        onRevoke={(session) =>
          run(
            () => revokePlatformSession(token, session.id),
            'Sesión revocada.',
          ) as Promise<void>
        }
        onSave={(email, selectedRole) =>
          run(
            () =>
              savePlatformOperator(token, {
                email,
                isActive: true,
                role: selectedRole,
              }),
            'Operador guardado.',
          ) as Promise<void>
        }
        onToggle={(selectedOperator) =>
          run(
            () =>
              updatePlatformOperator(token, selectedOperator.id, {
                isActive: !selectedOperator.isActive,
                role: selectedOperator.role,
              }),
            'Acceso del operador actualizado.',
          ) as Promise<void>
        }
        operators={operators}
        sessions={sessions}
      />
    );
  if (view === 'privacy')
    return (
      <PrivacyView
        busy={busy}
        onCreate={(input) =>
          run(
            () => createPrivacyRequest(token, input),
            'Solicitud de privacidad registrada.',
          ) as Promise<void>
        }
        onStatus={async (privacyRequest, status) => {
          const resolutionNote = window.prompt(
            'Nota de gestión o resolución (mínimo 5 caracteres):',
          );
          if (resolutionNote)
            await run(
              () =>
                updatePrivacyRequest(token, privacyRequest.id, {
                  resolutionNote,
                  status,
                }),
              'Solicitud de privacidad actualizada.',
            );
        }}
        organizations={organizations}
        requests={privacyRequests}
      />
    );
  if (view === 'overrides')
    return (
      <OverridesView
        busy={busy}
        onCreate={(input) =>
          run(
            () => createPlatformOverride(token, input),
            'Excepción temporal aplicada.',
          ) as Promise<void>
        }
        onRevoke={async (override) => {
          const reason = window.prompt(
            'Motivo de la revocación (mínimo 10 caracteres):',
          );
          if (reason)
            await run(
              () => revokePlatformOverride(token, override.id, reason),
              'Excepción revocada.',
            );
        }}
        organizations={organizations}
        overrides={overrides}
      />
    );
  if (view === 'content')
    return (
      <ContentView
        abandonedAfterHours={abandonedAfterHours}
        busy={busy}
        onResendVerification={async (registration) => {
          const reason = window.prompt(
            'Motivo del reenvío de verificación (mínimo 10 caracteres):',
          );
          if (reason)
            await run(
              () => resendPendingVerification(token, registration.id, reason),
              'Código de verificación reenviado.',
            );
        }}
        onReviewVisibility={async (review) => {
          const reason = window.prompt(
            `Motivo para ${review.isVisible ? 'ocultar' : 'restaurar'} la reseña (mínimo 10 caracteres):`,
          );
          if (reason)
            await run(
              () =>
                updatePlatformReviewVisibility(token, review.id, {
                  isVisible: !review.isVisible,
                  reason,
                }),
              'Visibilidad de la reseña actualizada.',
            );
        }}
        pendingRegistrations={pendingRegistrations}
        profiles={profiles}
        reviews={reviews}
        summary={onboardingSummary}
      />
    );
  if (view === 'configuration')
    return (
      <ConfigurationView
        busy={busy}
        configurations={configurations}
        onCreate={(input) =>
          run(
            () => createPlatformConfiguration(token, input),
            'Borrador de configuración creado.',
          ) as Promise<void>
        }
        onPublish={async (configuration) => {
          const reason = window.prompt(
            'Motivo de aprobación (mínimo 10 caracteres):',
          );
          if (reason)
            await run(
              () =>
                publishPlatformConfiguration(token, configuration.id, reason),
              'Configuración publicada.',
            );
        }}
        onRollback={async (configuration) => {
          const reason = window.prompt(
            'Motivo del rollback (mínimo 10 caracteres):',
          );
          if (reason)
            await run(
              () =>
                rollbackPlatformConfiguration(token, configuration.id, reason),
              'Versión restaurada y publicada.',
            );
        }}
      />
    );
  if (view === 'operations') {
    return (
      <OperationalViews
        onToast={onToast}
        organizations={organizations}
        token={token}
      />
    );
  }
  return <HealthView health={health} />;
}

export function OrganizationDetailModal({
  allowExtendTrial,
  onClose,
  onMutated,
  onOpenUser,
  organization,
  token,
}: {
  readonly allowExtendTrial: boolean;
  readonly onClose: () => void;
  readonly onMutated: () => void;
  readonly onOpenUser: (userId: string) => void;
  readonly organization: Pick<PlatformOrganization, 'id' | 'name'>;
  readonly token: string;
}) {
  const [detail, setDetail] = useState<PlatformOrganizationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void getOrganizationDetail(token, organization.id)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'No fue posible cargar la ficha.',
          );
      });
    return () => {
      active = false;
    };
  }, [organization.id, token]);
  async function extendTrial() {
    const rawDays = window.prompt('Días adicionales de trial (1 a 90):', '7');
    if (!rawDays) return;
    const days = Number(rawDays);
    const reason = window.prompt(
      'Motivo de la extensión (mínimo 10 caracteres):',
    );
    if (!Number.isInteger(days) || days < 1 || days > 90 || !reason) return;
    setBusy(true);
    try {
      await updateOrganization(token, organization.id, {
        action: 'extend_trial',
        days,
        reason,
      });
      onMutated();
      setDetail(await getOrganizationDetail(token, organization.id));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No fue posible extender el trial.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function reduceTrial() {
    const rawDays = window.prompt('Días a reducir del trial (1 a 90):', '1');
    if (!rawDays) return;
    const days = Number(rawDays);
    const reason = window.prompt(
      'Motivo de la reducción (mínimo 10 caracteres):',
    );
    if (!Number.isInteger(days) || days < 1 || days > 90 || !reason) return;
    setBusy(true);
    try {
      await updateOrganization(token, organization.id, {
        action: 'reduce_trial',
        days,
        reason,
      });
      onMutated();
      setDetail(await getOrganizationDetail(token, organization.id));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No fue posible reducir el trial.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function addCommercialNote() {
    const note = window.prompt('Nota comercial (mínimo 5 caracteres):');
    if (!note) return;
    setBusy(true);
    try {
      await createOrganizationNote(token, organization.id, {
        category: 'commercial',
        note,
      });
      onMutated();
      setDetail(await getOrganizationDetail(token, organization.id));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No fue posible guardar la nota.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div aria-modal="true" className="modal-backdrop" role="dialog">
      <div className="modal-card modal-card--wide organization-detail-modal">
        <button
          aria-label="Cerrar"
          className="modal-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <span className="card-kicker">Ficha 360°</span>
        <h2>{organization.name}</h2>
        {error ? <div className="form-error">{error}</div> : null}
        {!detail ? (
          <div className="panel-loader">Cargando salud operativa…</div>
        ) : (
          <>
            <div className="diagnostics-grid">
              <div>
                <strong>{detail.health.openCashRegisters}</strong>
                <span>Cajas abiertas</span>
              </div>
              <div>
                <strong>{detail.health.lowStockItems}</strong>
                <span>Stock crítico</span>
              </div>
              <div>
                <strong>{detail.health.notificationFailures}</strong>
                <span>Fallos de entrega</span>
              </div>
              <div>
                <strong>{detail.health.pendingCommissionSettlements}</strong>
                <span>Liquidaciones pendientes</span>
              </div>
              <div>
                <strong>{detail.health.openSupportCases}</strong>
                <span>Incidencias</span>
              </div>
              <div>
                <strong>
                  {Object.values(detail.activity.appointmentsLast30Days).reduce(
                    (sum, value) => sum + value,
                    0,
                  )}
                </strong>
                <span>Citas en 30 días</span>
              </div>
            </div>
            <div className="overview-grid">
              <section className="content-card">
                <span className="card-kicker">Suscripción</span>
                <h3>
                  {titleCase(detail.subscription.plan)} ·{' '}
                  {titleCase(detail.subscription.status)}
                </h3>
                <p>Trial: {formatDate(detail.subscription.trialEndsAt)}</p>
                <p>
                  Periodo: {formatDate(detail.subscription.currentPeriodStart)}{' '}
                  → {formatDate(detail.subscription.currentPeriodEnd)}
                </p>
                <div className="usage-list">
                  {Object.entries(detail.subscription.usage).map(
                    ([key, value]) => (
                      <span key={key}>
                        <b>{titleCase(key)}</b>
                        <strong>
                          {value} / {detail.subscription.limits[key] ?? '∞'}
                        </strong>
                      </span>
                    ),
                  )}
                </div>
                {allowExtendTrial ? (
                  <div className="toolbar-row">
                    <button
                      className="button button--secondary"
                      disabled={busy}
                      onClick={() => void extendTrial()}
                      type="button"
                    >
                      Extender trial
                    </button>
                    <button
                      className="button button--secondary"
                      disabled={busy || detail.subscription.status !== 'trial'}
                      onClick={() => void reduceTrial()}
                      type="button"
                    >
                      Reducir trial
                    </button>
                  </div>
                ) : null}
              </section>
              <section className="content-card">
                <span className="card-kicker">Negocio</span>
                {detail.organization.owner ? (
                  <button
                    className="button button--ghost"
                    onClick={() => onOpenUser(detail.organization.owner!.id)}
                    type="button"
                  >
                    {detail.organization.owner.fullName}
                  </button>
                ) : (
                  <h3>Sin propietario</h3>
                )}
                <p>{detail.organization.owner?.email ?? '—'}</p>
                <p>
                  {detail.organization.defaultTimezone} ·{' '}
                  {detail.organization.currencyCode}
                </p>
                <p>
                  {detail.organization.locations.length} sucursales (
                  {
                    detail.organization.locations.filter(
                      (location) => location.isActive,
                    ).length
                  }{' '}
                  activas)
                </p>
                <p>
                  PayPhone:{' '}
                  {detail.payphone
                    ? titleCase(detail.payphone.connectionStatus)
                    : 'No configurado'}
                </p>
              </section>
            </div>
            {allowExtendTrial ? (
              <section className="content-card">
                <div className="card-heading">
                  <div>
                    <span className="card-kicker">Gestión comercial</span>
                    <h3>Notas internas</h3>
                  </div>
                  <button
                    className="button button--secondary"
                    disabled={busy}
                    onClick={() => void addCommercialNote()}
                    type="button"
                  >
                    Añadir nota
                  </button>
                </div>
                {detail.notes.length === 0 ? (
                  <p className="muted">Sin notas comerciales.</p>
                ) : (
                  detail.notes.map((note) => (
                    <div className="status-summary-row" key={note.id}>
                      <span>{note.note}</span>
                      <small>
                        {note.createdBy} · {formatDate(note.createdAt)}
                      </small>
                    </div>
                  ))
                )}
              </section>
            ) : null}
            <section className="content-card">
              <span className="card-kicker">Actividad reciente</span>
              {detail.activity.recentAudit.length === 0 ? (
                <p className="muted">Sin eventos recientes.</p>
              ) : (
                detail.activity.recentAudit.slice(0, 8).map((event) => (
                  <div className="status-summary-row" key={event.id}>
                    <span>{titleCase(event.action)}</span>
                    <small>
                      {event.actor ?? 'Sistema'} · {formatDate(event.createdAt)}
                    </small>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
