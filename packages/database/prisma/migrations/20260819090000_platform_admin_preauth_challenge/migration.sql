ALTER TABLE "platform_admin_access_challenges"
  ALTER COLUMN "session_id" DROP NOT NULL;

ALTER TABLE "platform_admin_access_challenges"
  ADD COLUMN "challenge_token_hash" CHAR(64);

CREATE UNIQUE INDEX "platform_admin_access_challenges_challenge_token_hash_key"
  ON "platform_admin_access_challenges"("challenge_token_hash");
