CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "AppointmentStatus" AS ENUM (
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
);

CREATE TYPE "AppointmentEventType" AS ENUM (
  'CREATED',
  'RESCHEDULED',
  'CANCELLED',
  'STATUS_CHANGED'
);

CREATE TABLE "appointments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "professional_membership_id" UUID NOT NULL,
  "client_name" VARCHAR(120) NOT NULL,
  "client_phone" VARCHAR(24),
  "client_email" VARCHAR(254),
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
  "reserves_slot" BOOLEAN NOT NULL DEFAULT true,
  "notes" VARCHAR(500),
  "cancellation_reason" VARCHAR(240),
  "cancelled_at" TIMESTAMPTZ(3),
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointments_time_range_check" CHECK ("starts_at" < "ends_at")
);

CREATE TABLE "appointment_services" (
  "id" UUID NOT NULL,
  "appointment_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "service_name" VARCHAR(120) NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "price_cents" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "appointment_services_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_services_duration_check" CHECK ("duration_minutes" BETWEEN 5 AND 480 AND "duration_minutes" % 5 = 0),
  CONSTRAINT "appointment_services_price_check" CHECK ("price_cents" >= 0)
);

CREATE TABLE "appointment_events" (
  "id" BIGSERIAL NOT NULL,
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "appointment_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "type" "AppointmentEventType" NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_professional_overlap"
  EXCLUDE USING gist (
    "professional_membership_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("reserves_slot");

CREATE INDEX "appointments_organization_id_starts_at_idx" ON "appointments"("organization_id", "starts_at");
CREATE INDEX "appointments_location_id_starts_at_idx" ON "appointments"("location_id", "starts_at");
CREATE INDEX "appointments_professional_membership_id_starts_at_idx" ON "appointments"("professional_membership_id", "starts_at");
CREATE UNIQUE INDEX "appointment_services_appointment_id_service_id_key" ON "appointment_services"("appointment_id", "service_id");
CREATE INDEX "appointment_services_service_id_idx" ON "appointment_services"("service_id");
CREATE INDEX "appointment_events_organization_id_id_idx" ON "appointment_events"("organization_id", "id");
CREATE INDEX "appointment_events_location_id_id_idx" ON "appointment_events"("location_id", "id");

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professional_membership_id_fkey" FOREIGN KEY ("professional_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
