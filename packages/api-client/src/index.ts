export interface ApiRequestOptions {
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  readonly responseType?: 'json' | 'text';
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
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
  readonly onAuthenticationFailure?: (
    error: ApiClientError,
  ) => Promise<void> | void;
  readonly timeoutMs?: number;
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
  readonly canCloseOwnedBusiness: boolean;
  readonly addressLine: string | null;
  readonly businessLocation: BusinessLocation | null;
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

export interface BusinessLocation {
  readonly addressLine: string | null;
  readonly city: string | null;
  readonly countryCode: string;
  readonly formattedAddress: string | null;
  readonly googlePlaceId: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface GoogleMapsLocationCandidate {
  readonly city: string | null;
  readonly countryCode: string | null;
  readonly displayName: string | null;
  readonly formattedAddress: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly placeId: string;
}

export interface GoogleMapsSuggestion {
  readonly mainText: string;
  readonly placeId: string;
  readonly secondaryText: string;
  readonly text: string;
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
  readonly productId: string | null;
  readonly productQuantity: number | null;
  readonly professionalMembershipId: string | null;
  readonly reversalReason: string | null;
  readonly reversedAt: string | null;
  readonly serviceId: string | null;
  readonly type:
    | 'commission_settlement'
    | 'deposit'
    | 'expense'
    | 'other_income'
    | 'professional_advance'
    | 'professional_advance_reversal'
    | 'sale'
    | 'withdrawal';
}

export interface CashRegisterTotals {
  readonly advanceReversals: number;
  readonly card: number;
  readonly cash: number;
  readonly cashSales: number;
  readonly commissionSettlements: number;
  readonly deposits: number;
  readonly expectedCash: number;
  readonly expenses: number;
  readonly other: number;
  readonly otherIncome: number;
  readonly professionalAdvances: number;
  readonly sales: number;
  readonly transfers: number;
  readonly withdrawals: number;
}

export interface CommissionProfessionalSummary {
  readonly availableAdvanceCents: number;
  readonly commissionPendingCents: number;
  readonly id: string;
  readonly name: string;
  readonly outstandingAdvanceCents: number;
}

export interface ProfessionalAdvanceRecord {
  readonly availableAmountCents: number;
  readonly createdAt: string;
  readonly deductedAmountCents: number;
  readonly id: string;
  readonly notes: string | null;
  readonly occurredAt: string;
  readonly originalAmountCents: number;
  readonly outstandingAmountCents: number;
  readonly paymentMethod: 'cash' | 'other' | 'transfer';
  readonly professionalMembershipId: string;
  readonly reference: string | null;
  readonly reservedAmountCents: number;
  readonly reversalReason: string | null;
  readonly reversedAt: string | null;
  readonly status:
    'fully_deducted' | 'partially_deducted' | 'pending' | 'reversed';
}

export interface CommissionSettlementRecord {
  readonly advanceDeductionCents: number;
  readonly adjustmentCents: number;
  readonly approvedAt: string | null;
  readonly cancelledAt: string | null;
  readonly commissionAmountCents: number;
  readonly createdAt: string;
  readonly grossGeneratedCents: number;
  readonly id: string;
  readonly notes: string | null;
  readonly paidAt: string | null;
  readonly paymentMethod: 'cash' | 'other' | 'transfer' | null;
  readonly paymentReference: string | null;
  readonly periodEnd: string;
  readonly periodStart: string;
  readonly professionalMembershipId: string;
  readonly status: 'approved' | 'cancelled' | 'draft' | 'paid';
  readonly totalPayableCents: number;
}

export interface CommissionOverviewResponse {
  readonly advances: readonly ProfessionalAdvanceRecord[];
  readonly entries: ReadonlyArray<{
    readonly amountCents: number;
    readonly baseAmountCents: number;
    readonly calculationSnapshot: unknown;
    readonly id: string;
    readonly occurredAt: string;
    readonly professionalMembershipId: string;
    readonly reversalOfEntryId: string | null;
    readonly settlementId: string | null;
    readonly status: 'approved' | 'pending' | 'reversed' | 'settled';
  }>;
  readonly professionals: readonly CommissionProfessionalSummary[];
  readonly settlements: readonly CommissionSettlementRecord[];
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

export interface InventoryProduct {
  readonly barcode: string | null;
  readonly costCents: number;
  readonly createdAt: string;
  readonly currencyCode: string;
  readonly id: string;
  readonly imageData: string | null;
  readonly isActive: boolean;
  readonly isLowStock: boolean;
  readonly minimumStock: number;
  readonly name: string;
  readonly quantityOnHand: number;
  readonly salePriceCents: number;
  readonly sku: string | null;
  readonly stockTrackingEnabled: boolean;
  readonly updatedAt: string;
}

export interface InventoryResponse {
  readonly accessibleLocations: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly currencyCode: string;
  readonly locationId: string;
  readonly products: readonly InventoryProduct[];
  readonly summary: {
    readonly activeProducts: number;
    readonly inventoryCostCents: number;
    readonly lowStockProducts: number;
    readonly totalUnits: number;
  };
}

export interface ProductOrderRecord {
  readonly customerEmail: string | null;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly createdAt: string;
  readonly currencyCode: string;
  readonly expiresAt: string;
  readonly fulfilledAt: string | null;
  readonly id: string;
  readonly items: ReadonlyArray<{
    readonly productId: string;
    readonly productName: string;
    readonly quantity: number;
    readonly unitPriceCents: number;
  }>;
  readonly paidAt: string | null;
  readonly paymentMethod: 'card' | 'pickup' | 'transfer';
  readonly paymentReference: string | null;
  readonly paymentUrl: string | null;
  readonly readyAt: string | null;
  readonly status:
    | 'cancelled'
    | 'expired'
    | 'fulfilled'
    | 'paid'
    | 'pending_payment'
    | 'ready_for_pickup'
    | 'reserved';
  readonly totalCents: number;
}

export interface ProductOrdersResponse {
  readonly orders: readonly ProductOrderRecord[];
}

export interface StockMovementRecord {
  readonly cashMovementId: string | null;
  readonly cashMovementReversedAt: string | null;
  readonly createdAt: string;
  readonly direction: 'in' | 'out';
  readonly id: string;
  readonly notes: string | null;
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly resultingQuantity: number;
  readonly type:
    'adjustment' | 'loss' | 'opening' | 'purchase' | 'return' | 'sale';
  readonly unitCostCents: number | null;
}

export interface StockMovementHistoryResponse {
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
  };
  readonly rows: readonly StockMovementRecord[];
}

export interface DailyReportResponse {
  readonly accessibleLocations: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly appointments: {
    readonly attended: number;
    readonly cancelled: number;
    readonly noShow: number;
    readonly paid: number;
    readonly paidScheduledValueCents: number;
    readonly total: number;
  };
  readonly cashClosures: {
    readonly closingAmountCents: number;
    readonly count: number;
    readonly differenceCents: number;
    readonly expectedAmountCents: number;
  };
  readonly collections: {
    readonly cardCents: number;
    readonly cashCents: number;
    readonly otherCents: number;
    readonly totalCents: number;
    readonly transferCents: number;
  };
  readonly currencyCode: string;
  readonly expenses: ReadonlyArray<{
    readonly amountCents: number;
    readonly count: number;
    readonly description: string;
  }>;
  readonly period: {
    readonly from: string;
    readonly locationId: string | null;
    readonly locationName: string;
    readonly preset: 'last_7_days' | 'last_30_days' | 'this_month' | 'today';
    readonly to: string;
  };
  readonly products: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly quantity: number;
    readonly revenueCents: number;
  }>;
  readonly professionals: ReadonlyArray<{
    readonly commissionCents: number;
    readonly completedAppointments: number;
    readonly id: string;
    readonly name: string;
    readonly saleCount: number;
    readonly salesCents: number;
  }>;
  readonly services: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly quantity: number;
    readonly scheduledValueCents: number;
  }>;
  readonly sales: {
    readonly averageTicketCents: number;
    readonly grossCents: number;
    readonly transactionCount: number;
  };
}

export interface BusinessSummaryResponse {
  readonly accessibleLocations: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly commissions: {
    readonly productsGeneratedCents: number;
    readonly servicesGeneratedCents: number;
    readonly totalGeneratedCents: number;
  };
  readonly currencyCode: string;
  readonly details: {
    readonly expenses: ReadonlyArray<{
      readonly amountCents: number;
      readonly count: number;
      readonly description: string;
    }>;
    readonly otherIncome: ReadonlyArray<{
      readonly amountCents: number;
      readonly count: number;
      readonly description: string;
    }>;
    readonly products: ReadonlyArray<{
      readonly id: string;
      readonly name: string;
      readonly quantity: number;
      readonly revenueCents: number;
    }>;
    readonly services: ReadonlyArray<{
      readonly id: string;
      readonly name: string;
      readonly quantity: number;
      readonly scheduledValueCents: number;
    }>;
  };
  readonly expenses: {
    readonly collaboratorPaymentsCents: number;
    readonly operatingCents: number;
    readonly totalCents: number;
  };
  readonly income: {
    readonly otherIncomeCents: number;
    readonly salesCents: number;
    readonly totalCents: number;
  };
  readonly netResultCents: number;
  readonly period: {
    readonly from: string;
    readonly locationId: string | null;
    readonly locationName: string;
    readonly preset: 'last_7_days' | 'last_30_days' | 'this_month' | 'today';
    readonly to: string;
  };
  readonly sales: {
    readonly averageTicketCents: number;
    readonly grossCents: number;
    readonly productsCents: number;
    readonly servicesCents: number;
    readonly transactionCount: number;
    readonly uncategorizedCents: number;
  };
  readonly withdrawalsCents: number;
}

export interface MovementReportResponse {
  readonly accessibleLocations: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
  };
  readonly period: {
    readonly from: string;
    readonly to: string;
  };
  readonly rows: ReadonlyArray<{
    readonly amountCents: number;
    readonly appointmentId: string | null;
    readonly clientName: string | null;
    readonly createdAt: string;
    readonly createdByName: string;
    readonly description: string;
    readonly id: string;
    readonly locationId: string | null;
    readonly locationName: string;
    readonly paymentMethod: 'card' | 'cash' | 'other' | 'transfer' | null;
    readonly productName: string | null;
    readonly professionalName: string | null;
    readonly serviceName: string | null;
    readonly type: 'deposit' | 'expense' | 'other_income' | 'sale';
  }>;
  readonly totalAmountCents: number;
}

export interface PayphoneConfiguration {
  readonly connectedAt: string | null;
  readonly isEnabled: boolean;
  readonly lastTestedAt: string | null;
  readonly status: 'connected' | 'error' | 'requires_attention';
  readonly storeIdHint: string;
}

export interface PayphoneConfigurationResponse {
  readonly configuration: PayphoneConfiguration | null;
  readonly encryptionConfigured: boolean;
}
export interface ApiMessageResponse {
  readonly message: string;
  // Reserved for future shared message fields.
}

export interface CurrentOrganizationResponse {
  readonly location: {
    readonly countryCode: string;
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

export interface ManagedLocation {
  readonly addressLine: string | null;
  readonly city: string | null;
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly formattedAddress: string | null;
  readonly googlePlaceId: string | null;
  readonly id: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly name: string;
  readonly phone: string;
  readonly slug: string;
  readonly timezone: string;
}

export interface ManagedLocationsResponse {
  readonly canAdd: boolean;
  readonly limit: number;
  readonly locations: readonly ManagedLocation[];
  readonly used: number;
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
    readonly onlineBookingEnabled: boolean;
  }>;
  readonly planAvailable: boolean;
  readonly role: 'barber' | 'manager' | 'owner' | 'receptionist';
  readonly status: 'active';
  readonly user: AuthenticatedUser;
}

export interface TeamResponse {
  readonly members: readonly TeamMember[];
  readonly teamEnabled: boolean;
  readonly pendingInvitations: ReadonlyArray<{
    readonly activationStatus: 'pending_acceptance';
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
  readonly description: string | null;
  readonly durationMinutes: number;
  readonly id: string;
  readonly imageData: string | null;
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

export interface SubscriptionFeatureFlags {
  readonly commissions: boolean;
  readonly inventory: boolean;
  readonly multiLocation: boolean;
  readonly publicBooking: boolean;
  readonly reports: boolean;
  readonly team: boolean;
  readonly wallet: boolean;
}

export interface SubscriptionPlanRecord {
  readonly available: boolean;
  readonly code: 'essential' | 'free' | 'local' | 'multi';
  readonly currencyCode: string;
  readonly featureFlags: SubscriptionFeatureFlags;
  readonly features: readonly string[];
  readonly limits: {
    readonly clients: number | null;
    readonly locations: number;
    readonly rolling30DayBookings: number | null;
    readonly teamMembers: number | null;
  };
  readonly monthlyPriceCents: number | null;
  readonly name: string;
}

export interface SubscriptionResponse {
  readonly current: {
    readonly canManage: boolean;
    readonly currentPeriodEnd: string;
    readonly currentPeriodStart: string;
    readonly featureFlags: SubscriptionFeatureFlags;
    readonly graceEndsAt: string | null;
    readonly planCode: 'essential' | 'free' | 'local' | 'multi';
    readonly readOnly: boolean;
    readonly simulationAvailable: boolean;
    readonly status:
      'active' | 'cancelled' | 'free' | 'past_due' | 'suspended' | 'trial';
    readonly trialEndsAt: string | null;
  };
  readonly plans: readonly SubscriptionPlanRecord[];
  readonly usage: {
    readonly bookingLimit: number | null;
    readonly bookingWindowStartsAt: string;
    readonly clients: number;
    readonly clientLimit: number | null;
    readonly graceAvailable: boolean;
    readonly graceBookings: number;
    readonly graceUsed: boolean;
    readonly locations: number;
    readonly rolling30DayBookings: number;
    readonly teamMemberLimit: number | null;
    readonly teamMembers: number;
  };
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
  readonly unavailableSlots: ReadonlyArray<{
    readonly endsAt: string;
    readonly reason: 'blocked' | 'occupied';
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
  readonly bookingAvailability: {
    readonly canCreate: boolean;
    readonly message: string | null;
  };
  readonly location: {
    readonly addressLine: string | null;
    readonly city: string | null;
    readonly countryCode: string;
    readonly currencyCode: string;
    readonly email: string | null;
    readonly formattedAddress: string | null;
    readonly googlePlaceId: string | null;
    readonly id: string;
    readonly latitude: number | null;
    readonly longitude: number | null;
    readonly name: string;
    readonly phone: string;
    readonly slug: string;
    readonly timezone: string;
  };
  readonly organization: {
    readonly profilePhotoData: string | null;
    readonly id: string;
    readonly coverImageUri: string | null;
    readonly description: string | null;
    readonly facebookUrl: string | null;
    readonly instagramUrl: string | null;
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
  readonly products: ReadonlyArray<{
    readonly id: string;
    readonly imageData: string | null;
    readonly isAvailable: boolean;
    readonly name: string;
    readonly priceCents: number;
  }>;
  readonly services: ReadonlyArray<{
    readonly category: string | null;
    readonly description: string | null;
    readonly durationMinutes: number;
    readonly id: string;
    readonly imageData: string | null;
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
    readonly appointmentStartsAt?: string;
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
      const timeoutMs = options.timeoutMs ?? config.timeoutMs;
      const timeoutController =
        timeoutMs && timeoutMs > 0 ? new AbortController() : null;
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const abortForCaller = () => timeoutController?.abort();
      if (options.signal && timeoutController) {
        if (options.signal.aborted) timeoutController.abort();
        else
          options.signal.addEventListener('abort', abortForCaller, {
            once: true,
          });
      }
      if (timeoutController) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          timeoutController.abort();
        }, timeoutMs);
        requestInit.signal = timeoutController.signal;
      } else if (options.signal !== undefined) {
        requestInit.signal = options.signal;
      }

      let response: Response;
      try {
        response = await fetchImplementation(
          `${baseUrl}/${path.replace(/^\//u, '')}`,
          requestInit,
        );
      } catch (error) {
        if (timedOut)
          throw new ApiClientError(
            408,
            'REQUEST_TIMEOUT',
            'La solicitud demoró demasiado. Verifica tu conexión e inténtalo nuevamente.',
          );
        throw error;
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        if (options.signal && timeoutController)
          options.signal.removeEventListener('abort', abortForCaller);
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          code?: string;
          message?: string;
        } | null;
        const apiError = new ApiClientError(
          response.status,
          payload?.code ?? 'REQUEST_FAILED',
          payload?.message ??
            'No fue posible completar la solicitud. Inténtalo nuevamente.',
        );
        if (response.status === 401 || response.status === 403) {
          await Promise.resolve(
            config.onAuthenticationFailure?.(apiError),
          ).catch(() => undefined);
        }
        throw apiError;
      }

      if (response.status === 204) return undefined as TResponse;
      if (options.responseType === 'text')
        return response.text() as Promise<TResponse>;
      return response.json() as Promise<TResponse>;
    },
  };
}
