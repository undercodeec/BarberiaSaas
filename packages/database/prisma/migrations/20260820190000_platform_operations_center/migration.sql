CREATE TYPE "PlatformOperatorRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT', 'BILLING', 'OPERATIONS', 'READ_ONLY');
CREATE TYPE "PlatformSupportCasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "PlatformSupportCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING', 'CLOSED');
CREATE TYPE "PlatformAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
CREATE TYPE "PlatformPrivacyRequestType" AS ENUM ('DATA_EXPORT', 'DELETION');
CREATE TYPE "PlatformPrivacyRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');
CREATE TYPE "PlatformOverrideKind" AS ENUM ('FEATURE', 'LIMIT');

CREATE TABLE "platform_operators" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "PlatformOperatorRole" NOT NULL DEFAULT 'READ_ONLY',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "platform_operators_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_support_cases" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "category" VARCHAR(60) NOT NULL,
  "description" VARCHAR(2000) NOT NULL,
  "priority" "PlatformSupportCasePriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "PlatformSupportCaseStatus" NOT NULL DEFAULT 'OPEN',
  "created_by_user_id" UUID,
  "assigned_to_user_id" UUID,
  "sla_due_at" TIMESTAMPTZ(3),
  "closed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "platform_support_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_support_case_events" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "type" VARCHAR(60) NOT NULL,
  "note" VARCHAR(2000),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_support_case_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_audit_logs" (
  "id" UUID NOT NULL,
  "actor_user_id" UUID,
  "action" VARCHAR(100) NOT NULL,
  "entity_type" VARCHAR(80) NOT NULL,
  "entity_id" VARCHAR(120),
  "before_data" JSONB,
  "after_data" JSONB,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_alerts" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "type" VARCHAR(80) NOT NULL,
  "severity" VARCHAR(20) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "detail" VARCHAR(500) NOT NULL,
  "fingerprint" VARCHAR(180) NOT NULL,
  "status" "PlatformAlertStatus" NOT NULL DEFAULT 'OPEN',
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "acted_at" TIMESTAMPTZ(3),
  "acted_by_user_id" UUID,
  "resolution_note" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "platform_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_exports" (
  "id" UUID NOT NULL,
  "requested_by_user_id" UUID,
  "type" VARCHAR(60) NOT NULL,
  "format" VARCHAR(20) NOT NULL,
  "filters" JSONB NOT NULL DEFAULT '{}',
  "row_count" INTEGER NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_exports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_privacy_requests" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "subject_user_id" UUID,
  "type" "PlatformPrivacyRequestType" NOT NULL,
  "status" "PlatformPrivacyRequestStatus" NOT NULL DEFAULT 'OPEN',
  "reason" VARCHAR(1000) NOT NULL,
  "resolution_note" VARCHAR(1000),
  "created_by_user_id" UUID,
  "assigned_to_user_id" UUID,
  "due_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "platform_privacy_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_feature_overrides" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "kind" "PlatformOverrideKind" NOT NULL,
  "boolean_value" BOOLEAN,
  "integer_value" INTEGER,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "created_by_user_id" UUID,
  "revoked_at" TIMESTAMPTZ(3),
  "revoked_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "platform_feature_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_operators_user_id_key" ON "platform_operators"("user_id");
CREATE INDEX "platform_operators_is_active_role_idx" ON "platform_operators"("is_active", "role");
CREATE INDEX "platform_support_cases_organization_id_status_updated_at_idx" ON "platform_support_cases"("organization_id", "status", "updated_at");
CREATE INDEX "platform_support_cases_assigned_to_user_id_status_idx" ON "platform_support_cases"("assigned_to_user_id", "status");
CREATE INDEX "platform_support_case_events_case_id_created_at_idx" ON "platform_support_case_events"("case_id", "created_at");
CREATE INDEX "platform_audit_logs_action_created_at_idx" ON "platform_audit_logs"("action", "created_at");
CREATE INDEX "platform_audit_logs_entity_type_entity_id_created_at_idx" ON "platform_audit_logs"("entity_type", "entity_id", "created_at");
CREATE UNIQUE INDEX "platform_alerts_fingerprint_key" ON "platform_alerts"("fingerprint");
CREATE INDEX "platform_alerts_status_severity_occurred_at_idx" ON "platform_alerts"("status", "severity", "occurred_at");
CREATE INDEX "platform_alerts_organization_id_status_idx" ON "platform_alerts"("organization_id", "status");
CREATE INDEX "platform_exports_requested_by_user_id_created_at_idx" ON "platform_exports"("requested_by_user_id", "created_at");
CREATE INDEX "platform_exports_expires_at_idx" ON "platform_exports"("expires_at");
CREATE INDEX "platform_privacy_requests_status_due_at_created_at_idx" ON "platform_privacy_requests"("status", "due_at", "created_at");
CREATE INDEX "platform_privacy_requests_organization_id_status_idx" ON "platform_privacy_requests"("organization_id", "status");
CREATE INDEX "platform_privacy_requests_subject_user_id_status_idx" ON "platform_privacy_requests"("subject_user_id", "status");
CREATE INDEX "platform_feature_overrides_organization_id_key_revoked_at_expires_at_idx" ON "platform_feature_overrides"("organization_id", "key", "revoked_at", "expires_at");
CREATE INDEX "platform_feature_overrides_expires_at_revoked_at_idx" ON "platform_feature_overrides"("expires_at", "revoked_at");

ALTER TABLE "platform_operators" ADD CONSTRAINT "platform_operators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_operators" ADD CONSTRAINT "platform_operators_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_support_cases" ADD CONSTRAINT "platform_support_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_support_cases" ADD CONSTRAINT "platform_support_cases_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_support_cases" ADD CONSTRAINT "platform_support_cases_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_support_case_events" ADD CONSTRAINT "platform_support_case_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "platform_support_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_support_case_events" ADD CONSTRAINT "platform_support_case_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_alerts" ADD CONSTRAINT "platform_alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_alerts" ADD CONSTRAINT "platform_alerts_acted_by_user_id_fkey" FOREIGN KEY ("acted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_exports" ADD CONSTRAINT "platform_exports_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_privacy_requests" ADD CONSTRAINT "platform_privacy_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_privacy_requests" ADD CONSTRAINT "platform_privacy_requests_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_privacy_requests" ADD CONSTRAINT "platform_privacy_requests_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_privacy_requests" ADD CONSTRAINT "platform_privacy_requests_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_feature_overrides" ADD CONSTRAINT "platform_feature_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_feature_overrides" ADD CONSTRAINT "platform_feature_overrides_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_feature_overrides" ADD CONSTRAINT "platform_feature_overrides_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
