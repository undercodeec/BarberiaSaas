ALTER TABLE "pending_registrations"
  ADD COLUMN "privacy_policy_accepted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "privacy_consents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "policy_version" VARCHAR(80) NOT NULL,
  "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "privacy_consents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "privacy_consents_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "privacy_consents_user_id_accepted_at_idx"
  ON "privacy_consents"("user_id", "accepted_at");
