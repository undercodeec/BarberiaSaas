DROP INDEX IF EXISTS "locations_google_place_id_idx";
ALTER TABLE "locations" DROP CONSTRAINT IF EXISTS "locations_coordinates_valid";
ALTER TABLE "locations"
DROP COLUMN IF EXISTS "longitude",
DROP COLUMN IF EXISTS "latitude",
DROP COLUMN IF EXISTS "google_place_id",
DROP COLUMN IF EXISTS "formatted_address";
