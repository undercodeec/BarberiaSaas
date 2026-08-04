CREATE TABLE "platform_admin_access_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admin_access_challenges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_admin_access_challenges_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "platform_admin_access_challenges_session_id_fkey"
      FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "platform_admin_access_challenges_session_id_verified_at_idx"
  ON "platform_admin_access_challenges"("session_id", "verified_at");

CREATE INDEX "platform_admin_access_challenges_user_id_expires_at_idx"
  ON "platform_admin_access_challenges"("user_id", "expires_at");
