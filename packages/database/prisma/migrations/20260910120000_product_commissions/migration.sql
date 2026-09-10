CREATE TYPE "ProductCommissionType" AS ENUM ('PERCENTAGE', 'FIXED');

ALTER TABLE "products"
  ADD COLUMN "commission_type" "ProductCommissionType",
  ADD COLUMN "commission_value" INTEGER;

ALTER TABLE "products"
  ADD CONSTRAINT "products_commission_configuration_check"
  CHECK (
    ("commission_type" IS NULL AND "commission_value" IS NULL)
    OR (
      "commission_type" IS NOT NULL
      AND "commission_value" IS NOT NULL
      AND "commission_value" > 0
      AND (
        "commission_type" <> 'PERCENTAGE'
        OR "commission_value" <= 100
      )
    )
  );
