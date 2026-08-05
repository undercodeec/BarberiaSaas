ALTER TABLE "locations"
ADD COLUMN "formatted_address" VARCHAR(300),
ADD COLUMN "google_place_id" VARCHAR(255),
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION;

ALTER TABLE "locations"
ADD CONSTRAINT "locations_coordinates_valid" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL)
  OR (
    "latitude" BETWEEN -90 AND 90
    AND "longitude" BETWEEN -180 AND 180
  )
);

CREATE INDEX "locations_google_place_id_idx" ON "locations"("google_place_id");
