ALTER TABLE "clients"
  ALTER COLUMN "last_name" DROP NOT NULL,
  ALTER COLUMN "phone" SET NOT NULL,
  ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "updated_by_user_id" UUID;

UPDATE "clients" AS client
SET
  "created_by_user_id" = (
    SELECT member."user_id"
    FROM "memberships" AS member
    WHERE member."organization_id" = client."organization_id"
      AND member."status" = 'ACTIVE'
    ORDER BY member."created_at" ASC
    LIMIT 1
  ),
  "updated_by_user_id" = (
    SELECT member."user_id"
    FROM "memberships" AS member
    WHERE member."organization_id" = client."organization_id"
      AND member."status" = 'ACTIVE'
    ORDER BY member."created_at" ASC
    LIMIT 1
  )
WHERE client."created_by_user_id" IS NULL;

ALTER TABLE "clients"
  ALTER COLUMN "created_by_user_id" SET NOT NULL,
  ALTER COLUMN "updated_by_user_id" SET NOT NULL,
  ADD CONSTRAINT "clients_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "clients_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "clients_created_by_user_id_idx" ON "clients"("created_by_user_id");
