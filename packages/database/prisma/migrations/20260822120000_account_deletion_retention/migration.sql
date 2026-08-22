CREATE TABLE "account_deletion_retentions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "identifier_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "account_deletion_retentions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_deletion_retentions_identifier_hash_key"
  ON "account_deletion_retentions"("identifier_hash");

CREATE INDEX "account_deletion_retentions_expires_at_idx"
  ON "account_deletion_retentions"("expires_at");

CREATE INDEX "account_deletion_retentions_user_id_idx"
  ON "account_deletion_retentions"("user_id");
