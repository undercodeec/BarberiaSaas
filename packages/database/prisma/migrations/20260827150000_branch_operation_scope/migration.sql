ALTER TABLE "organizations"
  ADD COLUMN "primary_location_id" UUID;

UPDATE "organizations" AS organization
SET "primary_location_id" = location."id"
FROM LATERAL (
  SELECT "id"
  FROM "locations"
  WHERE "organization_id" = organization."id"
    AND "is_active" = true
  ORDER BY "created_at" ASC
  LIMIT 1
) AS location
WHERE organization."primary_location_id" IS NULL;

CREATE INDEX "organizations_primary_location_id_idx"
  ON "organizations"("primary_location_id");

CREATE UNIQUE INDEX "cash_register_sessions_open_location_unique"
  ON "cash_register_sessions"("organization_id", "location_id")
  WHERE "status" = 'OPEN' AND "organization_id" IS NOT NULL AND "location_id" IS NOT NULL;
