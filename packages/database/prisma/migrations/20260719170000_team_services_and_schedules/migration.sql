CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TABLE "team_invitations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "inviter_user_id" UUID NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "role" "MembershipRole" NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "accepted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_categories" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "services" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "category_id" UUID,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "duration_minutes" INTEGER NOT NULL,
  "price_cents" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "services_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "services_duration_minutes_check" CHECK ("duration_minutes" BETWEEN 5 AND 480 AND "duration_minutes" % 5 = 0),
  CONSTRAINT "services_price_cents_check" CHECK ("price_cents" >= 0)
);

CREATE TABLE "professional_services" (
  "membership_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "custom_duration_minutes" INTEGER,
  "custom_price_cents" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "professional_services_pkey" PRIMARY KEY ("membership_id", "service_id", "location_id"),
  CONSTRAINT "professional_services_duration_check" CHECK ("custom_duration_minutes" IS NULL OR ("custom_duration_minutes" BETWEEN 5 AND 480 AND "custom_duration_minutes" % 5 = 0)),
  CONSTRAINT "professional_services_price_check" CHECK ("custom_price_cents" IS NULL OR "custom_price_cents" >= 0)
);

CREATE TABLE "weekly_schedules" (
  "id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "weekday" INTEGER NOT NULL,
  "start_minute" INTEGER NOT NULL,
  "end_minute" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "weekly_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "weekly_schedules_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "weekly_schedules_minutes_check" CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute")
);

CREATE TABLE "schedule_blocks" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "reason" VARCHAR(240),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "schedule_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "schedule_blocks_range_check" CHECK ("starts_at" < "ends_at")
);

CREATE UNIQUE INDEX "team_invitations_token_hash_key" ON "team_invitations"("token_hash");
CREATE INDEX "team_invitations_organization_id_status_idx" ON "team_invitations"("organization_id", "status");
CREATE INDEX "team_invitations_email_status_idx" ON "team_invitations"("email", "status");
CREATE UNIQUE INDEX "service_categories_organization_id_name_key" ON "service_categories"("organization_id", "name");
CREATE INDEX "service_categories_organization_id_sort_order_idx" ON "service_categories"("organization_id", "sort_order");
CREATE UNIQUE INDEX "services_organization_id_name_key" ON "services"("organization_id", "name");
CREATE INDEX "services_organization_id_is_active_idx" ON "services"("organization_id", "is_active");
CREATE INDEX "professional_services_service_id_location_id_idx" ON "professional_services"("service_id", "location_id");
CREATE UNIQUE INDEX "weekly_schedules_membership_id_location_id_weekday_start_minute_key" ON "weekly_schedules"("membership_id", "location_id", "weekday", "start_minute");
CREATE INDEX "weekly_schedules_location_id_weekday_idx" ON "weekly_schedules"("location_id", "weekday");
CREATE INDEX "schedule_blocks_membership_id_starts_at_ends_at_idx" ON "schedule_blocks"("membership_id", "starts_at", "ends_at");
CREATE INDEX "schedule_blocks_location_id_starts_at_idx" ON "schedule_blocks"("location_id", "starts_at");

ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "professional_services" ADD CONSTRAINT "professional_services_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "professional_services" ADD CONSTRAINT "professional_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "professional_services" ADD CONSTRAINT "professional_services_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_schedules" ADD CONSTRAINT "weekly_schedules_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_schedules" ADD CONSTRAINT "weekly_schedules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
