ALTER TABLE "pending_registrations"
ADD COLUMN IF NOT EXISTS "business_name_key" VARCHAR(120);

ALTER TABLE "pending_registrations"
ADD COLUMN IF NOT EXISTS "phone_key" VARCHAR(24);

ALTER TABLE "user_registration_profiles"
ADD COLUMN IF NOT EXISTS "business_name_key" VARCHAR(120);

ALTER TABLE "user_registration_profiles"
ADD COLUMN IF NOT EXISTS "phone_key" VARCHAR(24);

UPDATE "pending_registrations"
SET
  "business_name_key" = REGEXP_REPLACE(
    TRANSLATE(
      LOWER(TRIM("business_name")),
      'áéíóúüñàèìòùäëïöÿç',
      'aeiouunaeiouaeiouyc'
    ),
    '[^a-z0-9]+',
    ' ',
    'g'
  ),
  "phone_key" = REGEXP_REPLACE("phone", '[^0-9]+', '', 'g')
WHERE "business_name" IS NOT NULL AND "phone" IS NOT NULL;

UPDATE "user_registration_profiles" AS "profile"
SET
  "business_name_key" = REGEXP_REPLACE(
    TRANSLATE(
      LOWER(TRIM("profile"."business_name")),
      'áéíóúüñàèìòùäëïöÿç',
      'aeiouunaeiouaeiouyc'
    ),
    '[^a-z0-9]+',
    ' ',
    'g'
  ),
  "phone_key" = REGEXP_REPLACE("user"."phone", '[^0-9]+', '', 'g')
FROM "users" AS "user"
WHERE "user"."id" = "profile"."user_id";

WITH "ranked_business_names" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "business_name_key"
      ORDER BY "updated_at", "id"
    ) AS "duplicate_position"
  FROM "pending_registrations"
  WHERE "business_name_key" IS NOT NULL
)
UPDATE "pending_registrations" AS "pending"
SET "business_name_key" =
  LEFT("pending"."business_name_key", 80) || ':' || "pending"."id"::TEXT
FROM "ranked_business_names" AS "ranked"
WHERE
  "pending"."id" = "ranked"."id"
  AND "ranked"."duplicate_position" > 1;

WITH "ranked_phones" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "phone_key"
      ORDER BY "updated_at", "id"
    ) AS "duplicate_position"
  FROM "pending_registrations"
  WHERE "phone_key" IS NOT NULL
)
UPDATE "pending_registrations" AS "pending"
SET "phone_key" =
  LEFT("pending"."phone_key", 7) ||
  RIGHT(REPLACE("pending"."id"::TEXT, '-', ''), 16)
FROM "ranked_phones" AS "ranked"
WHERE
  "pending"."id" = "ranked"."id"
  AND "ranked"."duplicate_position" > 1;

WITH "ranked_business_names" AS (
  SELECT
    "user_id",
    ROW_NUMBER() OVER (
      PARTITION BY "business_name_key"
      ORDER BY "updated_at", "user_id"
    ) AS "duplicate_position"
  FROM "user_registration_profiles"
)
UPDATE "user_registration_profiles" AS "profile"
SET "business_name_key" =
  LEFT("profile"."business_name_key", 80) || ':' || "profile"."user_id"::TEXT
FROM "ranked_business_names" AS "ranked"
WHERE
  "profile"."user_id" = "ranked"."user_id"
  AND "ranked"."duplicate_position" > 1;

WITH "ranked_phones" AS (
  SELECT
    "user_id",
    ROW_NUMBER() OVER (
      PARTITION BY "phone_key"
      ORDER BY "updated_at", "user_id"
    ) AS "duplicate_position"
  FROM "user_registration_profiles"
)
UPDATE "user_registration_profiles" AS "profile"
SET "phone_key" =
  LEFT("profile"."phone_key", 7) ||
  RIGHT(REPLACE("profile"."user_id"::TEXT, '-', ''), 16)
FROM "ranked_phones" AS "ranked"
WHERE
  "profile"."user_id" = "ranked"."user_id"
  AND "ranked"."duplicate_position" > 1;

ALTER TABLE "user_registration_profiles"
ALTER COLUMN "business_name_key" SET NOT NULL,
ALTER COLUMN "phone_key" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "pending_registrations_business_name_key_key"
ON "pending_registrations"("business_name_key");

CREATE UNIQUE INDEX IF NOT EXISTS "pending_registrations_phone_key_key"
ON "pending_registrations"("phone_key");

CREATE UNIQUE INDEX IF NOT EXISTS "user_registration_profiles_business_name_key_key"
ON "user_registration_profiles"("business_name_key");

CREATE UNIQUE INDEX IF NOT EXISTS "user_registration_profiles_phone_key_key"
ON "user_registration_profiles"("phone_key");
