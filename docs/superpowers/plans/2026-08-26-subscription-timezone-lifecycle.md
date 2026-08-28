# Subscription Timezone Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make subscription payment auditing, renewal, grace, expiry, and admin display deterministic across organization time zones.

**Architecture:** Persist all commercial instants in UTC and compare only UTC instants for entitlement changes. Store the organization IANA zone as a snapshot on each invoice and subscription-change event; API clients format each instant with that snapshot. A minute-level idempotent reconciler transitions `ACTIVE → PAST_DUE → FREE` after the existing three-day grace period and creates audit history.

**Tech Stack:** PostgreSQL/Prisma, Fastify, Zod, TypeScript, React/Next.js, React Native/Expo, Vitest/Jest, `@vvo/tzdb`.

**Spec:** `docs/superpowers/specs/2026-08-26-subscription-timezone-lifecycle-design.md`

## Global Constraints

- Store and compare payment, period, and grace instants as UTC `timestamptz` values.
- Keep the commercial cycle at exactly 30 days (720 hours) and grace at exactly 3 days (72 hours).
- Use an IANA organization timezone for display and notifications; never use the administrator browser timezone for subscription data.
- Do not treat a return URL or raw webhook as a payment approval; confirm the transaction with PayPhone before applying a plan.
- Never invent a provider payment timestamp. Preserve `null` when PayPhone does not return one and label Nava verification separately.
- Preserve historical timezone snapshots when an organization changes its current timezone.

---

### Task 1: Persist subscription audit timezone and provider time

**Files:**
- Modify: `packages/database/prisma/schema.prisma:943-1166`
- Create: `packages/database/prisma/migrations/<timestamp>_subscription_time_audit/migration.sql`
- Modify: `apps/api/src/subscription-payments.ts:45-655`
- Test: `apps/api/src/subscription-payments.test.ts`

**Interfaces:**
- Produces `SubscriptionInvoice.billingTimezone: string`, `SubscriptionInvoice.providerPaidAt: Date | null`, and `SubscriptionChange.billingTimezone: string`.
- Extends `VerifiedPlatformPayment` with `providerPaidAt?: Date | null`.
- `applyVerifiedPlatformPayment(database, payment)` writes audit timestamps without changing the UTC period calculation.

- [ ] **Step 1: Write failing payment-audit tests**

```ts
it('snapshots the business timezone and keeps provider time distinct from verification', async () => {
  const verifiedAt = new Date('2026-08-26T21:15:00.000Z');
  const providerPaidAt = new Date('2026-08-26T21:12:31.000Z');

  await applyVerifiedPlatformPayment(database, {
    amountCents: 983,
    currencyCode: 'USD',
    internalReference: attempt.internalReference,
    payload: {},
    providerPaidAt,
    providerTransactionId: '9001',
    status: 'approved',
    storeId: attempt.storeId,
    verifiedAt,
  });

  expect(invoice.billingTimezone).toBe('America/Lima');
  expect(invoice.providerPaidAt).toEqual(providerPaidAt);
  expect(paymentAttempt.appliedAt).toEqual(verifiedAt);
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the columns and fields do not exist**

Run: `pnpm --filter @barber-saas/api test -- subscription-payments.test.ts`

Expected: failure referring to missing `billingTimezone` or `providerPaidAt`.

- [ ] **Step 3: Add the schema and safe migration**

Add nullable columns first, backfill from `organizations.default_timezone`, then make `billing_timezone` non-null for new and existing invoices/changes. Keep `provider_paid_at` nullable.

```sql
ALTER TABLE "subscription_invoices"
  ADD COLUMN "billing_timezone" VARCHAR(64),
  ADD COLUMN "provider_paid_at" TIMESTAMPTZ(3);
ALTER TABLE "subscription_changes"
  ADD COLUMN "billing_timezone" VARCHAR(64);

UPDATE "subscription_invoices" invoice
SET "billing_timezone" = organization."default_timezone"
FROM "organizations" organization
WHERE invoice."organization_id" = organization."id"
  AND invoice."billing_timezone" IS NULL;
```

Set `billingTimezone: organization.defaultTimezone` when creating an invoice and change. Set `providerPaidAt` only from `payment.providerPaidAt ?? null`; retain `now = payment.verifiedAt ?? new Date()` for `paidAt`, `approvedAt`, and `appliedAt`.

- [ ] **Step 4: Run the focused test and Prisma validation**

Run: `pnpm --filter @barber-saas/database db:generate && pnpm --filter @barber-saas/api test -- subscription-payments.test.ts`

Expected: payment audit test passes and existing payment tests remain green.

- [ ] **Step 5: Commit the isolated persistence change**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations apps/api/src/subscription-payments.ts apps/api/src/subscription-payments.test.ts
git commit -m "feat(subscriptions): auditar zona y hora de pago"
```

### Task 2: Capture and manage a valid organization timezone

**Files:**
- Modify: `packages/validation/src/index.ts:98-128, 181-202`
- Modify: `packages/validation/src/index.test.ts`
- Modify: `apps/api/src/app.ts:1034-1120, 2322-2342, 2033-2167`
- Modify: `packages/api-client/src/index.ts` (registration and account-detail contracts)
- Modify: `apps/mobile/package.json`, `apps/web/package.json`, `pnpm-lock.yaml`
- Create: `apps/mobile/src/lib/timezones.ts`
- Create: `apps/web/app/checkout/timezones.ts`
- Modify: `apps/mobile/src/components/RegistrationFlow.tsx`
- Modify: `apps/web/app/checkout/CheckoutExperience.tsx`
- Modify: `apps/mobile/app/(onboarding)/profile-edit.tsx`
- Test: `apps/mobile/src/lib/timezones.test.ts`, `apps/web/app/checkout/timezones.test.ts`, `packages/validation/src/index.test.ts`

**Interfaces:**
- `SignUpInput` gains `timezone: string`.
- Account-detail read/update payloads gain `timezone: string`.
- `detectTimezone(): string` returns the device zone when it is in `timeZonesNames`, otherwise `America/Guayaquil`.
- `TIMEZONE_OPTIONS` is built from `@vvo/tzdb` IANA values and presented as `name — city`.

- [ ] **Step 1: Add failing validation and timezone-helper tests**

```ts
expect(signUpSchema.safeParse({ ...validSignUp, timezone: 'America/Lima' }).success).toBe(true);
expect(signUpSchema.safeParse({ ...validSignUp, timezone: 'UTC+5' }).success).toBe(false);
expect(detectTimezone(() => 'Europe/Madrid')).toBe('Europe/Madrid');
expect(detectTimezone(() => 'Invalid/Zone')).toBe('America/Guayaquil');
```

- [ ] **Step 2: Verify the tests fail before adding the new input and helper**

Run: `pnpm --filter @barber-saas/validation test -- index.test.ts`

Expected: the valid registration test fails because `timezone` is not accepted or persisted.

- [ ] **Step 3: Implement server validation, registration persistence, and reusable selectors**

Add `timezoneSchema` using the existing `Intl.DateTimeFormat(..., { timeZone })` validation pattern. Extend signup and account-details validation/contracts; create organization and principal location with `input.timezone` rather than the fixed `America/Guayaquil` literal.

Install `@vvo/tzdb@6.198.0` in mobile and web. Each UI helper uses its packaged `timeZonesNames` list, so native devices do not depend on `Intl.supportedValuesOf` support.

```ts
export function detectTimezone(readDeviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const timezone = readDeviceZone();
  return timeZonesNames.includes(timezone) ? timezone : 'America/Guayaquil';
}
```

Add a required timezone control after country/city in both registration flows, defaulted by `detectTimezone`. Add the same control to business profile editing; it changes only `Organization.defaultTimezone` and the primary `Location.timezone` for future operations.

- [ ] **Step 4: Run validation, mobile, and web tests**

Run: `pnpm --filter @barber-saas/validation test && pnpm --filter @barber-saas/mobile test -- timezones.test.ts && pnpm --filter @barber-saas/web test -- timezones.test.ts`

Expected: valid IANA zones pass, invalid zones fail, and detection fallback is deterministic.

- [ ] **Step 5: Commit timezone capture and management**

```bash
git add packages/validation packages/api-client apps/api/src/app.ts apps/mobile apps/web pnpm-lock.yaml
git commit -m "feat(registration): guardar zona horaria del negocio"
```

### Task 3: Make lifecycle transitions auditable and minute-accurate

**Files:**
- Modify: `apps/api/src/subscription-policy.ts:237-396`
- Modify: `apps/api/src/subscription-policy.test.ts`
- Modify: `apps/api/src/app.ts:2826-2868`

**Interfaces:**
- `reconcileSubscriptionLifecycle(database, now)` creates one `SubscriptionChange` for each successful state transition.
- `transitionSubscriptionToPastDue` and `transitionSubscriptionToFree` use conditional `updateMany` status guards and return whether a transition occurred.
- Reconciliation runs on startup and every `60_000` milliseconds.

- [ ] **Step 1: Write failing lifecycle audit tests**

```ts
it('records one timezone-snapshotted grace event and one free downgrade after 72 hours', async () => {
  const periodEnd = new Date('2026-10-01T18:00:00.000Z');

  await reconcileSubscriptionLifecycle(database, periodEnd);
  expect(subscription.status).toBe(SubscriptionStatus.PAST_DUE);
  expect(change).toMatchObject({
    billingTimezone: 'America/New_York',
    reason: 'El período pagado venció; inició la gracia de 3 días.',
  });

  await reconcileSubscriptionLifecycle(database, new Date('2026-10-04T18:00:00.000Z'));
  expect(subscription.status).toBe(SubscriptionStatus.FREE);
});
```

- [ ] **Step 2: Run the focused lifecycle tests and verify missing audit history**

Run: `pnpm --filter @barber-saas/api test -- subscription-policy.test.ts`

Expected: failure because automatic lifecycle transitions do not currently create `SubscriptionChange` records.

- [ ] **Step 3: Implement conditional transitions and change records**

Keep all comparisons against UTC `now`. Compute `graceEndsAt` as `currentPeriodEnd.getTime() + 3 * 24 * 60 * 60 * 1000`. In the same transaction, create an event only when its conditional status update succeeds.

```ts
const transitioned = await transaction.subscription.updateMany({
  data: { graceEndsAt, status: SubscriptionStatus.PAST_DUE, trialEndsAt: null },
  where: { id: subscription.id, status: SubscriptionStatus.ACTIVE },
});
if (transitioned.count === 1) {
  await transaction.subscriptionChange.create({ data: { /* exact previous/new UTC boundaries and billingTimezone */ } });
}
```

Change the existing lifecycle timer from one hour to one minute, preserve startup reconciliation, and log candidate count plus failures without stopping the next run.

- [ ] **Step 4: Run focused lifecycle tests**

Run: `pnpm --filter @barber-saas/api test -- subscription-policy.test.ts`

Expected: lifecycle tests prove `ACTIVE → PAST_DUE → FREE`, three-day grace, UTC boundaries, and idempotent audit rows.

- [ ] **Step 5: Commit lifecycle reconciliation**

```bash
git add apps/api/src/subscription-policy.ts apps/api/src/subscription-policy.test.ts apps/api/src/app.ts
git commit -m "feat(subscriptions): auditar vencimiento y gracia"
```

### Task 4: Confirm PayPhone server-side and expose honest payment timing

**Files:**
- Modify: `apps/api/src/payphone-web-button.ts`
- Modify: `apps/api/src/payphone-web-button.test.ts`
- Modify: `apps/api/src/subscription-payments.ts:83-248, 700-735, 1019-1115`
- Modify: `apps/api/src/subscription-payments.test.ts`

**Interfaces:**
- `PayphoneWebButtonConfirmation` adds `providerPaidAt: Date | null` only if the documented provider response has a parseable timestamp.
- The platform webhook records receipt, calls `confirmPayment`, and invokes `applyVerifiedPlatformPayment` only after reference, amount, currency, store, and approval validation succeed.

- [ ] **Step 1: Add failing webhook tests**

```ts
it('does not activate from an approved webhook until PayPhone confirmation matches', async () => {
  await app.inject({ method: 'POST', url: '/v1/webhooks/payphone/platform', payload: approvedWebhook });
  expect(await database.subscriptionPaymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({
    status: SubscriptionPaymentStatus.PENDING_PROVIDER,
  });
});

it('applies a matching server-confirmed webhook once and preserves null providerPaidAt when absent', async () => {
  // provider override returns the matching verified payment with providerPaidAt: null
});
```

- [ ] **Step 2: Run webhook tests and observe that webhooks are audit-only**

Run: `pnpm --filter @barber-saas/api test -- subscription-payments.test.ts payphone-web-button.test.ts`

Expected: test demonstrates the current webhook path records `WEBHOOK_AUXILIARY` but cannot apply the payment.

- [ ] **Step 3: Implement confirmed webhook handling without trusting its payload**

Reuse the same provider confirmation and `applyVerifiedPlatformPayment` path as `/v1/subscription/payments/confirm`. The webhook payload supplies only `ClientTransactionId` and `TransactionId`; all amounts/statuses used to grant access come from the server-to-server confirmation. Extend `confirmResponseSchema` only after checking the documented PayPhone response field and parse it with `z.coerce.date().nullable().optional()`. If absent or invalid, return `providerPaidAt: null`.

- [ ] **Step 4: Run provider and payment tests**

Run: `pnpm --filter @barber-saas/api test -- payphone-web-button.test.ts subscription-payments.test.ts`

Expected: a forged/mismatched webhook never activates access; a verified webhook is idempotent and records provider time only when supplied.

- [ ] **Step 5: Commit server-side payment confirmation**

```bash
git add apps/api/src/payphone-web-button.ts apps/api/src/payphone-web-button.test.ts apps/api/src/subscription-payments.ts apps/api/src/subscription-payments.test.ts
git commit -m "fix(payments): verificar webhooks de suscripción"
```

### Task 5: Render platform subscription data in its commercial timezone

**Files:**
- Modify: `apps/api/src/operations.ts:2142-2325`
- Modify: `apps/admin/app/platform-api.ts:51-99`
- Modify: `apps/admin/app/PlatformSubscriptions.tsx:10-278`
- Create: `apps/admin/app/PlatformSubscriptions.test.tsx`

**Interfaces:**
- Platform response exposes `billingTimezone`, `providerPaidAt`, `appliedAt`, `graceEndsAt`, and timezone on history entries.
- `formatSubscriptionDate(value, timezone)` formats with `{ timeZone: timezone }` and returns `—` for null.

- [ ] **Step 1: Write failing admin formatter/component tests**

```tsx
it('formats paid, verified, grace, and history dates in the invoice snapshot timezone', () => {
  expect(formatSubscriptionDate('2026-08-26T21:15:00.000Z', 'America/Lima'))
    .toContain('4:15 p. m.');
});

it('labels a missing provider timestamp instead of presenting verification as payment time', () => {
  render(<PlatformSubscriptions {...propsWithNullProviderPaidAt} />);
  expect(screen.getByText('Pago proveedor: No informado por PayPhone')).toBeTruthy();
});
```

- [ ] **Step 2: Run the admin test and verify it fails with the current browser-local formatting**

Run: `pnpm --filter @barber-saas/admin test -- PlatformSubscriptions.test.tsx`

Expected: failure because latest invoice/payment/history have no timezone snapshot in the contract and are formatted without a timezone.

- [ ] **Step 3: Implement response mapping and display**

Select the invoice snapshot fields in `operations.ts`; apply the invoice snapshot to latest invoice, latest payment, and related subscription history. For legacy rows use `organization.defaultTimezone` only as API fallback. Rename the component helper to `formatSubscriptionDate` and pass timezone for every subscription timestamp. Display the IANA zone alongside each payment/audit group.

- [ ] **Step 4: Run the admin test and typecheck**

Run: `pnpm --filter @barber-saas/admin test -- PlatformSubscriptions.test.tsx && pnpm --filter @barber-saas/admin typecheck`

Expected: all displayed subscription timestamps use the business snapshot and null provider time is explicit.

- [ ] **Step 5: Commit the platform view**

```bash
git add apps/api/src/operations.ts apps/admin/app/platform-api.ts apps/admin/app/PlatformSubscriptions.tsx apps/admin/app/PlatformSubscriptions.test.tsx
git commit -m "feat(admin): mostrar auditoría horaria de suscripciones"
```

### Task 6: Verify deployment behavior and protect regressions

**Files:**
- Modify: `apps/api/src/subscription-reminders.ts`
- Modify: `apps/api/src/subscription-reminders.test.ts` (create if absent)
- Modify: `docs/database/schema.md`
- Modify: `docs/testing/strategy.md`

**Interfaces:**
- Reminder email receives `periodEndsAt` plus the invoice/organization timezone and includes the IANA name in user-facing copy.

- [ ] **Step 1: Write failing reminder timezone tests**

```ts
it('sends the renewal reminder in the organization timezone, not process local time', async () => {
  await processSubscriptionRenewalReminders(database, config, new Date('2026-11-01T05:00:00.000Z'));
  expect(sentText).toContain('America/New_York');
});
```

- [ ] **Step 2: Run the reminder test and verify the copy omits time and zone**

Run: `pnpm --filter @barber-saas/api test -- subscription-reminders.test.ts`

Expected: failure because current reminders render only a local date.

- [ ] **Step 3: Include local date, time, and timezone in reminders; document the invariants**

Format with `new Intl.DateTimeFormat('es-EC', { dateStyle: 'long', timeStyle: 'short', timeZone })` and append `(${timeZone})`. Document the migration, UTC lifecycle invariants, provider-time semantics, minute reconciliation, and rollback observation points.

- [ ] **Step 4: Execute full verification**

Run: `pnpm test && pnpm typecheck && pnpm --filter @barber-saas/web build && pnpm --filter @barber-saas/admin build`

Expected: all suites and production builds pass; migration is valid and all timestamps remain ISO UTC across API boundaries.

- [ ] **Step 5: Commit documentation and final tests**

```bash
git add apps/api/src/subscription-reminders.ts apps/api/src/subscription-reminders.test.ts docs/database/schema.md docs/testing/strategy.md
git commit -m "docs: documentar auditoría temporal de suscripciones"
```

## Self-review

- Spec coverage: Tasks 1–2 cover audit snapshots and timezone capture; Tasks 3–4 cover exact lifecycle and authoritative payment confirmation; Task 5 covers admin display; Task 6 covers communications, documentation, and end-to-end verification.
- Placeholder scan: no deferred implementation markers or unspecified tests remain.
- Type consistency: `billingTimezone`, `providerPaidAt`, `appliedAt`, and `graceEndsAt` are introduced in persistence before API contracts and UI consumers.
