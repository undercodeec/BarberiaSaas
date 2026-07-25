CREATE TABLE "pending_registrations" (
  "id" UUID NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "full_name" VARCHAR(120) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "code_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pending_registrations_email_key"
ON "pending_registrations"("email");

CREATE INDEX "pending_registrations_expires_at_idx"
ON "pending_registrations"("expires_at");
