CREATE TABLE "organization_bank_transfer_settings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "bank_name" VARCHAR(120) NOT NULL,
    "account_holder_name" VARCHAR(160) NOT NULL,
    "account_type" VARCHAR(20) NOT NULL,
    "account_number" VARCHAR(80) NOT NULL,
    "holder_identification" VARCHAR(40) NOT NULL,
    "instructions" VARCHAR(1000),
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "organization_bank_transfer_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_bank_transfer_settings_organization_id_key" UNIQUE ("organization_id"),
    CONSTRAINT "organization_bank_transfer_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "product_orders"
  ADD COLUMN "bank_transfer_snapshot" JSONB;
