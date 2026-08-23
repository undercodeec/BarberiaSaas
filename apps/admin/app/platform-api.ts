export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000'
).replace(/\/+$/u, '');

export interface Operator {
  readonly email: string;
  readonly fullName: string;
  readonly id: string;
  readonly role: string;
}

export interface PlatformOverview {
  readonly activation: {
    readonly completedFirstAppointment: number;
    readonly createdFirstAppointment: number;
    readonly createdService: number;
    readonly organizations: number;
  };
  readonly notificationFailures: number;
  readonly subscriptions: Readonly<Record<string, number>>;
  readonly trialsEndingSoon: number;
}

export interface PlatformOrganization {
  readonly counts: {
    readonly appointments: number;
    readonly locations: number;
    readonly memberships: number;
    readonly services: number;
  };
  readonly createdAt: string;
  readonly id: string;
  readonly name: string;
  readonly owner: { readonly email: string; readonly fullName: string } | null;
  readonly plan: string | null;
  readonly slug: string;
  readonly status: string;
  readonly trialEndsAt: string | null;
}

export interface OrganizationList {
  readonly organizations: readonly PlatformOrganization[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
  };
}

export interface PlatformUser {
  readonly createdAt: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly id: string;
  readonly lastAccessAt: string | null;
  readonly memberships: number;
  readonly name: string;
  readonly phone: string | null;
  readonly roles: readonly string[];
  readonly security: {
    readonly activeSessions: number;
    readonly suspended: boolean;
  };
  readonly status: 'active' | 'deleted' | 'suspended';
}

export interface PlatformUserList {
  readonly pagination: OrganizationList['pagination'];
  readonly users: readonly PlatformUser[];
}

export interface PlatformUserDetail {
  readonly user: {
    readonly account: {
      readonly createdAt: string;
      readonly deletedAt: string | null;
      readonly email: string;
      readonly emailVerified: boolean;
      readonly id: string;
      readonly name: string;
      readonly phone: string | null;
      readonly suspendedAt: string | null;
      readonly updatedAt: string;
    };
    readonly audit: readonly {
      readonly action: string;
      readonly createdAt: string;
      readonly metadata: unknown;
    }[];
    readonly devices: readonly {
      readonly createdAt: string;
      readonly updatedAt: string;
    }[];
    readonly memberships: readonly {
      readonly createdAt: string;
      readonly id: string;
      readonly organization: {
        readonly id: string;
        readonly name: string;
        readonly status: string;
      };
      readonly role: string;
      readonly status: string;
    }[];
    readonly security: {
      readonly activeSessions: number;
      readonly lastAccessAt: string | null;
      readonly sessions: readonly {
        readonly createdAt: string;
        readonly expiresAt: string;
        readonly lastActiveAt: string;
        readonly status: string;
      }[];
    };
    readonly status: 'active' | 'deleted' | 'suspended';
    readonly supportCases: readonly {
      readonly id: string;
      readonly organization: { readonly id: string; readonly name: string };
      readonly status: string;
      readonly title: string;
      readonly updatedAt: string;
    }[];
  };
}

export interface NotificationFailure {
  readonly attempts: number;
  readonly channel: string;
  readonly createdAt: string;
  readonly id: string;
  readonly notificationId: string;
  readonly organization: { readonly id: string; readonly name: string };
  readonly title: string;
}

export interface PlatformAuditLog {
  readonly action: string;
  readonly actor: { readonly email: string; readonly fullName: string } | null;
  readonly createdAt: string;
  readonly id: string;
  readonly organization: string;
  readonly reason: unknown;
}

export interface PlatformOperatorRecord {
  readonly createdAt: string;
  readonly email: string;
  readonly fullName: string;
  readonly id: string;
  readonly isActive: boolean;
  readonly role: string;
  readonly userId: string;
}

export interface PlatformSession {
  readonly createdAt: string;
  readonly current: boolean;
  readonly expiresAt: string;
  readonly id: string;
  readonly lastActiveAt: string;
  readonly operator: { readonly email: string; readonly fullName: string };
}

export interface PlatformAlert {
  readonly detail: string;
  readonly id: string;
  readonly occurredAt: string;
  readonly organization: { readonly id: string; readonly name: string } | null;
  readonly severity: string;
  readonly status: string;
  readonly title: string;
  readonly type: string;
}

export interface PlatformSupportCase {
  readonly assignedTo: {
    readonly fullName: string;
    readonly id: string;
  } | null;
  readonly category: string;
  readonly createdAt: string;
  readonly createdBy: { readonly fullName: string; readonly id: string } | null;
  readonly description: string;
  readonly events: readonly {
    readonly actor: { readonly fullName: string } | null;
    readonly createdAt: string;
    readonly id: string;
    readonly note: string | null;
    readonly type: string;
  }[];
  readonly id: string;
  readonly organization: { readonly id: string; readonly name: string };
  readonly priority: string;
  readonly slaDueAt: string | null;
  readonly sla: {
    readonly breachedByMinutes: number;
    readonly remainingMinutes: number;
    readonly state: 'breached' | 'met' | 'no_due' | 'running';
  };
  readonly status: string;
  readonly title: string;
  readonly updatedAt: string;
}

export interface PlatformOrganizationDetail {
  readonly activity: {
    readonly appointmentsLast30Days: Readonly<Record<string, number>>;
    readonly ordersLast30Days: Readonly<Record<string, number>>;
    readonly recentAudit: readonly {
      readonly action: string;
      readonly actor: string | null;
      readonly createdAt: string;
      readonly entityType: string;
      readonly id: string;
    }[];
  };
  readonly health: {
    readonly lowStockItems: number;
    readonly notificationFailures: number;
    readonly openCashRegisters: number;
    readonly openSupportCases: number;
    readonly pendingCommissionSettlements: number;
  };
  readonly notes: readonly {
    readonly category: string;
    readonly createdAt: string;
    readonly createdBy: string;
    readonly id: string;
    readonly note: string;
  }[];
  readonly organization: {
    readonly createdAt: string;
    readonly currencyCode: string;
    readonly defaultTimezone: string;
    readonly id: string;
    readonly locations: readonly {
      readonly id: string;
      readonly isActive: boolean;
      readonly name: string;
      readonly timezone: string;
    }[];
    readonly name: string;
    readonly owner: {
      readonly email: string;
      readonly fullName: string;
    } | null;
    readonly slug: string;
    readonly status: string;
  };
  readonly payphone: {
    readonly connectionStatus: string;
    readonly environment: string;
    readonly isEnabled: boolean;
    readonly lastErrorCode: string | null;
    readonly lastTestedAt: string | null;
  } | null;
  readonly subscription: {
    readonly currentPeriodEnd: string;
    readonly currentPeriodStart: string;
    readonly effectiveBookingLimit: number | null;
    readonly features: Readonly<Record<string, boolean>>;
    readonly graceEndsAt: string | null;
    readonly history: readonly {
      readonly action: string;
      readonly actor: string;
      readonly createdAt: string;
      readonly id: string;
    }[];
    readonly limits: Readonly<Record<string, number | null>>;
    readonly plan: string;
    readonly status: string;
    readonly trialEndsAt: string | null;
    readonly usage: Readonly<Record<string, number>>;
  };
}

export interface PlatformSystemHealth {
  readonly checkedAt: string;
  readonly components: Readonly<
    Record<string, { readonly failures?: number; readonly status: string }>
  >;
  readonly openAlerts: number;
  readonly openSupportCases: number;
}

export interface PlatformPrivacyRequest {
  readonly assignedTo: {
    readonly fullName: string;
    readonly id: string;
  } | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly dueAt: string | null;
  readonly id: string;
  readonly organization: { readonly id: string; readonly name: string } | null;
  readonly reason: string;
  readonly resolutionNote: string | null;
  readonly status: string;
  readonly subject: {
    readonly email: string;
    readonly fullName: string;
    readonly id: string;
  } | null;
  readonly type: string;
}

export interface PlatformFeatureOverride {
  readonly booleanValue: boolean | null;
  readonly createdAt: string;
  readonly createdBy: { readonly fullName: string } | null;
  readonly expiresAt: string;
  readonly id: string;
  readonly integerValue: number | null;
  readonly key: string;
  readonly kind: 'feature' | 'limit';
  readonly organization: { readonly id: string; readonly name: string };
  readonly reason: string;
  readonly revokedAt: string | null;
}

export interface PlatformOnboardingProfile {
  readonly abandoned: boolean;
  readonly accountType: string;
  readonly appointments: number;
  readonly businessName: string;
  readonly collaborators: number;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly organization: { readonly id: string; readonly name: string } | null;
  readonly owner: { readonly email: string; readonly fullName: string };
  readonly progressPercent: number;
  readonly services: number;
  readonly stages: Readonly<
    Record<
      'account' | 'businessProfile' | 'location' | 'service' | 'team',
      boolean
    >
  >;
  readonly updatedAt: string;
  readonly userId: string;
}

export interface PlatformOnboardingResult {
  readonly abandonedAfterHours: number;
  readonly pendingRegistrations: readonly {
    readonly abandoned: boolean;
    readonly createdAt: string;
    readonly email: string;
    readonly expired: boolean;
    readonly failedAttempts: number;
    readonly id: string;
    readonly locked: boolean;
  }[];
  readonly profiles: readonly PlatformOnboardingProfile[];
  readonly summary: {
    readonly abandoned: number;
    readonly completed: number;
    readonly pending: number;
    readonly pendingVerification: number;
  };
}

export interface PlatformConfigurationVersion {
  readonly approvedBy: string | null;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly id: string;
  readonly key: string;
  readonly publishedAt: string | null;
  readonly reason: string;
  readonly rollbackOfVersionId: string | null;
  readonly status: 'archived' | 'draft' | 'published';
  readonly value: Readonly<Record<string, number>>;
  readonly version: number;
}

export interface PlatformReview {
  readonly client: string;
  readonly comment: string | null;
  readonly createdAt: string;
  readonly id: string;
  readonly isVisible: boolean;
  readonly location: { readonly id: string; readonly name: string };
  readonly organization: { readonly id: string; readonly name: string };
  readonly rating: number;
}

export type PlatformOperationalDomain =
  | 'bookings'
  | 'cash-health'
  | 'commissions-health'
  | 'inventory-health'
  | 'orders'
  | 'payphone-health';

export interface PlatformOperationalRecord {
  readonly amountCents: number | null;
  readonly detail: string;
  readonly id: string;
  readonly organization: { readonly id: string; readonly name: string } | null;
  readonly status: string;
  readonly timestamp: string;
  readonly title: string;
}

export interface SupportDiagnostics {
  readonly diagnostics: {
    readonly counts: {
      readonly activeMembers: number;
      readonly activeServices: number;
      readonly locations: number;
      readonly notificationFailures: number;
      readonly openCashRegisters: number;
      readonly recentAppointments: number;
    };
    readonly organization: {
      readonly id: string;
      readonly name: string;
      readonly plan: string | null;
      readonly status: string;
    };
    readonly owner: {
      readonly email: string;
      readonly fullName: string;
    } | null;
  };
  readonly notice: string;
}

export class PlatformApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'PlatformApiError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('accept', 'application/json');
  if (options.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      code?: unknown;
      message?: unknown;
    } | null;
    throw new PlatformApiError(
      response.status,
      typeof payload?.code === 'string' ? payload.code : 'REQUEST_FAILED',
      typeof payload?.message === 'string'
        ? payload.message
        : 'No fue posible completar la solicitud.',
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function startPlatformLogin(email: string, password: string) {
  return request<{ challengeToken: string; expiresAt: string }>(
    '/v1/platform/login',
    { body: JSON.stringify({ email, password }), method: 'POST' },
  );
}

export async function startDevelopmentSession() {
  return request<{
    operator: Operator;
    session: { expiresAt: string; token: string };
  }>('/v1/platform/development-session', { method: 'POST' });
}

export async function signOut(token: string) {
  return request<void>('/v1/auth/logout', { method: 'POST' }, token);
}

export async function getPlatformSession(token: string) {
  return request<{ operator: Operator }>('/v1/platform/session', {}, token);
}

export async function requestPlatformAccessCode(token: string) {
  return request<{ expiresAt: string; message: string }>(
    '/v1/platform/access-code',
    { method: 'POST' },
    token,
  );
}

export async function verifyPlatformAccessCode(token: string, code: string) {
  return request<{
    operator: Operator;
    session: { expiresAt: string; token: string };
  }>(
    '/v1/platform/verify-access-code',
    { body: JSON.stringify({ code }), method: 'POST' },
    token,
  );
}

export async function getOverview(token: string) {
  return request<PlatformOverview>('/v1/platform/overview', {}, token);
}

export async function getOrganizations(
  token: string,
  input: {
    readonly page: number;
    readonly plan: string;
    readonly search: string;
    readonly status: string;
    readonly trial: string;
  },
) {
  const query = new URLSearchParams({
    page: String(input.page),
    pageSize: '10',
    plan: input.plan,
    status: input.status,
    trial: input.trial,
  });
  if (input.search) query.set('search', input.search);
  return request<OrganizationList>(
    `/v1/platform/organizations?${query.toString()}`,
    {},
    token,
  );
}

export async function getPlatformUsers(
  token: string,
  input: {
    readonly page: number;
    readonly search: string;
    readonly status: string;
    readonly verification: string;
  },
) {
  const query = new URLSearchParams({
    page: String(input.page),
    pageSize: '10',
    status: input.status,
    verification: input.verification,
  });
  if (input.search) query.set('search', input.search);
  return request<PlatformUserList>(
    `/v1/platform/users?${query.toString()}`,
    {},
    token,
  );
}

export async function getPlatformUserDetail(token: string, userId: string) {
  return request<PlatformUserDetail>(
    `/v1/platform/users/${encodeURIComponent(userId)}`,
    {},
    token,
  );
}

export type PlatformUserAction = {
  readonly action:
    'suspend' | 'reactivate' | 'revoke_sessions' | 'request_password_recovery';
  readonly reason: string;
};

export async function updatePlatformUser(
  token: string,
  userId: string,
  action: PlatformUserAction,
) {
  return request<{ id: string; status?: string }>(
    `/v1/platform/users/${encodeURIComponent(userId)}`,
    { body: JSON.stringify(action), method: 'PATCH' },
    token,
  );
}

export async function getOrganizationDetail(
  token: string,
  organizationId: string,
) {
  return request<PlatformOrganizationDetail>(
    `/v1/platform/organizations/${encodeURIComponent(organizationId)}`,
    {},
    token,
  );
}

export async function getNotificationFailures(
  token: string,
  organizationId?: string,
) {
  const query = organizationId
    ? `?organizationId=${encodeURIComponent(organizationId)}`
    : '';
  return request<{ errors: readonly NotificationFailure[] }>(
    `/v1/platform/notification-errors${query}`,
    {},
    token,
  );
}

export async function retryNotificationDelivery(
  token: string,
  notificationId: string,
  channel: string,
  reason: string,
) {
  return request<{ id: string; queued: boolean }>(
    `/v1/platform/notifications/${encodeURIComponent(notificationId)}/retry`,
    {
      body: JSON.stringify({ channel, reason }),
      method: 'POST',
    },
    token,
  );
}

export async function getAuditLogs(token: string, organizationId?: string) {
  const query = organizationId
    ? `?organizationId=${encodeURIComponent(organizationId)}`
    : '';
  return request<{ logs: readonly PlatformAuditLog[] }>(
    `/v1/platform/audit${query}`,
    {},
    token,
  );
}

export async function downloadAuditExport(
  token: string,
  input: {
    readonly from: string;
    readonly organizationId?: string;
    readonly to: string;
  },
) {
  const query = new URLSearchParams({ from: input.from, to: input.to });
  if (input.organizationId) query.set('organizationId', input.organizationId);
  const response = await fetch(
    `${API_URL}/v1/platform/exports/audit.csv?${query.toString()}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      code?: unknown;
      message?: unknown;
    } | null;
    throw new PlatformApiError(
      response.status,
      typeof payload?.code === 'string' ? payload.code : 'EXPORT_FAILED',
      typeof payload?.message === 'string'
        ? payload.message
        : 'No fue posible generar la exportación.',
    );
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename =
    disposition.match(/filename="([^"]+)"/u)?.[1] ?? 'nava-auditoria.csv';
  return { blob: await response.blob(), filename };
}

export type OrganizationAction =
  | { readonly action: 'reactivate' | 'suspend'; readonly reason: string }
  | {
      readonly action: 'change_plan';
      readonly planCode: string;
      readonly reason: string;
    }
  | {
      readonly action: 'extend_trial' | 'reduce_trial';
      readonly days: number;
      readonly reason: string;
    };

export async function updateOrganization(
  token: string,
  organizationId: string,
  action: OrganizationAction,
) {
  return request<{
    organization: { id: string; planId: string; status: string };
  }>(
    `/v1/platform/organizations/${encodeURIComponent(organizationId)}`,
    { body: JSON.stringify(action), method: 'PATCH' },
    token,
  );
}

export async function accessSupport(
  token: string,
  organizationId: string,
  reason: string,
) {
  return request<SupportDiagnostics>(
    `/v1/platform/organizations/${encodeURIComponent(organizationId)}/support`,
    { body: JSON.stringify({ reason }), method: 'POST' },
    token,
  );
}

export async function createOrganizationNote(
  token: string,
  organizationId: string,
  input: { readonly category: 'commercial' | 'support'; readonly note: string },
) {
  return request<{ id: string }>(
    `/v1/platform/organizations/${encodeURIComponent(organizationId)}/notes`,
    { body: JSON.stringify(input), method: 'POST' },
    token,
  );
}

export async function getPlatformOperators(token: string) {
  return request<{ operators: readonly PlatformOperatorRecord[] }>(
    '/v1/platform/operators',
    {},
    token,
  );
}

export async function savePlatformOperator(
  token: string,
  input: {
    readonly email: string;
    readonly isActive: boolean;
    readonly role: string;
  },
) {
  return request<{ operator: PlatformOperatorRecord }>(
    '/v1/platform/operators',
    { body: JSON.stringify(input), method: 'POST' },
    token,
  );
}

export async function updatePlatformOperator(
  token: string,
  id: string,
  input: { readonly isActive: boolean; readonly role: string },
) {
  return request<{
    operator: Pick<PlatformOperatorRecord, 'id' | 'isActive' | 'role'>;
  }>(
    `/v1/platform/operators/${encodeURIComponent(id)}`,
    { body: JSON.stringify(input), method: 'PATCH' },
    token,
  );
}

export async function getPlatformSessions(token: string) {
  return request<{ sessions: readonly PlatformSession[] }>(
    '/v1/platform/sessions',
    {},
    token,
  );
}

export async function revokePlatformSession(token: string, id: string) {
  return request<void>(
    `/v1/platform/sessions/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token,
  );
}

export async function getPlatformAlerts(token: string) {
  return request<{ alerts: readonly PlatformAlert[] }>(
    '/v1/platform/alerts?status=all',
    {},
    token,
  );
}

export async function updatePlatformAlert(
  token: string,
  id: string,
  input: {
    readonly note: string;
    readonly status: 'acknowledged' | 'resolved';
  },
) {
  return request<{ id: string; status: string }>(
    `/v1/platform/alerts/${encodeURIComponent(id)}`,
    { body: JSON.stringify(input), method: 'PATCH' },
    token,
  );
}

export async function getSupportCases(token: string) {
  return request<{
    cases: readonly PlatformSupportCase[];
    operators: readonly { readonly fullName: string; readonly id: string }[];
    summary: { readonly breached: number; readonly open: number };
  }>('/v1/platform/support-cases?status=all', {}, token);
}

export async function createSupportCase(
  token: string,
  input: {
    readonly category: string;
    readonly description: string;
    readonly organizationId: string;
    readonly priority: string;
    readonly title: string;
  },
) {
  return request<{ id: string }>(
    '/v1/platform/support-cases',
    { body: JSON.stringify(input), method: 'POST' },
    token,
  );
}

export async function updateSupportCase(
  token: string,
  id: string,
  input: {
    readonly assignedToUserId?: string | null;
    readonly note: string;
    readonly priority?: string;
    readonly slaDueAt?: string | null;
    readonly status?: string;
  },
) {
  return request<{ id: string; status: string }>(
    `/v1/platform/support-cases/${encodeURIComponent(id)}`,
    { body: JSON.stringify(input), method: 'PATCH' },
    token,
  );
}

export async function getSystemHealth(token: string) {
  return request<PlatformSystemHealth>('/v1/platform/system-health', {}, token);
}

export async function getPlatformOperationalRecords(
  token: string,
  domain: PlatformOperationalDomain,
  organizationId?: string,
): Promise<readonly PlatformOperationalRecord[]> {
  const query = organizationId
    ? `?organizationId=${encodeURIComponent(organizationId)}`
    : '';
  if (domain === 'bookings') {
    const result = await request<{
      bookings: Array<{
        id: string;
        location: { id: string; name: string };
        organization: { id: string; name: string };
        paymentStatus: string;
        source: string;
        startsAt: string;
        status: string;
      }>;
    }>(`/v1/platform/bookings${query}`, {}, token);
    return result.bookings.map((row) => ({
      amountCents: null,
      detail: `${row.location.name} · ${row.source} · pago ${row.paymentStatus}`,
      id: row.id,
      organization: row.organization,
      status: row.status,
      timestamp: row.startsAt,
      title: 'Cita',
    }));
  }
  if (domain === 'orders') {
    const result = await request<{
      orders: Array<{
        createdAt: string;
        id: string;
        location: { id: string; name: string };
        organization: { id: string; name: string };
        paymentMethod: string;
        status: string;
        totalCents: number;
      }>;
    }>(`/v1/platform/orders${query}`, {}, token);
    return result.orders.map((row) => ({
      amountCents: row.totalCents,
      detail: `${row.location.name} · ${row.paymentMethod}`,
      id: row.id,
      organization: row.organization,
      status: row.status,
      timestamp: row.createdAt,
      title: 'Pedido de productos',
    }));
  }
  if (domain === 'cash-health') {
    const result = await request<{
      sessions: Array<{
        differenceCents: number | null;
        id: string;
        openedAt: string;
        organization: { id: string; name: string } | null;
        status: string;
      }>;
    }>(`/v1/platform/cash-health${query}`, {}, token);
    return result.sessions.map((row) => ({
      amountCents: row.differenceCents,
      detail:
        row.differenceCents === null
          ? 'Sin diferencia calculada'
          : 'Diferencia de cierre',
      id: row.id,
      organization: row.organization,
      status: row.status,
      timestamp: row.openedAt,
      title: 'Sesión de caja',
    }));
  }
  if (domain === 'commissions-health') {
    const result = await request<{
      settlements: Array<{
        createdAt: string;
        id: string;
        organization: { id: string; name: string };
        periodEnd: string;
        periodStart: string;
        status: string;
        totalPayableCents: number;
      }>;
    }>(`/v1/platform/commissions-health${query}`, {}, token);
    return result.settlements.map((row) => ({
      amountCents: row.totalPayableCents,
      detail: `${row.periodStart.slice(0, 10)} → ${row.periodEnd.slice(0, 10)}`,
      id: row.id,
      organization: row.organization,
      status: row.status,
      timestamp: row.createdAt,
      title: 'Liquidación de comisión',
    }));
  }
  if (domain === 'inventory-health') {
    const result = await request<{
      inventory: Array<{
        available: number;
        location: { id: string; name: string };
        lowStock: boolean;
        minimumStock: number;
        organization: { id: string; name: string };
        product: { id: string; name: string; sku: string | null };
        updatedAt: string;
      }>;
    }>(`/v1/platform/inventory-health${query}`, {}, token);
    return result.inventory.map((row) => ({
      amountCents: null,
      detail: `${row.location.name} · disponible ${row.available} · mínimo ${row.minimumStock}`,
      id: `${row.location.id}:${row.product.id}`,
      organization: row.organization,
      status: row.lowStock ? 'low_stock' : 'healthy',
      timestamp: row.updatedAt,
      title: `${row.product.name}${row.product.sku ? ` · ${row.product.sku}` : ''}`,
    }));
  }
  const result = await request<{
    configurations: Array<{
      connectionStatus: string;
      environment: string;
      id: string;
      isEnabled: boolean;
      lastErrorCode: string | null;
      lastTestedAt: string | null;
      organization: { id: string; name: string };
      updatedAt: string;
    }>;
  }>(`/v1/platform/payphone-health${query}`, {}, token);
  return result.configurations.map((row) => ({
    amountCents: null,
    detail: `${row.environment} · ${row.isEnabled ? 'habilitado' : 'deshabilitado'}${row.lastErrorCode ? ` · ${row.lastErrorCode}` : ''}`,
    id: row.id,
    organization: row.organization,
    status: row.connectionStatus,
    timestamp: row.lastTestedAt ?? row.updatedAt,
    title: 'PayPhone',
  }));
}

export async function getPrivacyRequests(token: string) {
  return request<{ requests: readonly PlatformPrivacyRequest[] }>(
    '/v1/platform/privacy-requests?status=all',
    {},
    token,
  );
}

export async function createPrivacyRequest(
  token: string,
  input: {
    readonly dueAt?: string;
    readonly organizationId?: string;
    readonly reason: string;
    readonly subjectUserId?: string;
    readonly type: string;
  },
) {
  return request<{ id: string }>(
    '/v1/platform/privacy-requests',
    { body: JSON.stringify(input), method: 'POST' },
    token,
  );
}

export async function updatePrivacyRequest(
  token: string,
  id: string,
  input: { readonly resolutionNote: string; readonly status: string },
) {
  return request<{ id: string; status: string }>(
    `/v1/platform/privacy-requests/${encodeURIComponent(id)}`,
    { body: JSON.stringify(input), method: 'PATCH' },
    token,
  );
}

export async function getPlatformOverrides(token: string) {
  return request<{ overrides: readonly PlatformFeatureOverride[] }>(
    '/v1/platform/overrides',
    {},
    token,
  );
}

export async function createPlatformOverride(
  token: string,
  input:
    | {
        readonly booleanValue: boolean;
        readonly expiresAt: string;
        readonly key: string;
        readonly kind: 'feature';
        readonly organizationId: string;
        readonly reason: string;
      }
    | {
        readonly expiresAt: string;
        readonly integerValue: number | null;
        readonly key: string;
        readonly kind: 'limit';
        readonly organizationId: string;
        readonly reason: string;
      },
) {
  return request<{ id: string }>(
    '/v1/platform/overrides',
    { body: JSON.stringify(input), method: 'POST' },
    token,
  );
}

export async function revokePlatformOverride(
  token: string,
  id: string,
  reason: string,
) {
  return request<{ id: string; revokedAt: string }>(
    `/v1/platform/overrides/${encodeURIComponent(id)}/revoke`,
    { body: JSON.stringify({ reason }), method: 'POST' },
    token,
  );
}

export async function getOnboardingProfiles(token: string) {
  return request<PlatformOnboardingResult>(
    '/v1/platform/onboarding',
    {},
    token,
  );
}

export async function resendPendingVerification(
  token: string,
  id: string,
  reason: string,
) {
  return request<{ id: string; verificationExpiresAt: string }>(
    `/v1/platform/onboarding/pending/${encodeURIComponent(id)}/resend-verification`,
    { body: JSON.stringify({ reason }), method: 'POST' },
    token,
  );
}

export async function getPlatformConfigurations(token: string) {
  return request<{
    allowedKeys: readonly string[];
    configurations: readonly PlatformConfigurationVersion[];
  }>('/v1/platform/configurations', {}, token);
}

export async function createPlatformConfiguration(
  token: string,
  input: {
    readonly key: string;
    readonly reason: string;
    readonly value: Readonly<Record<string, number>>;
  },
) {
  return request<{ id: string; version: number }>(
    '/v1/platform/configurations',
    { body: JSON.stringify(input), method: 'POST' },
    token,
  );
}

export async function publishPlatformConfiguration(
  token: string,
  id: string,
  reason: string,
) {
  return request<{ id: string; status: string }>(
    `/v1/platform/configurations/${encodeURIComponent(id)}/publish`,
    { body: JSON.stringify({ reason }), method: 'POST' },
    token,
  );
}

export async function rollbackPlatformConfiguration(
  token: string,
  id: string,
  reason: string,
) {
  return request<{ id: string; status: string }>(
    `/v1/platform/configurations/${encodeURIComponent(id)}/rollback`,
    { body: JSON.stringify({ reason }), method: 'POST' },
    token,
  );
}

export async function getPlatformReviews(token: string) {
  return request<{ reviews: readonly PlatformReview[] }>(
    '/v1/platform/reviews',
    {},
    token,
  );
}

export async function updatePlatformReviewVisibility(
  token: string,
  id: string,
  input: { readonly isVisible: boolean; readonly reason: string },
) {
  return request<{ id: string; isVisible: boolean }>(
    `/v1/platform/reviews/${encodeURIComponent(id)}/visibility`,
    { body: JSON.stringify(input), method: 'PATCH' },
    token,
  );
}
