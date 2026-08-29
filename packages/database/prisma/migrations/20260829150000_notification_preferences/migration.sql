CREATE TYPE "NotificationCategory" AS ENUM (
  'AGENDA',
  'CASH',
  'INVENTORY',
  'TEAM',
  'REVIEWS',
  'SUBSCRIPTION',
  'BILLING',
  'SECURITY'
);

CREATE TABLE "notification_preferences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "push_enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_user_id_category_key"
  ON "notification_preferences"("user_id", "category");

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
