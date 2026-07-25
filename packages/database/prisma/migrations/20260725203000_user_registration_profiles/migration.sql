CREATE TYPE "RegistrationAccountType" AS ENUM ('BUSINESS', 'PROFESSIONAL');

ALTER TABLE "pending_registrations"
ADD COLUMN "account_type" "RegistrationAccountType",
ADD COLUMN "business_name" VARCHAR(120),
ADD COLUMN "phone" VARCHAR(24),
ADD COLUMN "country_code" CHAR(2),
ADD COLUMN "city" VARCHAR(120),
ADD COLUMN "opening_time" CHAR(5),
ADD COLUMN "closing_time" CHAR(5);

CREATE TABLE "user_registration_profiles" (
  "user_id" UUID NOT NULL,
  "account_type" "RegistrationAccountType" NOT NULL,
  "business_name" VARCHAR(120) NOT NULL,
  "country_code" CHAR(2) NOT NULL,
  "city" VARCHAR(120) NOT NULL,
  "opening_time" CHAR(5) NOT NULL,
  "closing_time" CHAR(5) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "user_registration_profiles_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "user_registration_profiles"
ADD CONSTRAINT "user_registration_profiles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
