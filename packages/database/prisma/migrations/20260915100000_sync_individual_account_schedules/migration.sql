-- An individual account has one professional (the owner), and the business
-- schedule editor is its schedule editor. Repair schedules created before
-- that rule was enforced so availability and booking validation agree.
LOCK TABLE "weekly_schedules" IN SHARE ROW EXCLUSIVE MODE;

DELETE FROM "weekly_schedules" AS weekly_schedule
USING "memberships" AS membership
JOIN "user_registration_profiles" AS profile
  ON profile."user_id" = membership."user_id"
WHERE weekly_schedule."membership_id" = membership."id"
  AND membership."role" = 'OWNER'
  AND membership."status" = 'ACTIVE'
  AND profile."account_type" = 'PROFESSIONAL';

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
  membership."id",
  business_schedule."location_id",
  business_schedule."weekday",
  business_schedule."start_minute",
  business_schedule."end_minute",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "memberships" AS membership
JOIN "user_registration_profiles" AS profile
  ON profile."user_id" = membership."user_id"
JOIN "member_locations" AS member_location
  ON member_location."membership_id" = membership."id"
JOIN "business_weekly_schedules" AS business_schedule
  ON business_schedule."location_id" = member_location."location_id"
WHERE membership."role" = 'OWNER'
  AND membership."status" = 'ACTIVE'
  AND profile."account_type" = 'PROFESSIONAL'
  AND business_schedule."is_open" = true
ON CONFLICT ("membership_id", "location_id", "weekday", "start_minute")
  DO NOTHING;
