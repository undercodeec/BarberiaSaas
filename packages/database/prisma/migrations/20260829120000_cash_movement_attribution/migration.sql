ALTER TABLE "cash_movements"
  ADD COLUMN "professional_name_snapshot" VARCHAR(120),
  ADD COLUMN "seller_membership_id" UUID,
  ADD COLUMN "seller_name_snapshot" VARCHAR(120),
  ADD COLUMN "recorded_by_name_snapshot" VARCHAR(120);

CREATE INDEX "cash_movements_seller_membership_id_created_at_idx"
  ON "cash_movements"("seller_membership_id", "created_at");
