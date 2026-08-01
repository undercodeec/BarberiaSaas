-- CreateEnum
CREATE TYPE "ProfessionalAdvanceStatus" AS ENUM ('PENDING', 'PARTIALLY_DEDUCTED', 'FULLY_DEDUCTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SettlementAdvanceStatus" AS ENUM ('RESERVED', 'APPLIED', 'RELEASED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CashMovementType" ADD VALUE 'PROFESSIONAL_ADVANCE';
ALTER TYPE "CashMovementType" ADD VALUE 'PROFESSIONAL_ADVANCE_REVERSAL';
ALTER TYPE "CashMovementType" ADD VALUE 'COMMISSION_SETTLEMENT';

-- AlterTable
ALTER TABLE "commission_entries" ADD COLUMN     "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "commission_settlements" ADD COLUMN     "adjustment_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "advance_deduction_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "approved_at" TIMESTAMPTZ(3),
ADD COLUMN     "approved_by_user_id" UUID,
ADD COLUMN     "cancellation_reason" VARCHAR(240),
ADD COLUMN     "cancelled_at" TIMESTAMPTZ(3),
ADD COLUMN     "cancelled_by_user_id" UUID,
ADD COLUMN     "cash_movement_id" UUID,
ADD COLUMN     "created_by_user_id" UUID NOT NULL,
ADD COLUMN     "paid_at" TIMESTAMPTZ(3),
ADD COLUMN     "paid_by_user_id" UUID,
ADD COLUMN     "payment_method" "PaymentMethod",
ADD COLUMN     "payment_reference" VARCHAR(120);

-- CreateTable
CREATE TABLE "professional_advances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "professional_membership_id" UUID NOT NULL,
    "cash_movement_id" UUID,
    "reversal_cash_movement_id" UUID,
    "original_amount_cents" INTEGER NOT NULL,
    "reserved_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "deducted_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "payment_method" "PaymentMethod" NOT NULL,
    "reference" VARCHAR(120),
    "notes" VARCHAR(500),
    "status" "ProfessionalAdvanceStatus" NOT NULL DEFAULT 'PENDING',
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" UUID NOT NULL,
    "reversed_at" TIMESTAMPTZ(3),
    "reversed_by_user_id" UUID,
    "reversal_reason" VARCHAR(240),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "professional_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_settlement_advances" (
    "id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "advance_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "SettlementAdvanceStatus" NOT NULL DEFAULT 'RESERVED',
    "applied_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "commission_settlement_advances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "professional_advances_cash_movement_id_key" ON "professional_advances"("cash_movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "professional_advances_reversal_cash_movement_id_key" ON "professional_advances"("reversal_cash_movement_id");

-- CreateIndex
CREATE INDEX "professional_advances_organization_id_professional_membersh_idx" ON "professional_advances"("organization_id", "professional_membership_id", "status", "occurred_at");

-- CreateIndex
CREATE INDEX "commission_settlement_advances_advance_id_status_idx" ON "commission_settlement_advances"("advance_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "commission_settlement_advances_settlement_id_advance_id_key" ON "commission_settlement_advances"("settlement_id", "advance_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_settlements_cash_movement_id_key" ON "commission_settlements"("cash_movement_id");
