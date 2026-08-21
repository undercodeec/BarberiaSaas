CREATE TYPE "PlatformPaymentConfigurationStatus" AS ENUM ('DISABLED', 'READY', 'ERROR');
CREATE TYPE "SubscriptionInvoiceStatus" AS ENUM ('OPEN', 'PENDING', 'PAID', 'EXPIRED', 'VOID', 'REFUNDED');
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('CREATED', 'LINK_CREATED', 'PENDING_PROVIDER', 'APPROVED', 'APPLIED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED', 'REVERSED');
CREATE TYPE "PaymentProviderEventSource" AS ENUM ('WEBHOOK', 'POLL', 'RECONCILIATION');
CREATE TYPE "PaymentProviderValidationStatus" AS ENUM ('PENDING', 'VERIFIED', 'INVALID', 'IGNORED');
CREATE TYPE "SubscriptionChangeKind" AS ENUM ('ACTIVATED', 'RENEWED', 'PLAN_CHANGED', 'STATUS_CHANGED', 'REFUNDED', 'REVERSED', 'MANUAL_RECONCILIATION');

CREATE TABLE "platform_payment_configurations" (
  "id" UUID NOT NULL,
  "provider" VARCHAR(40) NOT NULL DEFAULT 'payphone',
  "environment" "PayphoneEnvironment" NOT NULL DEFAULT 'TEST',
  "store_id" VARCHAR(160) NOT NULL,
  "encrypted_token" TEXT NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT false,
  "status" "PlatformPaymentConfigurationStatus" NOT NULL DEFAULT 'DISABLED',
  "webhook_authorized_at" TIMESTAMPTZ(3),
  "last_tested_at" TIMESTAMPTZ(3),
  "last_error_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "platform_payment_configurations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_payment_configurations_enabled_check" CHECK (NOT "is_enabled" OR "status" = 'READY')
);

CREATE TABLE "subscription_invoices" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "requested_by_user_id" UUID,
  "plan_id" UUID NOT NULL,
  "plan_code" VARCHAR(40) NOT NULL,
  "plan_name" VARCHAR(80) NOT NULL,
  "limits_snapshot" JSONB NOT NULL,
  "features_snapshot" JSONB NOT NULL,
  "feature_flags_snapshot" JSONB NOT NULL,
  "subtotal_cents" INTEGER NOT NULL,
  "tax_cents" INTEGER NOT NULL DEFAULT 0,
  "tax_basis_points" INTEGER NOT NULL,
  "total_cents" INTEGER NOT NULL,
  "currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
  "billing_period_months" INTEGER NOT NULL DEFAULT 1,
  "commercial_terms_version" VARCHAR(40) NOT NULL,
  "period_starts_at" TIMESTAMPTZ(3),
  "period_ends_at" TIMESTAMPTZ(3),
  "status" "SubscriptionInvoiceStatus" NOT NULL DEFAULT 'OPEN',
  "due_at" TIMESTAMPTZ(3) NOT NULL,
  "paid_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_invoices_amounts_check" CHECK (
    "subtotal_cents" >= 0 AND
    "tax_cents" >= 0 AND
    "total_cents" = "subtotal_cents" + "tax_cents"
  ),
  CONSTRAINT "subscription_invoices_period_check" CHECK ("billing_period_months" > 0),
  CONSTRAINT "subscription_invoices_tax_basis_points_check" CHECK ("tax_basis_points" BETWEEN 0 AND 10000),
  CONSTRAINT "subscription_invoices_currency_check" CHECK ("currency_code" = UPPER("currency_code"))
);

CREATE TABLE "subscription_payment_attempts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "initiated_by_user_id" UUID,
  "provider" VARCHAR(40) NOT NULL DEFAULT 'payphone',
  "internal_reference" VARCHAR(15) NOT NULL,
  "idempotency_key_hash" CHAR(64) NOT NULL,
  "provider_transaction_id" VARCHAR(80),
  "store_id" VARCHAR(160) NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
  "payment_url" TEXT,
  "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'CREATED',
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "approved_at" TIMESTAMPTZ(3),
  "applied_at" TIMESTAMPTZ(3),
  "provider_payload" JSONB,
  "last_error_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "subscription_payment_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_payment_attempts_amount_check" CHECK ("amount_cents" > 0),
  CONSTRAINT "subscription_payment_attempts_currency_check" CHECK ("currency_code" = UPPER("currency_code"))
);

CREATE TABLE "payment_provider_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "subscription_payment_attempt_id" UUID,
  "provider" VARCHAR(40) NOT NULL DEFAULT 'payphone',
  "source" "PaymentProviderEventSource" NOT NULL,
  "provider_event_hash" CHAR(64) NOT NULL,
  "provider_transaction_id" VARCHAR(80),
  "internal_reference" VARCHAR(15),
  "validation_status" "PaymentProviderValidationStatus" NOT NULL DEFAULT 'PENDING',
  "validation_error_code" VARCHAR(80),
  "payload" JSONB NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(3),
  CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_changes" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "invoice_id" UUID,
  "subscription_payment_attempt_id" UUID,
  "actor_user_id" UUID,
  "kind" "SubscriptionChangeKind" NOT NULL,
  "from_plan_code" VARCHAR(40),
  "to_plan_code" VARCHAR(40),
  "from_status" "SubscriptionStatus",
  "to_status" "SubscriptionStatus" NOT NULL,
  "previous_period_end" TIMESTAMPTZ(3),
  "new_period_start" TIMESTAMPTZ(3),
  "new_period_end" TIMESTAMPTZ(3),
  "reason" VARCHAR(500) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_changes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_payment_configurations_provider_key" ON "platform_payment_configurations"("provider");
CREATE INDEX "platform_payment_configurations_is_enabled_status_idx" ON "platform_payment_configurations"("is_enabled", "status");
CREATE INDEX "subscription_invoices_organization_id_status_due_at_idx" ON "subscription_invoices"("organization_id", "status", "due_at");
CREATE INDEX "subscription_invoices_plan_id_created_at_idx" ON "subscription_invoices"("plan_id", "created_at");
CREATE UNIQUE INDEX "subscription_payment_attempts_internal_reference_key" ON "subscription_payment_attempts"("internal_reference");
CREATE UNIQUE INDEX "subscription_payment_attempts_provider_transaction_id_key" ON "subscription_payment_attempts"("provider_transaction_id");
CREATE UNIQUE INDEX "subscription_payment_attempts_organization_id_idempotency_k_key" ON "subscription_payment_attempts"("organization_id", "idempotency_key_hash");
CREATE INDEX "subscription_payment_attempts_organization_id_status_expire_idx" ON "subscription_payment_attempts"("organization_id", "status", "expires_at");
CREATE INDEX "subscription_payment_attempts_invoice_id_created_at_idx" ON "subscription_payment_attempts"("invoice_id", "created_at");
CREATE UNIQUE INDEX "payment_provider_events_provider_event_hash_key" ON "payment_provider_events"("provider_event_hash");
CREATE INDEX "payment_provider_events_organization_id_validation_status_r_idx" ON "payment_provider_events"("organization_id", "validation_status", "received_at");
CREATE INDEX "payment_provider_events_subscription_payment_attempt_id_rec_idx" ON "payment_provider_events"("subscription_payment_attempt_id", "received_at");
CREATE INDEX "payment_provider_events_provider_provider_transaction_id_idx" ON "payment_provider_events"("provider", "provider_transaction_id");
CREATE INDEX "subscription_changes_organization_id_created_at_idx" ON "subscription_changes"("organization_id", "created_at");
CREATE INDEX "subscription_changes_subscription_id_created_at_idx" ON "subscription_changes"("subscription_id", "created_at");
CREATE INDEX "subscription_changes_invoice_id_idx" ON "subscription_changes"("invoice_id");

ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payment_attempts" ADD CONSTRAINT "subscription_payment_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payment_attempts" ADD CONSTRAINT "subscription_payment_attempts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "subscription_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payment_attempts" ADD CONSTRAINT "subscription_payment_attempts_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_subscription_payment_attempt_id_fkey" FOREIGN KEY ("subscription_payment_attempt_id") REFERENCES "subscription_payment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_changes" ADD CONSTRAINT "subscription_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_changes" ADD CONSTRAINT "subscription_changes_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_changes" ADD CONSTRAINT "subscription_changes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "subscription_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_changes" ADD CONSTRAINT "subscription_changes_subscription_payment_attempt_id_fkey" FOREIGN KEY ("subscription_payment_attempt_id") REFERENCES "subscription_payment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_changes" ADD CONSTRAINT "subscription_changes_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
