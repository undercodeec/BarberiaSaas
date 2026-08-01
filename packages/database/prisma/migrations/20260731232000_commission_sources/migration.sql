-- Manual sales can identify the catalog service and professional that generated
-- the commission. Free sales keep both fields null.
ALTER TABLE "cash_movements"
ADD COLUMN "service_id" UUID,
ADD COLUMN "professional_membership_id" UUID;

CREATE INDEX "cash_movements_professional_membership_id_service_id_idx"
ON "cash_movements"("professional_membership_id", "service_id");

CREATE UNIQUE INDEX "cash_movements_appointment_id_key"
ON "cash_movements"("appointment_id");

ALTER TABLE "cash_movements"
ADD CONSTRAINT "cash_movements_commissionable_sale_check"
CHECK (
  ("service_id" IS NULL AND "professional_membership_id" IS NULL)
  OR
  (
    "type" = 'SALE'
    AND "service_id" IS NOT NULL
    AND "professional_membership_id" IS NOT NULL
  )
);

-- Appointment commissions and manual-sale commissions share the same ledger.
-- Reversal entries intentionally have no direct source because they point to
-- the original immutable entry through reversal_of_entry_id.
ALTER TABLE "commission_entries"
ALTER COLUMN "appointment_id" DROP NOT NULL,
ALTER COLUMN "appointment_service_id" DROP NOT NULL,
ADD COLUMN "cash_movement_id" UUID;

CREATE UNIQUE INDEX "commission_entries_cash_movement_id_key"
ON "commission_entries"("cash_movement_id");

ALTER TABLE "commission_entries"
ADD CONSTRAINT "commission_entries_source_check"
CHECK (
  (
    "reversal_of_entry_id" IS NULL
    AND (
      (
        "appointment_id" IS NOT NULL
        AND "appointment_service_id" IS NOT NULL
        AND "cash_movement_id" IS NULL
      )
      OR
      (
        "appointment_id" IS NULL
        AND "appointment_service_id" IS NULL
        AND "cash_movement_id" IS NOT NULL
      )
    )
  )
  OR
  (
    "reversal_of_entry_id" IS NOT NULL
    AND "appointment_id" IS NULL
    AND "appointment_service_id" IS NULL
    AND "cash_movement_id" IS NULL
  )
);
