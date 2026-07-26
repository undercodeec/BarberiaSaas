CREATE TABLE "onboarding_services" (
  "id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "duration_minutes" INTEGER NOT NULL,
  "price_cents" INTEGER NOT NULL,
  "price_type" VARCHAR(16) NOT NULL,
  "online_booking" BOOLEAN NOT NULL DEFAULT true,
  "show_service_time" BOOLEAN NOT NULL DEFAULT true,
  "category_name" VARCHAR(80),
  "category_description" VARCHAR(500),
  "tax_name" VARCHAR(80),
  "tax_percentage" INTEGER,
  "tax_add_at_checkout" BOOLEAN NOT NULL DEFAULT false,
  "tax_add_at_purchase_end" BOOLEAN NOT NULL DEFAULT false,
  "image_uri" VARCHAR(2048),
  "agenda_color" CHAR(7) NOT NULL,
  "down_payment_percentage" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "onboarding_services_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "onboarding_services"
ADD CONSTRAINT "onboarding_services_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "onboarding_services_owner_user_id_created_at_idx"
ON "onboarding_services"("owner_user_id", "created_at");
