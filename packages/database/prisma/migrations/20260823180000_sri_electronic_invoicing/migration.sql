CREATE TYPE "SriEnvironment" AS ENUM ('TEST', 'PRODUCTION');
CREATE TYPE "SriTaxRegime" AS ENUM ('GENERAL', 'RIMPE', 'RIMPE_NEGOCIO_POPULAR');
CREATE TYPE "SriInvoiceStatus" AS ENUM ('PENDING', 'GENERATED', 'SIGNED', 'RECEIVED', 'PROCESSING', 'AUTHORIZED', 'NOT_AUTHORIZED', 'ERROR');
CREATE TYPE "SriInvoiceDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "organization_billing_profiles" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "identification_type" CHAR(2) NOT NULL,
  "identification" VARCHAR(20) NOT NULL,
  "legal_name" VARCHAR(300) NOT NULL,
  "email" VARCHAR(100) NOT NULL,
  "address" VARCHAR(300),
  "phone" VARCHAR(24),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "organization_billing_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sri_document_sequences" (
  "id" UUID NOT NULL,
  "document_type" CHAR(2) NOT NULL,
  "establishment_code" CHAR(3) NOT NULL,
  "emission_point_code" CHAR(3) NOT NULL,
  "last_sequential" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "sri_document_sequences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sri_document_sequences_last_sequential_check" CHECK ("last_sequential" BETWEEN 0 AND 999999999)
);

CREATE TABLE "sri_invoices" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "subscription_invoice_id" UUID NOT NULL,
  "subscription_payment_attempt_id" UUID NOT NULL,
  "environment" "SriEnvironment" NOT NULL,
  "document_type" CHAR(2) NOT NULL DEFAULT '01',
  "establishment_code" CHAR(3) NOT NULL,
  "emission_point_code" CHAR(3) NOT NULL,
  "sequential" INTEGER NOT NULL,
  "access_key" CHAR(49) NOT NULL,
  "authorization_number" VARCHAR(80),
  "authorization_date" TIMESTAMPTZ(3),
  "status" "SriInvoiceStatus" NOT NULL DEFAULT 'PENDING',
  "delivery_status" "SriInvoiceDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "buyer_identification_type" CHAR(2) NOT NULL,
  "buyer_identification" VARCHAR(20) NOT NULL,
  "buyer_name" VARCHAR(300) NOT NULL,
  "buyer_email" VARCHAR(100) NOT NULL,
  "buyer_address" VARCHAR(300),
  "buyer_phone" VARCHAR(24),
  "plan_code" VARCHAR(40) NOT NULL,
  "description" VARCHAR(300) NOT NULL,
  "subtotal_cents" INTEGER NOT NULL,
  "discount_cents" INTEGER NOT NULL DEFAULT 0,
  "tax_cents" INTEGER NOT NULL,
  "tax_basis_points" INTEGER NOT NULL,
  "tax_code" CHAR(1) NOT NULL,
  "tax_percentage_code" VARCHAR(4) NOT NULL,
  "total_cents" INTEGER NOT NULL,
  "currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
  "payment_method_code" CHAR(2) NOT NULL,
  "payment_reference" VARCHAR(80),
  "issued_at" TIMESTAMPTZ(3) NOT NULL,
  "authorized_at" TIMESTAMPTZ(3),
  "emailed_at" TIMESTAMPTZ(3),
  "next_attempt_at" TIMESTAMPTZ(3),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "unsigned_xml" TEXT,
  "signed_xml" TEXT,
  "authorized_xml" TEXT,
  "ride_pdf" BYTEA,
  "sri_error_code" VARCHAR(80),
  "sri_error_message" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "sri_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sri_invoices_amounts_check" CHECK (
    "subtotal_cents" >= 0 AND "discount_cents" >= 0 AND "tax_cents" >= 0 AND
    "total_cents" = "subtotal_cents" + "tax_cents"
  ),
  CONSTRAINT "sri_invoices_tax_basis_points_check" CHECK ("tax_basis_points" BETWEEN 0 AND 10000),
  CONSTRAINT "sri_invoices_sequential_check" CHECK ("sequential" BETWEEN 1 AND 999999999),
  CONSTRAINT "sri_invoices_currency_check" CHECK ("currency_code" = UPPER("currency_code"))
);

CREATE UNIQUE INDEX "organization_billing_profiles_organization_id_key" ON "organization_billing_profiles"("organization_id");
CREATE UNIQUE INDEX "sri_document_sequences_document_type_establishment_code_emission_point_code_key" ON "sri_document_sequences"("document_type", "establishment_code", "emission_point_code");
CREATE UNIQUE INDEX "sri_invoices_subscription_payment_attempt_id_key" ON "sri_invoices"("subscription_payment_attempt_id");
CREATE UNIQUE INDEX "sri_invoices_access_key_key" ON "sri_invoices"("access_key");
CREATE UNIQUE INDEX "sri_invoices_document_type_establishment_code_emission_point_code_sequential_key" ON "sri_invoices"("document_type", "establishment_code", "emission_point_code", "sequential");
CREATE INDEX "sri_invoices_organization_id_issued_at_idx" ON "sri_invoices"("organization_id", "issued_at");
CREATE INDEX "sri_invoices_status_next_attempt_at_idx" ON "sri_invoices"("status", "next_attempt_at");

ALTER TABLE "organization_billing_profiles" ADD CONSTRAINT "organization_billing_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sri_invoices" ADD CONSTRAINT "sri_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sri_invoices" ADD CONSTRAINT "sri_invoices_subscription_invoice_id_fkey" FOREIGN KEY ("subscription_invoice_id") REFERENCES "subscription_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sri_invoices" ADD CONSTRAINT "sri_invoices_subscription_payment_attempt_id_fkey" FOREIGN KEY ("subscription_payment_attempt_id") REFERENCES "subscription_payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
