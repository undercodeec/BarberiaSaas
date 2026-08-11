CREATE TYPE "OnlinePaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'CANCELLED', 'FAILED', 'EXPIRED');

CREATE TABLE "payment_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "appointment_id" UUID NOT NULL,
  "provider" VARCHAR(40) NOT NULL DEFAULT 'payphone',
  "client_transaction_id" VARCHAR(15) NOT NULL,
  "provider_transaction_id" VARCHAR(80),
  "store_id" VARCHAR(160) NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
  "payment_url" TEXT,
  "status" "OnlinePaymentStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "approved_at" TIMESTAMPTZ(3),
  "provider_payload" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_attempts_client_transaction_id_key" UNIQUE ("client_transaction_id"),
  CONSTRAINT "payment_attempts_provider_transaction_id_key" UNIQUE ("provider_transaction_id"),
  CONSTRAINT "payment_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_attempts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_attempts_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "payment_attempts_appointment_id_created_at_idx" ON "payment_attempts"("appointment_id", "created_at");
CREATE INDEX "payment_attempts_organization_id_status_expires_at_idx" ON "payment_attempts"("organization_id", "status", "expires_at");