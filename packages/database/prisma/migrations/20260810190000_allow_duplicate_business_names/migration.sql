-- Los nombres comerciales no identifican de forma ?nica una cuenta.
DROP INDEX IF EXISTS "pending_registrations_business_name_key_key";
DROP INDEX IF EXISTS "user_registration_profiles_business_name_key_key";

CREATE INDEX IF NOT EXISTS "pending_registrations_business_name_key_idx"
ON "pending_registrations"("business_name_key");
CREATE INDEX IF NOT EXISTS "user_registration_profiles_business_name_key_idx"
ON "user_registration_profiles"("business_name_key");
