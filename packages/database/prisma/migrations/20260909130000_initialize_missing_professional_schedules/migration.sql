-- Public availability intersects the business schedule with each barber's
-- schedule. Backfill only completely missing schedules so custom availability
-- is never replaced.
-- Prevent concurrent schedule replacements from creating a mixed schedule
-- between the absence check and the insert below.
LOCK TABLE "weekly_schedules" IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO "weekly_schedules" (
  "id",
  "membership_id",
  "location_id",
  "weekday",
  "start_minute",
  "end_minute",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  member_location."membership_id",
  business_schedule."location_id",
  business_schedule."weekday",
  business_schedule."start_minute",
  business_schedule."end_minute",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "member_locations" AS member_location
JOIN "memberships" AS membership
  ON membership."id" = member_location."membership_id"
JOIN "business_weekly_schedules" AS business_schedule
  ON business_schedule."location_id" = member_location."location_id"
WHERE membership."role" = 'BARBER'
  AND membership."status" = 'ACTIVE'
  AND business_schedule."is_open" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "weekly_schedules" AS weekly_schedule
    WHERE weekly_schedule."membership_id" = member_location."membership_id"
      AND weekly_schedule."location_id" = member_location."location_id"
  )
ON CONFLICT ("membership_id", "location_id", "weekday", "start_minute")
  DO NOTHING;
