import { describe, expect, it } from 'vitest';

import { buildSriInvoiceXml } from './sri-core';
import { validateSriInvoiceXml } from './sri-xsd';

function invoiceXml() {
  return buildSriInvoiceXml({
    accessKey: '2308202601000000000000110010010000000011234567810',
    buyer: {
      identification: '1712345678',
      identificationType: '05',
      name: 'Comprador de prueba',
    },
    description: 'Suscripción Nava Esencial',
    environment: 'test',
    invoiceDate: new Date('2026-08-23T12:00:00.000Z'),
    issuer: {
      accountingRequired: 'NO',
      emissionPointCode: '001',
      establishmentCode: '001',
      legalName: 'RAZÓN SOCIAL DE PRUEBA',
      mainAddress: 'Quito, Ecuador',
      ruc: '0000000000001',
      taxRegime: 'GENERAL',
      tradeName: 'Nava',
    },
    paymentMethodCode: '19',
    sequential: 1,
    subtotalCents: 983,
    tax: { cents: 0, code: '2', percentageCode: '0', rateBasisPoints: 0 },
    totalCents: 983,
  });
}

describe('validación XSD SRI', () => {
  it('acepta la factura 2.1.0 generada por Nava', () => {
    expect(() => validateSriInvoiceXml(invoiceXml())).not.toThrow();
  });

  it('rechaza antes de firma un XML que viola el XSD oficial', () => {
    expect(() =>
      validateSriInvoiceXml(
        invoiceXml().replace(
          '<secuencial>000000001</secuencial>',
          '<secuencial>1</secuencial>',
        ),
      ),
    ).toThrow('XSD factura 2.1.0 rechazó el XML');
  });
});
