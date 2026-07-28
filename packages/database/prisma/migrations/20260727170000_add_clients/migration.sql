CREATE TABLE "clients" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "full_name" VARCHAR(120) NOT NULL,
  "phone" VARCHAR(24),
  "email" VARCHAR(254),
  "notes" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "clients_organization_id_full_name_idx" ON "clients"("organization_id", "full_name");

ALTER TABLE "clients"
  ADD CONSTRAINT "clients_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
