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
  readonly onboardingCompletedAt: string | null;
  readonly phone: string | null;
}

export interface UserPortfolioItem {
  readonly createdAt: string;
  readonly id: string;
  readonly photoData: string;
}

export interface UserProfileResponse {
  readonly profile: {
    readonly bio: string | null;
    readonly email: string;
    readonly fullName: string;
    readonly phone: string | null;
    readonly photoData: string | null;
    readonly portfolio: readonly UserPortfolioItem[];
  };
}
export interface CashRegisterSession {
  readonly closedAt?: string | null;
  readonly closingNote?: string | null;
  readonly closingAmountCents?: number | null;
  readonly differenceCents?: number | null;
  readonly expectedAmountCents?: number | null;
  readonly id: string;
  readonly openedAt: string;
  readonly openingAmountCents: number;
  readonly responsibleName: string;
  readonly status: 'open' | 'closed';
}

export interface CurrentCashRegisterResponse {
  readonly session: CashRegisterSession | null;
}

export interface CashMovementRecord {
  readonly amountCents: number;
  readonly appointmentId: string | null;
  readonly createdAt: string;
  readonly description: string;
  readonly id: string;
  readonly paymentMethod: 'card' | 'cash' | 'other' | 'transfer' | null;
  readonly professionalMembershipId: string | null;
  readonly serviceId: string | null;
  readonly type: 'expense' | 'sale' | 'withdrawal';
}

export interface CashRegisterTotals {
  readonly card: number;
  readonly cash: number;
  readonly cashSales: number;
  readonly expectedCash: number;
  readonly expenses: number;
  readonly other: number;
  readonly sales: number;
  readonly transfers: number;
  readonly withdrawals: number;
}

export interface CashRegisterSummaryResponse {
  readonly movements: readonly CashMovementRecord[];
  readonly session: CashRegisterSession | null;
  readonly totals: CashRegisterTotals | null;
}

export interface CashRegisterHistoryResponse {
  readonly sessions: ReadonlyArray<
    CashRegisterSession & { readonly totals: CashRegisterTotals }
  >;
}

export interface CashRegisterDetailResponse {
  readonly movements: readonly CashMovementRecord[];
  readonly session: CashRegisterSession;
  readonly totals: CashRegisterTotals;
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
  readonly commissionPercentage: number | null;
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
    readonly commissionPercentage: number | null;
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
  readonly onlineBooking: boolean;
  readonly priceCents: number;
}

export interface ServicesResponse {
  readonly categories: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly services: readonly ServiceRecord[];
}

export interface ClientLabelRecord {
  readonly color: string;
  readonly id: string;
  readonly name: string;
}

export interface ClientLabelsResponse {
  readonly labels: readonly ClientLabelRecord[];
}
export interface ClientNoteRecord {
  readonly createdAt: string;
  readonly description: string;
  readonly id: string;
  readonly photoData: string | null;
}

export interface ClientNotesResponse {
  readonly notes: readonly ClientNoteRecord[];
}
export interface ClientRecord {
  readonly addressLine: string | null;
  readonly birthDate: string | null;
  readonly documentNumber: string | null;
  readonly email: string | null;
  readonly fullName: string;
  readonly id: string;
  readonly labels: readonly ClientLabelRecord[];
  readonly lastName: string | null;
  readonly notes: string | null;
  readonly phone: string | null;
}

export interface ClientsResponse {
  readonly clients: readonly ClientRecord[];
}

export interface ClientDetailResponse {
  readonly client: ClientRecord;
  readonly history: ReadonlyArray<{
    readonly collaboratorName: string;
    readonly endsAt: string;
    readonly id: string;
    readonly paymentStatus: 'paid' | 'pending';
    readonly serviceName: string;
    readonly startsAt: string;
    readonly status:
      | 'cancelled'
      | 'checked_in'
      | 'completed'
      | 'confirmed'
      | 'in_progress'
      | 'no_show'
      | 'scheduled'
      | 'waiting';
  }>;
  readonly metrics: {
    readonly accumulatedCents: number;
    readonly appointmentsCount: number;
    readonly lastVisitAt: string | null;
  };
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

export interface BusinessScheduleDay {
  readonly endMinute: number;
  readonly isOpen: boolean;
  readonly startMinute: number;
  readonly weekday: number;
}

export interface BusinessScheduleResponse {
  readonly days: readonly BusinessScheduleDay[];
  readonly locationId: string;
}

export interface AppointmentRecord {
  readonly clientEmail: string | null;
  readonly clientId: string | null;
  readonly clientName: string;
  readonly clientPhone: string | null;
  readonly endsAt: string;
  readonly id: string;
  readonly locationId: string;
  readonly notes: string | null;
  readonly professionalMembershipId: string;
  readonly paymentStatus: 'paid' | 'pending';
  readonly services: ReadonlyArray<{
    readonly durationMinutes: number;
    readonly id: string;
    readonly priceCents: number;
    readonly serviceId: string;
    readonly serviceName: string;
  }>;
  readonly startsAt: string;
  readonly status:
    | 'awaiting_confirmation'
    | 'cancelled'
    | 'checked_in'
    | 'completed'
    | 'confirmed'
    | 'in_progress'
    | 'no_show'
    | 'pending_verification'
    | 'scheduled'
    | 'waiting'
    | 'expired';
  readonly source: 'manual' | 'public_booking' | 'walk_in';
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

export interface BookingSettingsResponse {
  readonly cancellationLeadMinutes: number;
  readonly confirmationDeadlineMinutes: number;
  readonly confirmationEnabled: boolean;
  readonly policyText: string;
  readonly policyVersion: number;
  readonly reminderMinutes: number;
  readonly rescheduleLeadMinutes: number;
  readonly unconfirmedAction: 'cancel' | 'keep';
}

export interface PublicBookingCatalog {
  readonly location: {
    readonly addressLine: string | null;
    readonly city: string | null;
    readonly countryCode: string;
    readonly currencyCode: string;
    readonly email: string | null;
    readonly id: string;
    readonly name: string;
    readonly phone: string;
    readonly slug: string;
    readonly timezone: string;
  };
  readonly organization: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly policy: BookingSettingsResponse;
  readonly professionals: ReadonlyArray<{
    readonly bio: string | null;
    readonly id: string;
    readonly name: string;
    readonly photoData: string | null;
    readonly serviceIds: readonly string[];
  }>;
  readonly reviews: ReadonlyArray<{
    readonly clientName: string;
    readonly comment: string | null;
    readonly createdAt: string;
    readonly id: string;
    readonly professionalName: string;
    readonly rating: number;
  }>;
  readonly services: ReadonlyArray<{
    readonly category: string | null;
    readonly description: string | null;
    readonly durationMinutes: number;
    readonly id: string;
    readonly name: string;
    readonly priceCents: number;
  }>;
}

export interface ReviewRecord {
  readonly clientName: string;
  readonly comment: string | null;
  readonly createdAt: string;
  readonly id: string;
  readonly isVisible: boolean;
  readonly professionalName: string;
  readonly rating: number;
  readonly updatedAt: string;
}

export interface ReviewsResponse {
  readonly reviews: readonly ReviewRecord[];
}

export interface AppNotificationRecord {
  readonly appointmentId: string | null;
  readonly body: string;
  readonly createdAt: string;
  readonly data: {
    readonly appointmentId?: string;
    readonly route?: string;
    readonly type?: string;
  };
  readonly id: string;
  readonly readAt: string | null;
  readonly title: string;
  readonly type:
    'appointment_cancelled' | 'appointment_created' | 'appointment_rescheduled';
}

export interface AppNotificationsResponse {
  readonly notifications: readonly AppNotificationRecord[];
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
