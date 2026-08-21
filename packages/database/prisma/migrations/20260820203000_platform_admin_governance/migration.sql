CREATE TYPE "PlatformConfigurationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "platform_organization_notes" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "category" VARCHAR(40) NOT NULL DEFAULT 'commercial',
  "note" VARCHAR(2000) NOT NULL,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_organization_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_configuration_versions" (
  "id" UUID NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "PlatformConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
  "value" JSONB NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "created_by_user_id" UUID,
  "approved_by_user_id" UUID,
  "rollback_of_version_id" UUID,
  "published_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "platform_configuration_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_organization_notes_organization_id_created_at_idx" ON "platform_organization_notes"("organization_id", "created_at");
CREATE UNIQUE INDEX "platform_configuration_versions_key_version_key" ON "platform_configuration_versions"("key", "version");
CREATE INDEX "platform_configuration_versions_key_status_created_at_idx" ON "platform_configuration_versions"("key", "status", "created_at");

ALTER TABLE "platform_organization_notes" ADD CONSTRAINT "platform_organization_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_organization_notes" ADD CONSTRAINT "platform_organization_notes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_configuration_versions" ADD CONSTRAINT "platform_configuration_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_configuration_versions" ADD CONSTRAINT "platform_configuration_versions_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_configuration_versions" ADD CONSTRAINT "platform_configuration_versions_rollback_of_version_id_fkey" FOREIGN KEY ("rollback_of_version_id") REFERENCES "platform_configuration_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
