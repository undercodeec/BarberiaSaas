export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000'
).replace(/\/+$/u, '');

export interface Operator {
  readonly email: string;
  readonly fullName: string;
  readonly id: string;
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

export async function signIn(email: string, password: string) {
  return request<{ session: { expiresAt: string; token: string } }>(
    '/v1/auth/login',
    { body: JSON.stringify({ email, password }), method: 'POST' },
  );
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
  return request<{ operator: Operator }>(
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
    readonly search: string;
    readonly status: string;
  },
) {
  const query = new URLSearchParams({
    page: String(input.page),
    pageSize: '10',
    status: input.status,
  });
  if (input.search) query.set('search', input.search);
  return request<OrganizationList>(
    `/v1/platform/organizations?${query.toString()}`,
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

export type OrganizationAction =
  | { readonly action: 'reactivate' | 'suspend'; readonly reason: string }
  | {
      readonly action: 'change_plan';
      readonly planCode: string;
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
