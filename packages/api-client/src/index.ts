export interface ApiRequestOptions {
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  readonly signal?: AbortSignal;
}

export interface ApiClient {
  request<TResponse>(
    path: string,
    options?: ApiRequestOptions,
  ): Promise<TResponse>;
}

export interface ApiClientConfig {
  readonly baseUrl: string;
  readonly fetchImplementation?: typeof fetch;
  readonly getAccessToken?: () => Promise<string | null>;
}

export interface AuthenticatedUser {
  readonly email: string;
  readonly fullName: string;
  readonly id: string;
}

export interface AuthResponse {
  readonly session: { readonly expiresAt: string; readonly token: string };
  readonly user: AuthenticatedUser;
}

export interface RegistrationResponse {
  readonly developmentVerificationCode?: string;
  readonly email: string;
  readonly verificationExpiresAt: string;
  readonly verificationRequired: true;
}

export interface RegistrationAvailabilityResponse {
  readonly conflicts: {
    readonly businessName?: string;
    readonly email?: string;
    readonly phone?: string;
  };
}

export interface ResendVerificationResponse {
  readonly developmentVerificationCode?: string;
  readonly message: string;
  readonly verificationExpiresAt: string;
}

export interface SessionResponse {
  readonly session: { readonly expiresAt: string };
  readonly user: AuthenticatedUser;
}

export interface RecoverAccessResponse {
  readonly developmentResetToken?: string;
  readonly message: string;
}

export interface OnboardingAccountDetailsResponse {
  readonly accountType: 'business' | 'professional' | null;
  readonly addressLine: string | null;
  readonly bookingUrl: string | null;
  readonly coverImageUri: string | null;
  readonly description: string | null;
  readonly facebookUrl: string | null;
  readonly instagramUrl: string | null;
  readonly businessName: string | null;
  readonly city: string | null;
  readonly countryCode: string | null;
  readonly email: string;
  readonly fullName: string;
  readonly openingTime: string | null;
  readonly closingTime: string | null;
  readonly phone: string | null;
}

export interface ApiMessageResponse {
  readonly message: string;
  // Reserved for future shared message fields.
}

export interface CurrentOrganizationResponse {
  readonly location: {
    readonly currencyCode: string;
    readonly id: string;
    readonly name: string;
    readonly timezone: string;
  } | null;
  readonly membership: {
    readonly id: string;
    readonly role: 'barber' | 'manager' | 'owner' | 'receptionist';
    readonly status: 'active' | 'invited' | 'suspended';
  };
  readonly organization: {
    readonly currencyCode: string;
    readonly defaultTimezone: string;
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
}

export interface OnboardingCollaboratorRecord {
  readonly agendaColor: string;
  readonly canPerformServices: boolean;
  readonly customRoleDescription: string | null;
  readonly customRoleName: string | null;
  readonly description: string | null;
  readonly id: string;
  readonly identification: string | null;
  readonly name: string;
  readonly phone: string | null;
  readonly photoUri: string | null;
  readonly role: 'administrator' | 'barber' | 'custom';
}

export interface OnboardingCollaboratorsResponse {
  readonly collaborators: readonly OnboardingCollaboratorRecord[];
}

export interface TeamMember {
  readonly id: string;
  readonly locations: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly role: 'barber' | 'manager' | 'owner' | 'receptionist';
  readonly status: 'active' | 'invited' | 'suspended';
  readonly user: AuthenticatedUser;
}

export interface TeamResponse {
  readonly members: readonly TeamMember[];
  readonly pendingInvitations: ReadonlyArray<{
    readonly email: string;
    readonly expiresAt: string;
    readonly id: string;
    readonly role: 'barber' | 'manager' | 'receptionist';
  }>;
}

export interface ServiceRecord {
  readonly assignments: ReadonlyArray<{
    readonly locationId: string;
    readonly membershipId: string;
  }>;
  readonly categoryId: string | null;
  readonly durationMinutes: number;
  readonly id: string;
  readonly name: string;
  readonly priceCents: number;
}

export interface ServicesResponse {
  readonly categories: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly services: readonly ServiceRecord[];
}

export interface SchedulesResponse {
  readonly blocks: ReadonlyArray<{
    readonly endsAt: string;
    readonly id: string;
    readonly membershipId: string;
    readonly reason: string | null;
    readonly startsAt: string;
  }>;
  readonly schedules: ReadonlyArray<{
    readonly endMinute: number;
    readonly id: string;
    readonly membershipId: string;
    readonly startMinute: number;
    readonly weekday: number;
  }>;
}

export interface AppointmentRecord {
  readonly clientEmail: string | null;
  readonly clientName: string;
  readonly clientPhone: string | null;
  readonly endsAt: string;
  readonly id: string;
  readonly locationId: string;
  readonly notes: string | null;
  readonly professionalMembershipId: string;
  readonly services: ReadonlyArray<{
    readonly durationMinutes: number;
    readonly id: string;
    readonly priceCents: number;
    readonly serviceId: string;
    readonly serviceName: string;
  }>;
  readonly startsAt: string;
  readonly status:
    | 'cancelled'
    | 'checked_in'
    | 'completed'
    | 'confirmed'
    | 'in_progress'
    | 'no_show'
    | 'scheduled';
}

export interface AppointmentsResponse {
  readonly appointments: readonly AppointmentRecord[];
}

export interface AvailabilityResponse {
  readonly durationMinutes: number;
  readonly slots: ReadonlyArray<{
    readonly endsAt: string;
    readonly startsAt: string;
  }>;
}

export interface AppointmentEventsResponse {
  readonly events: ReadonlyArray<{
    readonly appointmentId: string;
    readonly id: string;
    readonly type: 'cancelled' | 'created' | 'rescheduled' | 'status_changed';
  }>;
  readonly latestEventId: string;
}

export class ApiClientError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const fetchImplementation = config.fetchImplementation ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/$/u, '');

  return {
    async request<TResponse>(
      path: string,
      options: ApiRequestOptions = {},
    ): Promise<TResponse> {
      const token = await config.getAccessToken?.();
      const requestInit: RequestInit = {
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(options.body === undefined
            ? {}
            : { 'content-type': 'application/json' }),
          ...options.headers,
        },
        method: options.method ?? 'GET',
      };

      if (options.body !== undefined) {
        requestInit.body = JSON.stringify(options.body);
      }
      if (options.signal !== undefined) requestInit.signal = options.signal;

      const response = await fetchImplementation(
        `${baseUrl}/${path.replace(/^\//u, '')}`,
        requestInit,
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          code?: string;
          message?: string;
        } | null;
        throw new ApiClientError(
          response.status,
          payload?.code ?? 'REQUEST_FAILED',
          payload?.message ??
            'No fue posible completar la solicitud. Inténtalo nuevamente.',
        );
      }

      if (response.status === 204) return undefined as TResponse;
      return response.json() as Promise<TResponse>;
    },
  };
}
