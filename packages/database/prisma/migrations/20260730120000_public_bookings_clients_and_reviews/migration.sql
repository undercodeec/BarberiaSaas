ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'PENDING_VERIFICATION' BEFORE 'SCHEDULED';
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'AWAITING_CONFIRMATION' AFTER 'CONFIRMED';
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'EXPIRED' AFTER 'NO_SHOW';

CREATE TYPE "AppointmentSource" AS ENUM ('MANUAL', 'PUBLIC_BOOKING', 'WALK_IN');
CREATE TYPE "UnconfirmedBookingAction" AS ENUM ('KEEP', 'CANCEL');

ALTER TABLE "organizations"
  ADD COLUMN "booking_confirmation_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "booking_reminder_minutes" INTEGER NOT NULL DEFAULT 1440,
  ADD COLUMN "booking_confirmation_deadline_minutes" INTEGER NOT NULL DEFAULT 360,
  ADD COLUMN "booking_unconfirmed_action" "UnconfirmedBookingAction" NOT NULL DEFAULT 'KEEP',
  ADD COLUMN "booking_cancellation_lead_minutes" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN "booking_reschedule_lead_minutes" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN "booking_policy_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "booking_policy_text" VARCHAR(1000) NOT NULL DEFAULT 'Acepto asistir puntualmente y cancelar o reprogramar dentro del plazo informado por el negocio.',
  ADD CONSTRAINT "organizations_booking_reminder_minutes_check" CHECK ("booking_reminder_minutes" BETWEEN 60 AND 10080),
  ADD CONSTRAINT "organizations_booking_confirmation_deadline_check" CHECK ("booking_confirmation_deadline_minutes" BETWEEN 0 AND 10080),
  ADD CONSTRAINT "organizations_booking_cancellation_lead_check" CHECK ("booking_cancellation_lead_minutes" BETWEEN 0 AND 43200),
  ADD CONSTRAINT "organizations_booking_reschedule_lead_check" CHECK ("booking_reschedule_lead_minutes" BETWEEN 0 AND 43200);

ALTER TABLE "services" ADD COLUMN "online_booking" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "clients"
  ADD COLUMN "source" "AppointmentSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3),
  ALTER COLUMN "created_by_user_id" DROP NOT NULL,
  ALTER COLUMN "updated_by_user_id" DROP NOT NULL;
ALTER TABLE "clients" DROP CONSTRAINT "clients_created_by_user_id_fkey";
ALTER TABLE "clients" DROP CONSTRAINT "clients_updated_by_user_id_fkey";
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clients" ADD CONSTRAINT "clients_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "appointments"
  ADD COLUMN "client_id" UUID,
  ADD COLUMN "source" "AppointmentSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "policy_accepted_at" TIMESTAMPTZ(3),
  ADD COLUMN "policy_version" INTEGER,
  ADD COLUMN "attendance_confirmation_requested_at" TIMESTAMPTZ(3),
  ADD COLUMN "attendance_confirmation_deadline_at" TIMESTAMPTZ(3),
  ADD COLUMN "attendance_confirmed_at" TIMESTAMPTZ(3),
  ADD COLUMN "verification_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "public_idempotency_key_hash" CHAR(64),
  ALTER COLUMN "created_by_user_id" DROP NOT NULL,
  ALTER COLUMN "updated_by_user_id" DROP NOT NULL;
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_created_by_user_id_fkey";
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_updated_by_user_id_fkey";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "appointments_client_id_starts_at_idx" ON "appointments"("client_id", "starts_at");
CREATE UNIQUE INDEX "appointments_organization_id_public_idempotency_key_hash_key" ON "appointments"("organization_id", "public_idempotency_key_hash");

ALTER TABLE "appointment_events" ALTER COLUMN "actor_user_id" DROP NOT NULL;
ALTER TABLE "appointment_events" DROP CONSTRAINT "appointment_events_actor_user_id_fkey";
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "public_booking_access" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "appointment_id" UUID NOT NULL,
  "verification_code_hash" CHAR(64) NOT NULL,
  "verification_attempts" INTEGER NOT NULL DEFAULT 0,
  "management_token_hash" CHAR(64),
  "reminder_token_hash" CHAR(64),
  "verified_at" TIMESTAMPTZ(3),
  "management_expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_booking_access_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "public_booking_access_attempts_check" CHECK ("verification_attempts" BETWEEN 0 AND 5)
);
CREATE UNIQUE INDEX "public_booking_access_appointment_id_key" ON "public_booking_access"("appointment_id");
CREATE UNIQUE INDEX "public_booking_access_management_token_hash_key" ON "public_booking_access"("management_token_hash");
CREATE UNIQUE INDEX "public_booking_access_reminder_token_hash_key" ON "public_booking_access"("reminder_token_hash");
CREATE INDEX "public_booking_access_verified_at_management_expires_at_idx" ON "public_booking_access"("verified_at", "management_expires_at");
ALTER TABLE "public_booking_access" ADD CONSTRAINT "public_booking_access_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "appointment_reviews" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "appointment_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "professional_membership_id" UUID NOT NULL,
  "client_name" VARCHAR(120) NOT NULL,
  "rating" SMALLINT NOT NULL,
  "comment" VARCHAR(1000),
  "is_visible" BOOLEAN NOT NULL DEFAULT true,
  "hidden_at" TIMESTAMPTZ(3),
  "hidden_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "appointment_reviews_appointment_id_key" ON "appointment_reviews"("appointment_id");
CREATE INDEX "appointment_reviews_organization_id_is_visible_created_at_idx" ON "appointment_reviews"("organization_id", "is_visible", "created_at");
CREATE INDEX "appointment_reviews_professional_membership_id_is_visible_created_at_idx" ON "appointment_reviews"("professional_membership_id", "is_visible", "created_at");
ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_professional_membership_id_fkey" FOREIGN KEY ("professional_membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_hidden_by_user_id_fkey" FOREIGN KEY ("hidden_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
