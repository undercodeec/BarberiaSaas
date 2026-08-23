ALTER TABLE "subscriptions"
  ADD COLUMN "founder_price_eligible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "founder_price_started_at" TIMESTAMPTZ(3),
  ADD COLUMN "founder_price_lost_at" TIMESTAMPTZ(3),
  ADD COLUMN "founder_price_loss_reason" VARCHAR(80);

ALTER TABLE "subscription_invoices"
  ADD COLUMN "promotion_code" VARCHAR(80),
  ADD COLUMN "promotion_discount_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "founder_price_applied" BOOLEAN NOT NULL DEFAULT false;
