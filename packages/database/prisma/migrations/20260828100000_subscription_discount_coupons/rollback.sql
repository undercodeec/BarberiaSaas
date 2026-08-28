ALTER TABLE "subscription_invoices"
  DROP CONSTRAINT "subscription_invoices_discount_grant_id_fkey";
ALTER TABLE "subscription_invoices"
  DROP CONSTRAINT "subscription_invoices_discount_coupon_id_fkey";
ALTER TABLE "subscription_invoices"
  DROP CONSTRAINT "subscription_invoices_discount_percentage_basis_points_check";

ALTER TABLE "subscription_discount_reservations"
  DROP CONSTRAINT "subscription_discount_reservations_payment_attempt_id_fkey";
ALTER TABLE "subscription_discount_reservations"
  DROP CONSTRAINT "subscription_discount_reservations_invoice_id_fkey";
ALTER TABLE "subscription_discount_reservations"
  DROP CONSTRAINT "subscription_discount_reservations_organization_id_fkey";
ALTER TABLE "subscription_discount_reservations"
  DROP CONSTRAINT "subscription_discount_reservations_coupon_id_fkey";

ALTER TABLE "subscription_discount_grants"
  DROP CONSTRAINT "subscription_discount_grants_revoked_by_user_id_fkey";
ALTER TABLE "subscription_discount_grants"
  DROP CONSTRAINT "subscription_discount_grants_redeemed_attempt_id_fkey";
ALTER TABLE "subscription_discount_grants"
  DROP CONSTRAINT "subscription_discount_grants_redeemed_invoice_id_fkey";
ALTER TABLE "subscription_discount_grants"
  DROP CONSTRAINT "subscription_discount_grants_redeemed_by_user_id_fkey";
ALTER TABLE "subscription_discount_grants"
  DROP CONSTRAINT "subscription_discount_grants_organization_id_fkey";
ALTER TABLE "subscription_discount_grants"
  DROP CONSTRAINT "subscription_discount_grants_coupon_id_fkey";

ALTER TABLE "subscription_discount_coupon_plans"
  DROP CONSTRAINT "subscription_discount_coupon_plans_plan_id_fkey";
ALTER TABLE "subscription_discount_coupon_plans"
  DROP CONSTRAINT "subscription_discount_coupon_plans_coupon_id_fkey";
ALTER TABLE "subscription_discount_coupons"
  DROP CONSTRAINT "subscription_discount_coupons_created_by_user_id_fkey";

DROP INDEX "subscription_discount_reservations_one_active_per_organization";
DROP INDEX "subscription_discount_reservations_organization_id_expires_at_idx";
DROP INDEX "subscription_discount_reservations_coupon_id_idx";
DROP INDEX "subscription_discount_reservations_payment_attempt_id_key";
DROP INDEX "subscription_discount_reservations_invoice_id_key";
DROP INDEX "subscription_discount_grants_organization_id_status_idx";
DROP INDEX "subscription_discount_grants_redeemed_attempt_id_key";
DROP INDEX "subscription_discount_grants_redeemed_invoice_id_key";
DROP INDEX "subscription_discount_grants_coupon_id_organization_id_key";
DROP INDEX "subscription_discount_coupon_plans_plan_id_idx";
DROP INDEX "subscription_discount_coupons_is_active_starts_at_ends_at_idx";
DROP INDEX "subscription_discount_coupons_normalized_code_key";

DROP TABLE "subscription_discount_reservations";
DROP TABLE "subscription_discount_grants";
DROP TABLE "subscription_discount_coupon_plans";
DROP TABLE "subscription_discount_coupons";

ALTER TABLE "subscription_invoices"
  DROP COLUMN "discount_percentage_basis_points",
  DROP COLUMN "discount_grant_id",
  DROP COLUMN "discount_coupon_id";

DROP TYPE "SubscriptionDiscountGrantStatus";
DROP TYPE "SubscriptionDiscountKind";
