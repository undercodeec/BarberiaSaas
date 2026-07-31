-- CreateEnum
CREATE TYPE "CommissionRuleType" AS ENUM ('SERVICE_PERCENTAGE', 'SERVICE_FIXED');

-- CreateEnum
CREATE TYPE "CommissionEntryStatus" AS ENUM ('PENDING', 'APPROVED', 'SETTLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "CommissionSettlementStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "cash_movements" DROP CONSTRAINT "cash_movements_cash_register_session_id_fkey";

-- AlterTable
ALTER TABLE "cash_movements" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "professional_membership_id" UUID NOT NULL,
    "service_id" UUID,
    "type" "CommissionRuleType" NOT NULL,
    "value" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_settlements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "professional_membership_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "gross_generated_cents" INTEGER NOT NULL,
    "commission_amount_cents" INTEGER NOT NULL,
    "total_payable_cents" INTEGER NOT NULL,
    "status" "CommissionSettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "commission_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "professional_membership_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "appointment_service_id" UUID NOT NULL,
    "rule_id" UUID,
    "settlement_id" UUID,
    "base_amount_cents" INTEGER NOT NULL,
    "commission_amount_cents" INTEGER NOT NULL,
    "status" "CommissionEntryStatus" NOT NULL DEFAULT 'PENDING',
    "calculation_snapshot" JSONB NOT NULL,
    "reversal_of_entry_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "commission_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commission_rules_organization_id_professional_membership_id_idx" ON "commission_rules"("organization_id", "professional_membership_id", "is_active");

-- CreateIndex
CREATE INDEX "commission_rules_service_id_effective_from_idx" ON "commission_rules"("service_id", "effective_from");

-- CreateIndex
CREATE INDEX "commission_settlements_organization_id_status_period_start_idx" ON "commission_settlements"("organization_id", "status", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "commission_settlements_organization_id_professional_members_key" ON "commission_settlements"("organization_id", "professional_membership_id", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "commission_entries_appointment_service_id_key" ON "commission_entries"("appointment_service_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_entries_reversal_of_entry_id_key" ON "commission_entries"("reversal_of_entry_id");

-- CreateIndex
CREATE INDEX "commission_entries_organization_id_professional_membership__idx" ON "commission_entries"("organization_id", "professional_membership_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "commission_entries_settlement_id_idx" ON "commission_entries"("settlement_id");

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_register_session_id_fkey" FOREIGN KEY ("cash_register_session_id") REFERENCES "cash_register_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
