-- Keep the existing category value for compatibility, but distinguish values
-- supplied by the user from the BARBERSHOP default assigned during rollout.
ALTER TABLE "pending_registrations"
  ADD COLUMN "business_category_confirmed_at" TIMESTAMPTZ(3);

ALTER TABLE "user_registration_profiles"
  ADD COLUMN "business_category_confirmed_at" TIMESTAMPTZ(3);
