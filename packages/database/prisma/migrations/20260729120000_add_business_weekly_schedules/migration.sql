CREATE TABLE "business_weekly_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "weekday" SMALLINT NOT NULL,
  "is_open" BOOLEAN NOT NULL DEFAULT true,
  "start_minute" SMALLINT NOT NULL,
  "end_minute" SMALLINT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_weekly_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_weekly_schedules_weekday_check"
    CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "business_weekly_schedules_minutes_check"
    CHECK (
      "start_minute" >= 0
      AND "end_minute" <= 1440
      AND "start_minute" < "end_minute"
    )
);

CREATE UNIQUE INDEX "business_weekly_schedules_location_id_weekday_key"
  ON "business_weekly_schedules"("location_id", "weekday");

CREATE INDEX "business_weekly_schedules_organization_id_weekday_idx"
  ON "business_weekly_schedules"("organization_id", "weekday");

ALTER TABLE "business_weekly_schedules"
  ADD CONSTRAINT "business_weekly_schedules_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "business_weekly_schedules"
  ADD CONSTRAINT "business_weekly_schedules_location_id_fkey"
  FOREIGN KEY ("location_id")
  REFERENCES "locations"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

INSERT INTO "business_weekly_schedules" (
  "organization_id",
  "location_id",
  "weekday",
  "is_open",
  "start_minute",
  "end_minute"
)
SELECT
  location."organization_id",
  location."id",
  weekday.value,
  true,
  COALESCE(
    split_part(profile."opening_time", ':', 1)::INTEGER * 60
      + split_part(profile."opening_time", ':', 2)::INTEGER,
    540
  ),
  COALESCE(
    split_part(profile."closing_time", ':', 1)::INTEGER * 60
      + split_part(profile."closing_time", ':', 2)::INTEGER,
    1080
  )
FROM "locations" AS location
CROSS JOIN generate_series(0, 6) AS weekday(value)
LEFT JOIN LATERAL (
  SELECT registration_profile."opening_time", registration_profile."closing_time"
  FROM "memberships" AS membership
  JOIN "user_registration_profiles" AS registration_profile
    ON registration_profile."user_id" = membership."user_id"
  WHERE membership."organization_id" = location."organization_id"
    AND membership."role" = 'OWNER'
  ORDER BY membership."created_at" ASC
  LIMIT 1
) AS profile ON true
ON CONFLICT ("location_id", "weekday") DO NOTHING;
