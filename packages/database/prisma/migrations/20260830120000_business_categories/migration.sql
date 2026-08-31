CREATE TYPE "BusinessCategory" AS ENUM (
  'BARBERSHOP',
  'BEAUTY_SALON',
  'NAIL_STUDIO',
  'SPA_WELLNESS',
  'AESTHETICS',
  'PERSONAL_CARE_OTHER'
);

ALTER TABLE "pending_registrations"
  ADD COLUMN "business_category" "BusinessCategory";

ALTER TABLE "user_registration_profiles"
  ADD COLUMN "business_category" "BusinessCategory" NOT NULL DEFAULT 'BARBERSHOP';

ALTER TABLE "organizations"
  ADD COLUMN "business_category" "BusinessCategory" NOT NULL DEFAULT 'BARBERSHOP';
