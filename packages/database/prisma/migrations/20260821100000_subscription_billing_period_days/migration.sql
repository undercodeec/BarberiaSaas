ALTER TABLE "subscription_invoices"
  ADD COLUMN "billing_period_days" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "subscription_invoices"
  ADD CONSTRAINT "subscription_invoices_period_days_check"
  CHECK ("billing_period_days" > 0 AND "billing_period_days" <= 3660);
