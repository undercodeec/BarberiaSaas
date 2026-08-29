ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_CONFIRMATION_REQUIRED';

ALTER TABLE "organizations"
  ADD COLUMN "service_payment_confirmation_enabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "appointments"
  ADD COLUMN "payment_confirmation_requested_at" TIMESTAMPTZ(3),
  ADD COLUMN "payment_confirmation_requested_by_user_id" UUID;

CREATE INDEX "appointments_organization_id_payment_status_payment_confirmation_requested_at_idx"
  ON "appointments"("organization_id", "payment_status", "payment_confirmation_requested_at");
