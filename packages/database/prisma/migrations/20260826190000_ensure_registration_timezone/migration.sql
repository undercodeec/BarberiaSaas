ALTER TABLE "user_registration_profiles"
  ADD COLUMN IF NOT EXISTS "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Guayaquil';

ALTER TABLE "pending_registrations"
  ADD COLUMN IF NOT EXISTS "timezone" VARCHAR(64);
