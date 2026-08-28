-- Constancias comerciales temporales para pagos de suscripciones. No son
-- comprobantes de venta SRI y no comparten serie, secuencial ni clave de acceso
-- con sri_invoices.
CREATE TYPE "SubscriptionPaymentReceiptDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "subscription_payment_receipts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "subscription_invoice_id" UUID NOT NULL,
  "subscription_payment_attempt_id" UUID NOT NULL,
  "receipt_number" VARCHAR(80) NOT NULL,
  "delivery_status" "SubscriptionPaymentReceiptDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "recipient_email" VARCHAR(320) NOT NULL,
  "recipient_name" VARCHAR(300) NOT NULL,
  "organization_name" VARCHAR(160) NOT NULL,
  "plan_code" VARCHAR(40) NOT NULL,
  "plan_name" VARCHAR(80) NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "total_cents" INTEGER NOT NULL,
  "payment_provider" VARCHAR(40) NOT NULL,
  "provider_transaction_id" VARCHAR(80),
  "internal_reference" VARCHAR(15) NOT NULL,
  "period_starts_at" TIMESTAMPTZ(3) NOT NULL,
  "period_ends_at" TIMESTAMPTZ(3) NOT NULL,
  "paid_at" TIMESTAMPTZ(3) NOT NULL,
  "document_pdf" BYTEA NOT NULL,
  "document_sha256" CHAR(64) NOT NULL,
  "emailed_at" TIMESTAMPTZ(3),
  "last_attempt_at" TIMESTAMPTZ(3),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "subscription_payment_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_payment_receipts_total_cents_check" CHECK ("total_cents" >= 0),
  CONSTRAINT "subscription_payment_receipts_currency_check" CHECK ("currency_code" = UPPER("currency_code")),
  CONSTRAINT "subscription_payment_receipts_attempt_count_check" CHECK ("attempt_count" >= 0)
);

CREATE UNIQUE INDEX "subscription_payment_receipts_subscription_payment_attempt_id_key"
  ON "subscription_payment_receipts"("subscription_payment_attempt_id");
CREATE UNIQUE INDEX "subscription_payment_receipts_receipt_number_key"
  ON "subscription_payment_receipts"("receipt_number");
CREATE INDEX "subscription_payment_receipts_organization_id_paid_at_idx"
  ON "subscription_payment_receipts"("organization_id", "paid_at");
CREATE INDEX "subscription_payment_receipts_delivery_status_last_attempt_at_idx"
  ON "subscription_payment_receipts"("delivery_status", "last_attempt_at");

ALTER TABLE "subscription_payment_receipts"
  ADD CONSTRAINT "subscription_payment_receipts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payment_receipts"
  ADD CONSTRAINT "subscription_payment_receipts_subscription_invoice_id_fkey"
  FOREIGN KEY ("subscription_invoice_id") REFERENCES "subscription_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payment_receipts"
  ADD CONSTRAINT "subscription_payment_receipts_subscription_payment_attempt_id_fkey"
  FOREIGN KEY ("subscription_payment_attempt_id") REFERENCES "subscription_payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
