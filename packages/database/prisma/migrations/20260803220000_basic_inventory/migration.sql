CREATE TYPE "StockMovementType" AS ENUM ('OPENING', 'PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN', 'LOSS');
CREATE TYPE "StockDirection" AS ENUM ('IN', 'OUT');

CREATE TABLE "products" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "sku" VARCHAR(80),
  "barcode" VARCHAR(80),
  "cost_cents" INTEGER NOT NULL DEFAULT 0,
  "sale_price_cents" INTEGER NOT NULL,
  "currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
  "stock_tracking_enabled" BOOLEAN NOT NULL DEFAULT true,
  "minimum_stock" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "products_amounts_check" CHECK ("cost_cents" >= 0 AND "sale_price_cents" >= 1 AND "minimum_stock" >= 0),
  CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "products_organization_id_name_key" ON "products"("organization_id", "name");
CREATE UNIQUE INDEX "products_organization_id_sku_key" ON "products"("organization_id", "sku");
CREATE UNIQUE INDEX "products_organization_id_barcode_key" ON "products"("organization_id", "barcode");
CREATE INDEX "products_organization_id_is_active_idx" ON "products"("organization_id", "is_active");

CREATE TABLE "location_inventory" (
  "location_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity_on_hand" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "location_inventory_pkey" PRIMARY KEY ("location_id", "product_id"),
  CONSTRAINT "location_inventory_nonnegative_check" CHECK ("quantity_on_hand" >= 0),
  CONSTRAINT "location_inventory_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE,
  CONSTRAINT "location_inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
);

CREATE INDEX "location_inventory_product_id_quantity_on_hand_idx" ON "location_inventory"("product_id", "quantity_on_hand");

ALTER TABLE "cash_movements"
  ADD COLUMN "product_id" UUID,
  ADD COLUMN "product_quantity" INTEGER,
  ADD COLUMN "reversed_at" TIMESTAMPTZ(3),
  ADD COLUMN "reversed_by_user_id" UUID,
  ADD COLUMN "reversal_reason" VARCHAR(240),
  ADD CONSTRAINT "cash_movements_product_source_check" CHECK (
    ("product_id" IS NULL AND "product_quantity" IS NULL)
    OR ("product_id" IS NOT NULL AND "product_quantity" > 0 AND "type" = 'SALE')
  ),
  ADD CONSTRAINT "cash_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT;

CREATE INDEX "cash_movements_product_id_created_at_idx" ON "cash_movements"("product_id", "created_at");
CREATE INDEX "cash_movements_reversed_at_idx" ON "cash_movements"("reversed_at");

CREATE TABLE "stock_movements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "cash_movement_id" UUID,
  "type" "StockMovementType" NOT NULL,
  "direction" "StockDirection" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "resulting_quantity" INTEGER NOT NULL,
  "unit_cost_cents" INTEGER,
  "notes" VARCHAR(500),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_movements_quantities_check" CHECK ("quantity" > 0 AND "resulting_quantity" >= 0),
  CONSTRAINT "stock_movements_unit_cost_check" CHECK ("unit_cost_cents" IS NULL OR "unit_cost_cents" >= 0),
  CONSTRAINT "stock_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "stock_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE,
  CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
  CONSTRAINT "stock_movements_cash_movement_id_fkey" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE SET NULL
);

CREATE INDEX "stock_movements_organization_id_created_at_idx" ON "stock_movements"("organization_id", "created_at");
CREATE INDEX "stock_movements_location_id_product_id_created_at_idx" ON "stock_movements"("location_id", "product_id", "created_at");
CREATE INDEX "stock_movements_cash_movement_id_idx" ON "stock_movements"("cash_movement_id");
