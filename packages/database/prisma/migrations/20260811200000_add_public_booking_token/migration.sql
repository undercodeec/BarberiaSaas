ALTER TABLE "organizations"
  ADD COLUMN "public_booking_token" VARCHAR(36);

UPDATE "organizations"
SET "public_booking_token" = gen_random_uuid()::text
WHERE "public_booking_token" IS NULL;

ALTER TABLE "organizations"
  ALTER COLUMN "public_booking_token" SET NOT NULL;

CREATE UNIQUE INDEX "organizations_public_booking_token_key"
  ON "organizations"("public_booking_token");
