ALTER TABLE "pending_registrations"
ADD COLUMN "failed_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "locked_until" TIMESTAMPTZ(3);

CREATE INDEX "pending_registrations_locked_until_idx"
ON "pending_registrations"("locked_until");
