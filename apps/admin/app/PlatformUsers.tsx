'use client';

import { useEffect, useState, type FormEvent } from 'react';

import {
  getPlatformUserDetail,
  getPlatformUsers,
  updatePlatformMembership,
  updatePlatformUser,
  type PlatformUser,
  type PlatformUserAction,
  type PlatformUserDetail,
  type PlatformUserList,
} from './platform-api';

type MembershipAction = {
  readonly id: string;
  readonly organizationName: string;
  readonly type: 'change_role' | 'reactivate' | 'suspend';
};

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

function UserDetail({
  detail,
  canManage,
  onClose,
  onMutated,
  onOpenOrganization,
  token,
}: {
  readonly detail: PlatformUserDetail;
  readonly canManage: boolean;
  readonly onClose: () => void;
  readonly onMutated: () => void;
  readonly onOpenOrganization: (organization: {
    readonly id: string;
    readonly name: string;
  }) => void;
  readonly token: string;
}) {
  const [action, setAction] = useState<PlatformUserAction['action'] | null>(
    null,
  );
  const [reason, setReason] = useState('');
  const [membershipAction, setMembershipAction] =
    useState<MembershipAction | null>(null);
  const [membershipRole, setMembershipRole] = useState<
    'barber' | 'manager' | 'receptionist'
  >('barber');
  const [busy, setBusy] = useState(false);
  const user = detail.user;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    setBusy(true);
    try {
      await updatePlatformUser(token, user.account.id, { action, reason });
      setAction(null);
      setReason('');
      onMutated();
    } finally {
      setBusy(false);
    }
  }

  async function submitMembership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!membershipAction) return;
    setBusy(true);
    try {
      await updatePlatformMembership(
        token,
        membershipAction.id,
        membershipAction.type === 'change_role'
          ? { action: 'change_role', reason, role: membershipRole }
          : { action: membershipAction.type, reason },
      );
      setMembershipAction(null);
      setReason('');
      onMutated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content-card" aria-label="Ficha de usuario">
      <div className="toolbar-row">
        <div>
          <span className="card-kicker">Ficha 360°</span>
          <h2>{user.account.name}</h2>
          <small>{user.account.id}</small>
        </div>
        <button
          className="button button--ghost"
          onClick={onClose}
          type="button"
        >
          Cerrar ficha
        </button>
      </div>
      <div className="detail-grid">
        <div>
          <small>Estado</small>
          <strong>{titleCase(user.status)}</strong>
        </div>
        <div>
          <small>Correo</small>
          <strong>{user.account.email}</strong>
        </div>
        <div>
          <small>Teléfono</small>
          <strong>{user.account.phone ?? '—'}</strong>
        </div>
        <div>
          <small>Verificación</small>
          <strong>
            {user.account.emailVerified ? 'Verificado' : 'Pendiente'}
          </strong>
        </div>
        <div>
          <small>Registro</small>
          <strong>{formatDate(user.account.createdAt)}</strong>
        </div>
        <div>
          <small>Último acceso</small>
          <strong>{formatDate(user.security.lastAccessAt)}</strong>
        </div>
      </div>

      <h3>Organizaciones y roles</h3>
      {user.memberships.length === 0 ? (
        <p className="muted-copy">No tiene memberships asociados.</p>
      ) : (
        <div className="table-card">
          {user.memberships.map((membership) => (
            <article className="event-row" key={membership.id}>
              <div className="event-main">
                <strong>{membership.organization.name}</strong>
                <small>{membership.organization.id}</small>
              </div>
              <div className="event-meta">
                <span className="channel-badge">
                  {titleCase(membership.role)}
                </span>
                <span className="channel-badge">
                  {titleCase(membership.status)}
                </span>
                <button
                  className="button button--ghost"
                  onClick={() => onOpenOrganization(membership.organization)}
                  type="button"
                >
                  Ver organización
                </button>
                {canManage && membership.role !== 'owner' ? (
                  <>
                    <button
                      className="button button--ghost"
                      onClick={() => {
                        setMembershipRole(
                          membership.role as
                            'barber' | 'manager' | 'receptionist',
                        );
                        setMembershipAction({
                          id: membership.id,
                          organizationName: membership.organization.name,
                          type: 'change_role',
                        });
                      }}
                      type="button"
                    >
                      Cambiar rol
                    </button>
                    <button
                      className="button button--ghost"
                      onClick={() =>
                        setMembershipAction({
                          id: membership.id,
                          organizationName: membership.organization.name,
                          type:
                            membership.status === 'suspended'
                              ? 'reactivate'
                              : 'suspend',
                        })
                      }
                      type="button"
                    >
                      {membership.status === 'suspended'
                        ? 'Reactivar membership'
                        : 'Suspender membership'}
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
      {membershipAction ? (
        <form
          className="compact-form"
          onSubmit={(event) => void submitMembership(event)}
        >
          <h4>
            {titleCase(membershipAction.type)}:{' '}
            {membershipAction.organizationName}
          </h4>
          {membershipAction.type === 'change_role' ? (
            <label>
              Rol nuevo
              <select
                onChange={(event) =>
                  setMembershipRole(
                    event.target.value as 'barber' | 'manager' | 'receptionist',
                  )
                }
                value={membershipRole}
              >
                <option value="manager">Manager</option>
                <option value="receptionist">Recepcionista</option>
                <option value="barber">Barbero</option>
              </select>
            </label>
          ) : null}
          <label>
            Motivo de {titleCase(membershipAction.type)}
            <textarea
              maxLength={500}
              minLength={10}
              onChange={(event) => setReason(event.target.value)}
              required
              rows={3}
              value={reason}
            />
          </label>
          <div className="inline-actions">
            <button
              className="button button--primary"
              disabled={busy}
              type="submit"
            >
              {busy ? 'Procesando…' : 'Confirmar y auditar'}
            </button>
            <button
              className="button button--ghost"
              disabled={busy}
              onClick={() => setMembershipAction(null)}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <h3>Seguridad</h3>
      <p className="muted-copy">
        {user.security.activeSessions} sesiones activas · {user.devices.length}{' '}
        dispositivos push registrados.
      </p>
      {canManage && user.status !== 'deleted' ? (
        <div className="inline-actions">
          {user.status === 'suspended' ? (
            <button
              className="button button--primary"
              onClick={() => setAction('reactivate')}
              type="button"
            >
              Reactivar cuenta
            </button>
          ) : (
            <button
              className="button button--danger"
              onClick={() => setAction('suspend')}
              type="button"
            >
              Suspender cuenta
            </button>
          )}
          <button
            className="button button--secondary"
            onClick={() => setAction('revoke_sessions')}
            type="button"
          >
            Revocar sesiones
          </button>
          <button
            className="button button--ghost"
            disabled={user.status === 'suspended'}
            onClick={() => setAction('request_password_recovery')}
            type="button"
          >
            Enviar recuperación
          </button>
        </div>
      ) : null}
      {action ? (
        <form className="compact-form" onSubmit={(event) => void submit(event)}>
          <label>
            Motivo de {titleCase(action)}
            <textarea
              minLength={10}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              required
              rows={3}
              value={reason}
            />
          </label>
          <div className="inline-actions">
            <button
              className={
                action === 'suspend'
                  ? 'button button--danger'
                  : 'button button--primary'
              }
              disabled={busy}
              type="submit"
            >
              {busy ? 'Procesando…' : 'Confirmar y auditar'}
            </button>
            <button
              className="button button--ghost"
              disabled={busy}
              onClick={() => setAction(null)}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

export function PlatformUsers({
  canManage,
  onOpenOrganization,
  onToast,
  selectedUser,
  token,
}: {
  readonly canManage: boolean;
  readonly onOpenOrganization: (organization: {
    readonly id: string;
    readonly name: string;
  }) => void;
  readonly onToast: (message: string) => void;
  readonly selectedUser: {
    readonly id: string;
    readonly requestId: number;
  } | null;
  readonly token: string;
}) {
  const [data, setData] = useState<PlatformUserList | null>(null);
  const [detail, setDetail] = useState<PlatformUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [verification, setVerification] = useState('all');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!selectedUser) return;
    let active = true;
    void getPlatformUserDetail(token, selectedUser.id)
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch((error: unknown) => {
        if (active)
          onToast(
            error instanceof Error
              ? error.message
              : 'No fue posible abrir la ficha del usuario.',
          );
      });
    return () => {
      active = false;
    };
  }, [onToast, selectedUser, token]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setLoading(true);
    });
    void getPlatformUsers(token, { page, search, status, verification })
      .then((next) => {
        if (active) setData(next);
      })
      .catch((error: unknown) => {
        if (active)
          onToast(
            error instanceof Error
              ? error.message
              : 'No fue posible cargar los usuarios.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onToast, page, refreshKey, search, status, token, verification]);

  async function openDetail(user: PlatformUser) {
    try {
      setDetail(await getPlatformUserDetail(token, user.id));
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : 'No fue posible abrir la ficha.',
      );
    }
  }

  return (
    <>
      <div className="section-header">
        <div>
          <h1>Usuarios Nava</h1>
          <p>
            Búsqueda global, estado de cuenta y seguridad sin exponer PII ni
            secretos.
          </p>
        </div>
        <div className="live-pill">
          <span /> Datos protegidos
        </div>
      </div>
      <section className="content-card">
        <div className="filters-grid">
          <label>
            Buscar
            <input
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Nombre, correo, teléfono o ID"
              value={search}
            />
          </label>
          <label>
            Estado
            <select
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              value={status}
            >
              <option value="all">Todos</option>
              <option value="active">Activa</option>
              <option value="suspended">Suspendida</option>
              <option value="deleted">Eliminada</option>
            </select>
          </label>
          <label>
            Verificación
            <select
              onChange={(event) => {
                setVerification(event.target.value);
                setPage(1);
              }}
              value={verification}
            >
              <option value="all">Todas</option>
              <option value="verified">Verificada</option>
              <option value="unverified">Pendiente</option>
            </select>
          </label>
        </div>
      </section>
      {detail ? (
        <UserDetail
          canManage={canManage}
          detail={detail}
          onClose={() => setDetail(null)}
          onMutated={() => {
            setRefreshKey((value) => value + 1);
            void getPlatformUserDetail(token, detail.user.account.id).then(
              setDetail,
            );
          }}
          onOpenOrganization={onOpenOrganization}
          token={token}
        />
      ) : null}
      <section className="table-card">
        {loading ? (
          <div className="panel-loader">Cargando usuarios…</div>
        ) : data?.users.length ? (
          data.users.map((user) => (
            <article className="event-row" key={user.id}>
              <div className="event-main">
                <strong>{user.name}</strong>
                <span>
                  {user.email} · {user.phone ?? 'Sin teléfono'}
                </span>
                <small>{user.id}</small>
              </div>
              <div className="event-meta">
                <span className="channel-badge">{titleCase(user.status)}</span>
                <small>
                  {user.roles.join(', ') || 'Sin rol'} · {user.memberships}{' '}
                  organizaciones · {user.security.activeSessions} sesiones
                </small>
                <button
                  className="button button--ghost"
                  onClick={() => void openDetail(user)}
                  type="button"
                >
                  Ver ficha
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">
            No se encontraron usuarios con esos filtros.
          </div>
        )}
      </section>
      {data ? (
        <div className="pagination">
          <button
            className="button button--ghost"
            disabled={data.pagination.page <= 1}
            onClick={() => setPage((value) => value - 1)}
            type="button"
          >
            Anterior
          </button>
          <span>
            Página {data.pagination.page} de {data.pagination.totalPages} ·{' '}
            {data.pagination.total} cuentas
          </span>
          <button
            className="button button--ghost"
            disabled={data.pagination.page >= data.pagination.totalPages}
            onClick={() => setPage((value) => value + 1)}
            type="button"
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </>
  );
}
