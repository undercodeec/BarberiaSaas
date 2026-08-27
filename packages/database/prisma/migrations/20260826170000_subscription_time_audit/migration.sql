ALTER TABLE "subscription_invoices"
  ADD COLUMN "billing_timezone" VARCHAR(64),
  ADD COLUMN "provider_paid_at" TIMESTAMPTZ(3);

ALTER TABLE "subscription_changes"
  ADD COLUMN "billing_timezone" VARCHAR(64);

UPDATE "subscription_invoices" invoice
SET "billing_timezone" = organization."default_timezone"
FROM "organizations" organization
WHERE invoice."organization_id" = organization."id"
  AND invoice."billing_timezone" IS NULL;

UPDATE "subscription_changes" change
SET "billing_timezone" = organization."default_timezone"
FROM "organizations" organization
WHERE change."organization_id" = organization."id"
  AND change."billing_timezone" IS NULL;

ALTER TABLE "subscription_invoices"
  ALTER COLUMN "billing_timezone" SET NOT NULL;

ALTER TABLE "subscription_changes"
  ALTER COLUMN "billing_timezone" SET NOT NULL;
