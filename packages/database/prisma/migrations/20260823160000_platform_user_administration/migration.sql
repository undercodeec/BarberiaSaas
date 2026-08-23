ALTER TABLE "users"
  ADD COLUMN "suspended_at" TIMESTAMPTZ(3);

CREATE INDEX "users_suspended_at_idx" ON "users"("suspended_at");
