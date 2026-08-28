import { describe, expect, it } from 'vitest';

import {
  buildTemporaryPaymentReceiptPdf,
  NAVA_POLICIES_URL,
  paymentReceiptEmailContent,
  sriProductionBillingIsEnabled,
  TEMPORARY_RECEIPT_DISCLAIMER,
} from './subscription-payment-receipts';
import { readConfig } from './config';

describe('comprobantes temporales de pago de suscripción', () => {
  it('genera un PDF que identifica inequívocamente que no es una factura SRI', () => {
    const pdf = buildTemporaryPaymentReceiptPdf({
      currencyCode: 'USD',
      internalReference: 'N12345678901234',
      organizationName: 'Barbería Norte',
      paidAt: new Date('2026-08-27T15:00:00.000Z'),
      paymentProvider: 'payphone_web_button',
      periodEndsAt: new Date('2026-09-26T15:00:00.000Z'),
      periodStartsAt: new Date('2026-08-27T15:00:00.000Z'),
      planName: 'Nava Esencial',
      providerTransactionId: '9001',
      receiptNumber: 'NAVA-R-2026-ABCDEF0123456789',
      recipientName: 'Barbería Norte S.A.',
      totalCents: 983,
    });
    expect(pdf.subarray(0, 8).toString('ascii')).toBe('%PDF-1.4');
    expect(pdf.toString('latin1')).toContain('NO ES FACTURA ELECTRONICA');
    expect(pdf.toString('latin1')).toContain('/Logo 5 0 R');
    expect(pdf.toString('latin1')).toContain(NAVA_POLICIES_URL);
    expect(TEMPORARY_RECEIPT_DISCLAIMER).toContain('no es una factura');
  });

  it('presenta por correo el detalle de compra, vigencia y enlace a políticas', () => {
    const email = paymentReceiptEmailContent({
      currencyCode: 'USD',
      internalReference: 'N12345678901234',
      organizationName: 'Barbería Norte',
      paidAt: new Date('2026-08-27T15:00:00.000Z'),
      paymentProvider: 'payphone_web_button',
      periodEndsAt: new Date('2026-09-26T15:00:00.000Z'),
      periodStartsAt: new Date('2026-08-27T15:00:00.000Z'),
      planName: 'Nava Esencial',
      providerTransactionId: '9001',
      receiptNumber: 'NAVA-R-2026-ABCDEF0123456789',
      totalCents: 983,
    });
    expect(email.html).toContain('cid:nava-logo');
    expect(email.html).toContain('Nava Esencial');
    expect(email.html).toContain('Renovación');
    expect(email.text).toContain('Duración: 30 días');
    expect(email.text).toContain(NAVA_POLICIES_URL);
  });

  it('solo deja de encolar recibos temporales cuando SRI productivo está doblemente habilitado', () => {
    const base = {
      CORS_ORIGIN: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://user:password@localhost:5432/nava',
    };
    expect(sriProductionBillingIsEnabled(readConfig(base))).toBe(false);
    expect(
      sriProductionBillingIsEnabled(
        readConfig({
          ...base,
          SRI_EMISSION_ENABLED: 'true',
          SRI_ENV: 'production',
          SRI_PRODUCTION_ENABLED: 'true',
          SRI_CERTIFICATE_PASSWORD: 'secret',
          SRI_CERTIFICATE_PATH: '/cert.p12',
          SRI_ESTABLISHMENT_CODE: '001',
          SRI_ISSUER_LEGAL_NAME: 'Nava S.A.',
          SRI_ISSUER_RUC: '1790000000001',
          SRI_MAIN_ADDRESS: 'Quito',
          SRI_EMISSION_POINT_CODE: '001',
          SRI_ACCOUNTING_REQUIRED: 'NO',
          SRI_PAYMENT_METHOD_CODE: '19',
          SRI_TAX_BASIS_POINTS: '0',
          SRI_TAX_CODE: '2',
          SRI_TAX_PERCENTAGE_CODE: '0',
        }),
      ),
    ).toBe(true);
  });
});
