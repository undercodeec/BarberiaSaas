ALTER TABLE "users"
ADD COLUMN "email_verified_at" TIMESTAMPTZ(3);

CREATE TABLE "email_verification_codes" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "code_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_verification_codes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "email_verification_codes_user_id_expires_at_idx"
ON "email_verification_codes"("user_id", "expires_at");
