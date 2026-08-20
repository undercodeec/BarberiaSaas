import { z } from 'zod';

const identifierSchema = z.string().trim().min(1).max(255);
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const moneySchema = z.number().int().safe();
const nullableDateTimeSchema = isoDateTimeSchema.nullable();

const authenticatedUserSchema = z.object({
  email: z.email(),
  fullName: z.string().min(1).max(120),
  id: identifierSchema,
});

const sessionSchema = z.object({ expiresAt: isoDateTimeSchema });
const authSessionSchema = sessionSchema.extend({ token: z.string().min(32) });

export const sessionResponseSchema = z.object({
  session: sessionSchema,
  user: authenticatedUserSchema,
});

export const authResponseSchema = z.object({
  session: authSessionSchema,
  user: authenticatedUserSchema,
});

const organizationSchema = z.object({
  currencyCode: z.string().regex(/^[A-Z]{3}$/u),
  defaultTimezone: z.string().min(1).max(100),
  id: identifierSchema,
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120),
});

export const currentOrganizationResponseSchema = z.union([
  z.object({ organization: z.null() }).passthrough(),
  z.object({
    location: z
      .object({
        countryCode: z.string().regex(/^[A-Z]{2}$/u),
        currencyCode: z.string().regex(/^[A-Z]{3}$/u),
        id: identifierSchema,
        name: z.string().min(1).max(120),
        timezone: z.string().min(1).max(100),
      })
      .nullable(),
    membership: z.object({
      id: identifierSchema,
      role: z.enum(['barber', 'manager', 'owner', 'receptionist']),
      status: z.enum(['active', 'invited', 'suspended']),
    }),
    organization: organizationSchema,
  }),
]);

const cashSessionSchema = z.object({
  closedAt: nullableDateTimeSchema.optional(),
  closingAmountCents: moneySchema.nullable().optional(),
  closingNote: z.string().max(1_000).nullable().optional(),
  differenceCents: moneySchema.nullable().optional(),
  expectedAmountCents: moneySchema.nullable().optional(),
  id: identifierSchema,
  openedAt: isoDateTimeSchema,
  openingAmountCents: moneySchema,
  responsibleName: z.string().min(1).max(120),
  status: z.enum(['open', 'closed']),
});

const cashMovementSchema = z.object({
  amountCents: moneySchema,
  appointmentId: identifierSchema.nullable(),
  createdAt: isoDateTimeSchema,
  description: z.string().max(500),
  id: identifierSchema,
  paymentMethod: z.enum(['card', 'cash', 'other', 'transfer']).nullable(),
  productId: identifierSchema.nullable(),
  productQuantity: z.number().int().positive().nullable(),
  professionalMembershipId: identifierSchema.nullable(),
  reversalReason: z.string().max(500).nullable(),
  reversedAt: nullableDateTimeSchema,
  serviceId: identifierSchema.nullable(),
  type: z.enum([
    'commission_settlement',
    'deposit',
    'expense',
    'other_income',
    'professional_advance',
    'professional_advance_reversal',
    'sale',
    'withdrawal',
  ]),
});

const cashTotalsSchema = z.object({
  advanceReversals: moneySchema,
  card: moneySchema,
  cash: moneySchema,
  cashSales: moneySchema,
  commissionSettlements: moneySchema,
  deposits: moneySchema,
  expectedCash: moneySchema,
  expenses: moneySchema,
  other: moneySchema,
  otherIncome: moneySchema,
  professionalAdvances: moneySchema,
  sales: moneySchema,
  transfers: moneySchema,
  withdrawals: moneySchema,
});

const currentCashRegisterResponseSchema = z.object({
  session: cashSessionSchema.nullable(),
});
const cashRegisterSummaryResponseSchema = z.object({
  movements: z.array(cashMovementSchema),
  session: cashSessionSchema.nullable(),
  totals: cashTotalsSchema.nullable(),
});
const cashRegisterHistoryResponseSchema = z.object({
  sessions: z.array(cashSessionSchema.extend({ totals: cashTotalsSchema })),
});
const cashRegisterDetailResponseSchema = z.object({
  movements: z.array(cashMovementSchema),
  session: cashSessionSchema,
  totals: cashTotalsSchema,
});

const professionalAdvanceSchema = z.object({
  availableAmountCents: moneySchema,
  createdAt: isoDateTimeSchema,
  deductedAmountCents: moneySchema,
  id: identifierSchema,
  notes: z.string().max(1_000).nullable(),
  occurredAt: isoDateTimeSchema,
  originalAmountCents: moneySchema,
  outstandingAmountCents: moneySchema,
  paymentMethod: z.enum(['cash', 'other', 'transfer']),
  professionalMembershipId: identifierSchema,
  reference: z.string().max(255).nullable(),
  reservedAmountCents: moneySchema,
  reversalReason: z.string().max(500).nullable(),
  reversedAt: nullableDateTimeSchema,
  status: z.enum([
    'fully_deducted',
    'partially_deducted',
    'pending',
    'reversed',
  ]),
});

const commissionSettlementSchema = z.object({
  advanceDeductionCents: moneySchema,
  adjustmentCents: moneySchema,
  approvedAt: nullableDateTimeSchema,
  cancelledAt: nullableDateTimeSchema,
  commissionAmountCents: moneySchema,
  createdAt: isoDateTimeSchema,
  grossGeneratedCents: moneySchema,
  id: identifierSchema,
  notes: z.string().max(1_000).nullable(),
  paidAt: nullableDateTimeSchema,
  paymentMethod: z.enum(['cash', 'other', 'transfer']).nullable(),
  paymentReference: z.string().max(255).nullable(),
  periodEnd: z.iso.date(),
  periodStart: z.iso.date(),
  professionalMembershipId: identifierSchema,
  status: z.enum(['approved', 'cancelled', 'draft', 'paid']),
  totalPayableCents: moneySchema,
});

const commissionOverviewResponseSchema = z.object({
  advances: z.array(professionalAdvanceSchema),
  entries: z.array(
    z.object({
      amountCents: moneySchema,
      baseAmountCents: moneySchema,
      calculationSnapshot: z.unknown(),
      id: identifierSchema,
      occurredAt: isoDateTimeSchema,
      professionalMembershipId: identifierSchema,
      reversalOfEntryId: identifierSchema.nullable(),
      settlementId: identifierSchema.nullable(),
      status: z.enum(['approved', 'pending', 'reversed', 'settled']),
    }),
  ),
  professionals: z.array(
    z.object({
      availableAdvanceCents: moneySchema,
      commissionPendingCents: moneySchema,
      id: identifierSchema,
      name: z.string().min(1).max(120),
      outstandingAdvanceCents: moneySchema,
    }),
  ),
  settlements: z.array(commissionSettlementSchema),
});

const payphoneConfigurationResponseSchema = z.object({
  configuration: z
    .object({
      connectedAt: nullableDateTimeSchema,
      isEnabled: z.boolean(),
      lastTestedAt: nullableDateTimeSchema,
      status: z.enum(['connected', 'error', 'requires_attention']),
      storeIdHint: z.string().max(255),
    })
    .nullable(),
  encryptionConfigured: z.boolean(),
});

const movementResponseSchema = z.object({ movement: cashMovementSchema });
const advanceResponseSchema = z.object({ advance: professionalAdvanceSchema });
const settlementResponseSchema = z.object({
  settlement: commissionSettlementSchema,
});

export class MobileResponseValidationError extends Error {
  public readonly code = 'INVALID_API_RESPONSE';

  public constructor(public readonly path: string) {
    super('La respuesta del servidor no tiene el formato esperado.');
    this.name = 'MobileResponseValidationError';
  }
}

function responseSchemaForPath(path: string): z.ZodType | null {
  if (path === '/v1/auth/session') return sessionResponseSchema;
  if (path === '/v1/auth/login' || path === '/v1/auth/verify-email')
    return authResponseSchema;
  if (path === '/v1/organizations/current')
    return currentOrganizationResponseSchema;
  if (
    path === '/v1/cash-register/current' ||
    path === '/v1/cash-register/open' ||
    path === '/v1/cash-register/close'
  )
    return currentCashRegisterResponseSchema;
  if (path === '/v1/cash-register/summary')
    return cashRegisterSummaryResponseSchema;
  if (path === '/v1/cash-register/history')
    return cashRegisterHistoryResponseSchema;
  if (path.startsWith('/v1/cash-register/sessions/'))
    return cashRegisterDetailResponseSchema;
  if (path === '/v1/cash-register/movements') return movementResponseSchema;
  if (path === '/v1/commissions/overview')
    return commissionOverviewResponseSchema;
  if (path === '/v1/commissions/advances') return advanceResponseSchema;
  if (path === '/v1/commissions/settlements') return settlementResponseSchema;
  if (path.startsWith('/v1/payphone/configuration'))
    return payphoneConfigurationResponseSchema;
  return null;
}

export function validateMobileApiResponse(
  path: string,
  payload: unknown,
): unknown {
  if (payload === undefined) return payload;
  const schema = responseSchemaForPath(path);
  if (!schema) return payload;
  const result = schema.safeParse(payload);
  if (!result.success) throw new MobileResponseValidationError(path);
  return result.data;
}
