ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "primary_location_id" UUID;

UPDATE "organizations" AS organization
SET "primary_location_id" = (
  SELECT location."id"
  FROM "locations" AS location
  WHERE location."organization_id" = organization."id"
    AND location."is_active" = true
  ORDER BY location."created_at" ASC
  LIMIT 1
)
WHERE organization."primary_location_id" IS NULL;

CREATE INDEX "organizations_primary_location_id_idx"
  ON "organizations"("primary_location_id");

CREATE UNIQUE INDEX "cash_register_sessions_open_location_unique"
  ON "cash_register_sessions"("organization_id", "location_id")
  WHERE "status" = 'OPEN' AND "organization_id" IS NOT NULL AND "location_id" IS NOT NULL;
