CREATE TYPE "AppointmentPaymentStatus" AS ENUM ('PENDING', 'PAID');

ALTER TABLE "appointments"
  ADD COLUMN "payment_status" "AppointmentPaymentStatus" NOT NULL DEFAULT 'PENDING';

CREATE INDEX "appointments_organization_id_payment_status_idx"
  ON "appointments"("organization_id", "payment_status");