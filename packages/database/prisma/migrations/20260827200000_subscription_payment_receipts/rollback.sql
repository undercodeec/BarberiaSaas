-- Rollback manual: ejecutar únicamente después de confirmar que esta migración
-- es la última aplicada y que no hay recibos que deban conservarse.
ALTER TABLE "subscription_payment_receipts"
  DROP CONSTRAINT "subscription_payment_receipts_subscription_payment_attempt_id_fkey";
ALTER TABLE "subscription_payment_receipts"
  DROP CONSTRAINT "subscription_payment_receipts_subscription_invoice_id_fkey";
ALTER TABLE "subscription_payment_receipts"
  DROP CONSTRAINT "subscription_payment_receipts_organization_id_fkey";
DROP TABLE "subscription_payment_receipts";
DROP TYPE "SubscriptionPaymentReceiptDeliveryStatus";
