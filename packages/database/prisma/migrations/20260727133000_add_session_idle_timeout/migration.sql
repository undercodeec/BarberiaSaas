ALTER TABLE "sessions"
ADD COLUMN "last_active_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "sessions_last_active_at_idx"
ON "sessions"("last_active_at");
