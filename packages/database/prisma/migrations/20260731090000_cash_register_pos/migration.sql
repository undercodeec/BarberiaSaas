CREATE TYPE "CashMovementType" AS ENUM ('SALE', 'EXPENSE', 'WITHDRAWAL');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'OTHER');
ALTER TABLE "cash_register_sessions" ADD COLUMN "expected_amount_cents" INTEGER, ADD COLUMN "closing_amount_cents" INTEGER, ADD COLUMN "difference_cents" INTEGER, ADD COLUMN "closed_by_user_id" UUID, ADD COLUMN "closing_note" VARCHAR(500);
CREATE TABLE "cash_movements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "cash_register_session_id" UUID NOT NULL,
  "type" "CashMovementType" NOT NULL, "payment_method" "PaymentMethod", "amount_cents" INTEGER NOT NULL,
  "description" VARCHAR(240) NOT NULL, "appointment_id" UUID, "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_movements_cash_register_session_id_fkey" FOREIGN KEY ("cash_register_session_id") REFERENCES "cash_register_sessions"("id") ON DELETE CASCADE
);
CREATE INDEX "cash_movements_cash_register_session_id_created_at_idx" ON "cash_movements"("cash_register_session_id", "created_at");
CREATE INDEX "cash_movements_appointment_id_idx" ON "cash_movements"("appointment_id");
