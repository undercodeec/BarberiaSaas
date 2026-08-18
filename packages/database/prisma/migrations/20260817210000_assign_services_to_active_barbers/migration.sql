-- Give existing active barbers the active services of their organization at
-- each location where they work. New invitation acceptances do this in code.
INSERT INTO "professional_services" (
  "membership_id",
  "service_id",
  "location_id"
)
SELECT
  membership."id",
  service."id",
  member_location."location_id"
FROM "memberships" AS membership
JOIN "member_locations" AS member_location
  ON member_location."membership_id" = membership."id"
JOIN "locations" AS location
  ON location."id" = member_location."location_id"
  AND location."organization_id" = membership."organization_id"
  AND location."is_active" = true
JOIN "services" AS service
  ON service."organization_id" = membership."organization_id"
  AND service."is_active" = true
WHERE membership."role" = 'BARBER'
  AND membership."status" = 'ACTIVE'
ON CONFLICT ("membership_id", "service_id", "location_id") DO NOTHING;
