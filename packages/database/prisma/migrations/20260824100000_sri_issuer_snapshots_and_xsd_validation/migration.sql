-- Conserva los datos fiscales del emisor que realmente se incluyeron en cada
-- comprobante. No modificar la migración inicial de SRI ya existente.
ALTER TABLE "sri_invoices"
  ADD COLUMN "issuer_ruc" CHAR(13) NOT NULL DEFAULT '0000000000000',
  ADD COLUMN "issuer_legal_name" VARCHAR(300) NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN "issuer_trade_name" VARCHAR(300),
  ADD COLUMN "issuer_main_address" VARCHAR(300) NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN "issuer_accounting_required" CHAR(2) NOT NULL DEFAULT 'NO',
  ADD COLUMN "issuer_tax_regime" "SriTaxRegime" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "processing_lock_token" UUID,
  ADD COLUMN "processing_lock_until" TIMESTAMPTZ(3);

ALTER TABLE "sri_invoices"
  ALTER COLUMN "issuer_ruc" DROP DEFAULT,
  ALTER COLUMN "issuer_legal_name" DROP DEFAULT,
  ALTER COLUMN "issuer_main_address" DROP DEFAULT,
  ALTER COLUMN "issuer_accounting_required" DROP DEFAULT,
  ALTER COLUMN "issuer_tax_regime" DROP DEFAULT;

CREATE INDEX "sri_invoices_processing_lock_until_idx"
  ON "sri_invoices"("processing_lock_until");
