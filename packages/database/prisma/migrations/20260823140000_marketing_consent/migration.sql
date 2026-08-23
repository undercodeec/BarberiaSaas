ALTER TABLE "pending_registrations"
  ADD COLUMN "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "marketing_consents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "policy_version" VARCHAR(80) NOT NULL,
  "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawn_at" TIMESTAMPTZ(3),

  CONSTRAINT "marketing_consents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketing_consents_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "marketing_consents_user_id_withdrawn_at_idx"
  ON "marketing_consents"("user_id", "withdrawn_at");
