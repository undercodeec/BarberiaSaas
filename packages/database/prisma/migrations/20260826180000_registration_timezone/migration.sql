ALTER TABLE "user_registration_profiles"
  ADD COLUMN "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Guayaquil';

ALTER TABLE "pending_registrations"
  ADD COLUMN "timezone" VARCHAR(64);
