CREATE TYPE "ProductOrderStatus" AS ENUM ('PENDING_PAYMENT', 'RESERVED', 'PAID', 'READY_FOR_PICKUP', 'FULFILLED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "ProductOrderPaymentMethod" AS ENUM ('CARD', 'TRANSFER', 'PICKUP');

ALTER TABLE "location_inventory"
  ADD COLUMN "quantity_reserved" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "location_inventory"
  ADD CONSTRAINT "location_inventory_reserved_nonnegative_check" CHECK ("quantity_reserved" >= 0 AND "quantity_reserved" <= "quantity_on_hand");

CREATE TABLE "product_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "customer_name" VARCHAR(120) NOT NULL,
  "customer_phone" VARCHAR(32) NOT NULL,
  "customer_email" VARCHAR(254),
  "status" "ProductOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "payment_method" "ProductOrderPaymentMethod" NOT NULL,
  "payment_reference" VARCHAR(100),
  "payment_url" TEXT,
  "payment_requested_at" TIMESTAMPTZ(3),
  "paid_at" TIMESTAMPTZ(3),
  "ready_at" TIMESTAMPTZ(3),
  "fulfilled_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "total_cents" INTEGER NOT NULL CHECK ("total_cents" > 0),
  "currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "product_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "product_orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE
);
CREATE INDEX "product_orders_organization_id_status_created_at_idx" ON "product_orders"("organization_id", "status", "created_at");
CREATE INDEX "product_orders_location_id_status_expires_at_idx" ON "product_orders"("location_id", "status", "expires_at");

CREATE TABLE "product_order_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_name" VARCHAR(120) NOT NULL,
  "unit_price_cents" INTEGER NOT NULL CHECK ("unit_price_cents" > 0),
  "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_order_items_order_id_product_id_key" UNIQUE ("order_id", "product_id"),
  CONSTRAINT "product_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "product_orders"("id") ON DELETE CASCADE,
  CONSTRAINT "product_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT
);
CREATE INDEX "product_order_items_product_id_idx" ON "product_order_items"("product_id");
