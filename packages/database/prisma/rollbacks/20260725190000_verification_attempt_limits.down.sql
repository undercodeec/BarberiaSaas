DROP INDEX IF EXISTS "pending_registrations_locked_until_idx";

ALTER TABLE "pending_registrations"
DROP COLUMN IF EXISTS "locked_until",
DROP COLUMN IF EXISTS "failed_attempts";
