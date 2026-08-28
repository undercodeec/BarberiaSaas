CREATE TYPE "SubscriptionDiscountKind" AS ENUM ('TEMPORARY', 'LIFETIME_CONTINUITY');
CREATE TYPE "SubscriptionDiscountGrantStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "subscription_discount_coupons" (
  "id" UUID NOT NULL,
  "normalized_code" VARCHAR(80) NOT NULL,
  "display_code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "percentage_basis_points" INTEGER NOT NULL,
  "kind" "SubscriptionDiscountKind" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "starts_at" TIMESTAMPTZ(3),
  "ends_at" TIMESTAMPTZ(3),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "subscription_discount_coupons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_discount_coupons_percentage_basis_points_check"
    CHECK ("percentage_basis_points" BETWEEN 100 AND 9900),
  CONSTRAINT "subscription_discount_coupons_normalized_code_check"
    CHECK ("normalized_code" = BTRIM("normalized_code") AND "normalized_code" = UPPER("normalized_code") AND "normalized_code" <> ''),
  CONSTRAINT "subscription_discount_coupons_schedule_check"
    CHECK (
      ("kind" = 'TEMPORARY' AND "ends_at" IS NOT NULL AND ("starts_at" IS NULL OR "starts_at" < "ends_at")) OR
      ("kind" = 'LIFETIME_CONTINUITY' AND "ends_at" IS NULL)
    )
);

CREATE TABLE "subscription_discount_coupon_plans" (
  "coupon_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  CONSTRAINT "subscription_discount_coupon_plans_pkey" PRIMARY KEY ("coupon_id", "plan_id")
);

CREATE TABLE "subscription_discount_grants" (
  "id" UUID NOT NULL,
  "coupon_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "status" "SubscriptionDiscountGrantStatus" NOT NULL DEFAULT 'ACTIVE',
  "normalized_code_snapshot" VARCHAR(80) NOT NULL,
  "percentage_basis_points_snapshot" INTEGER NOT NULL,
  "kind_snapshot" "SubscriptionDiscountKind" NOT NULL,
  "expires_at_snapshot" TIMESTAMPTZ(3),
  "redeemed_by_user_id" UUID NOT NULL,
  "redeemed_invoice_id" UUID NOT NULL,
  "redeemed_attempt_id" UUID NOT NULL,
  "redeemed_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "revoked_by_user_id" UUID,
  "revocation_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "subscription_discount_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_discount_grants_percentage_basis_points_snapshot_check"
    CHECK ("percentage_basis_points_snapshot" BETWEEN 100 AND 9900),
  CONSTRAINT "subscription_discount_grants_snapshot_schedule_check"
    CHECK (
      ("kind_snapshot" = 'TEMPORARY' AND "expires_at_snapshot" IS NOT NULL) OR
      ("kind_snapshot" = 'LIFETIME_CONTINUITY' AND "expires_at_snapshot" IS NULL)
    )
);

CREATE TABLE "subscription_discount_reservations" (
  "id" UUID NOT NULL,
  "coupon_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "invoice_id" UUID,
  "payment_attempt_id" UUID,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "released_at" TIMESTAMPTZ(3),
  "release_reason" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_discount_reservations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "subscription_invoices"
  ADD COLUMN "discount_coupon_id" UUID,
  ADD COLUMN "discount_grant_id" UUID,
  ADD COLUMN "discount_percentage_basis_points" INTEGER,
  ADD CONSTRAINT "subscription_invoices_discount_percentage_basis_points_check"
    CHECK ("discount_percentage_basis_points" IS NULL OR "discount_percentage_basis_points" BETWEEN 100 AND 9900);

CREATE UNIQUE INDEX "subscription_discount_coupons_normalized_code_key"
  ON "subscription_discount_coupons"("normalized_code");
CREATE INDEX "subscription_discount_coupons_is_active_starts_at_ends_at_idx"
  ON "subscription_discount_coupons"("is_active", "starts_at", "ends_at");
CREATE INDEX "subscription_discount_coupon_plans_plan_id_idx"
  ON "subscription_discount_coupon_plans"("plan_id");
CREATE UNIQUE INDEX "subscription_discount_grants_coupon_id_organization_id_key"
  ON "subscription_discount_grants"("coupon_id", "organization_id");
CREATE UNIQUE INDEX "subscription_discount_grants_redeemed_invoice_id_key"
  ON "subscription_discount_grants"("redeemed_invoice_id");
CREATE UNIQUE INDEX "subscription_discount_grants_redeemed_attempt_id_key"
  ON "subscription_discount_grants"("redeemed_attempt_id");
CREATE INDEX "subscription_discount_grants_organization_id_status_idx"
  ON "subscription_discount_grants"("organization_id", "status");
CREATE UNIQUE INDEX "subscription_discount_reservations_invoice_id_key"
  ON "subscription_discount_reservations"("invoice_id");
CREATE UNIQUE INDEX "subscription_discount_reservations_payment_attempt_id_key"
  ON "subscription_discount_reservations"("payment_attempt_id");
CREATE INDEX "subscription_discount_reservations_coupon_id_idx"
  ON "subscription_discount_reservations"("coupon_id");
CREATE INDEX "subscription_discount_reservations_organization_id_expires_at_idx"
  ON "subscription_discount_reservations"("organization_id", "expires_at");
CREATE UNIQUE INDEX "subscription_discount_reservations_one_active_per_organization"
  ON "subscription_discount_reservations" ("organization_id")
  WHERE "released_at" IS NULL;

ALTER TABLE "subscription_discount_coupons"
  ADD CONSTRAINT "subscription_discount_coupons_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_discount_coupon_plans"
  ADD CONSTRAINT "subscription_discount_coupon_plans_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "subscription_discount_coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_discount_coupon_plans"
  ADD CONSTRAINT "subscription_discount_coupon_plans_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_discount_grants"
  ADD CONSTRAINT "subscription_discount_grants_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "subscription_discount_coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_discount_grants"
  ADD CONSTRAINT "subscription_discount_grants_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_discount_grants"
  ADD CONSTRAINT "subscription_discount_grants_redeemed_by_user_id_fkey"
  FOREIGN KEY ("redeemed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_discount_grants"
  ADD CONSTRAINT "subscription_discount_grants_redeemed_invoice_id_fkey"
  FOREIGN KEY ("redeemed_invoice_id") REFERENCES "subscription_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_discount_grants"
  ADD CONSTRAINT "subscription_discount_grants_redeemed_attempt_id_fkey"
  FOREIGN KEY ("redeemed_attempt_id") REFERENCES "subscription_payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_discount_grants"
  ADD CONSTRAINT "subscription_discount_grants_revoked_by_user_id_fkey"
  FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_discount_reservations"
  ADD CONSTRAINT "subscription_discount_reservations_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "subscription_discount_coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_discount_reservations"
  ADD CONSTRAINT "subscription_discount_reservations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_discount_reservations"
  ADD CONSTRAINT "subscription_discount_reservations_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "subscription_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_discount_reservations"
  ADD CONSTRAINT "subscription_discount_reservations_payment_attempt_id_fkey"
  FOREIGN KEY ("payment_attempt_id") REFERENCES "subscription_payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_invoices"
  ADD CONSTRAINT "subscription_invoices_discount_coupon_id_fkey"
  FOREIGN KEY ("discount_coupon_id") REFERENCES "subscription_discount_coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_invoices"
  ADD CONSTRAINT "subscription_invoices_discount_grant_id_fkey"
  FOREIGN KEY ("discount_grant_id") REFERENCES "subscription_discount_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
