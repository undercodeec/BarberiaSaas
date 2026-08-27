-- Repair historical professional-location pairs that were created after the
-- first catalog backfill. Owners can act as professionals too, but were not
-- included in that earlier migration.
INSERT INTO "professional_services" (
  "membership_id",
  "service_id",
  "location_id",
  "created_at",
  "updated_at"
)
SELECT
  membership."id",
  service."id",
  member_location."location_id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
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
WHERE membership."role" IN ('BARBER', 'OWNER')
  AND membership."status" = 'ACTIVE'
ON CONFLICT ("membership_id", "service_id", "location_id") DO NOTHING;
