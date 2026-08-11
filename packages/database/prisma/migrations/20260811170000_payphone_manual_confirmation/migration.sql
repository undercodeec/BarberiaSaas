ALTER TABLE "payment_attempts"
  ADD COLUMN "manually_confirmed_at" TIMESTAMPTZ(3),
  ADD COLUMN "manually_confirmed_by_user_id" UUID,
  ADD COLUMN "manual_confirmation_note" VARCHAR(500);

ALTER TABLE "payment_attempts"
  ADD CONSTRAINT "payment_attempts_manually_confirmed_by_user_id_fkey"
  FOREIGN KEY ("manually_confirmed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "payment_attempts_manually_confirmed_by_user_id_idx"
  ON "payment_attempts"("manually_confirmed_by_user_id");