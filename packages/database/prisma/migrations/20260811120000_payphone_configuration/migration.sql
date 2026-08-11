CREATE TYPE "PayphoneEnvironment" AS ENUM ('TEST', 'PRODUCTION');
CREATE TYPE "PayphoneConnectionStatus" AS ENUM ('REQUIRES_ATTENTION', 'CONNECTED', 'ERROR');

CREATE TABLE "payphone_configurations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "environment" "PayphoneEnvironment" NOT NULL DEFAULT 'TEST',
  "store_id" VARCHAR(160) NOT NULL,
  "encrypted_token" TEXT NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT false,
  "connection_status" "PayphoneConnectionStatus" NOT NULL DEFAULT 'REQUIRES_ATTENTION',
  "connected_at" TIMESTAMPTZ(3),
  "last_tested_at" TIMESTAMPTZ(3),
  "last_error_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payphone_configurations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payphone_configurations_organization_id_key" UNIQUE ("organization_id"),
  CONSTRAINT "payphone_configurations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);