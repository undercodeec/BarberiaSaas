CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "clients_active_name_cursor_idx"
  ON "clients" ("organization_id", "full_name", "id")
  WHERE "deleted_at" IS NULL;
CREATE INDEX "clients_full_name_trgm_idx"
  ON "clients" USING GIN (LOWER("full_name") gin_trgm_ops)
  WHERE "deleted_at" IS NULL;
CREATE INDEX "clients_phone_trgm_idx"
  ON "clients" USING GIN ("phone" gin_trgm_ops)
  WHERE "deleted_at" IS NULL;
CREATE INDEX "clients_phone_digits_idx"
  ON "clients" ("organization_id", regexp_replace("phone", '\D', '', 'g'))
  WHERE "deleted_at" IS NULL;
CREATE INDEX "clients_email_trgm_idx"
  ON "clients" USING GIN (LOWER("email") gin_trgm_ops)
  WHERE "deleted_at" IS NULL AND "email" IS NOT NULL;

CREATE INDEX "appointments_location_starts_cursor_idx"
  ON "appointments" ("location_id", "starts_at", "id");
CREATE INDEX "products_status_name_cursor_idx"
  ON "products" ("organization_id", "is_active" DESC, "name", "id");
CREATE INDEX "products_name_trgm_idx"
  ON "products" USING GIN (LOWER("name") gin_trgm_ops);
CREATE INDEX "stock_movements_location_created_cursor_idx"
  ON "stock_movements" ("location_id", "created_at" DESC, "id" DESC);
