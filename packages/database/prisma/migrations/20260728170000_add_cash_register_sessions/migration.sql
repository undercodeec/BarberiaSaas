CREATE TYPE "CashRegisterStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "cash_register_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "owner_user_id" UUID NOT NULL,
  "location_id" UUID,
  "responsible_membership_id" UUID,
  "responsible_name" VARCHAR(120) NOT NULL,
  "opening_amount_cents" INTEGER NOT NULL,
  "status" "CashRegisterStatus" NOT NULL DEFAULT 'OPEN',
  "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "cash_register_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cash_register_sessions_organization_id_status_idx" ON "cash_register_sessions"("organization_id", "status");
CREATE INDEX "cash_register_sessions_owner_user_id_status_idx" ON "cash_register_sessions"("owner_user_id", "status");