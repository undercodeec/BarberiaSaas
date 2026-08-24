import { describe, expect, it } from 'vitest';

import {
  buildSriInvoiceXml,
  centsToSriAmount,
  formatSriSequential,
  generateSriAccessKey,
  sriMod11,
} from './sri-core';

describe('núcleo SRI', () => {
  it('calcula módulo 11 con el caso publicado por SRI', () => {
    expect(sriMod11('41261533')).toBe(6);
  });

  it('genera una clave de acceso única de 49 dígitos', () => {
    const key = generateSriAccessKey({
      date: new Date('2026-08-23T12:00:00.000Z'),
      environment: 'test',
      establishmentCode: '001',
      emissionPointCode: '001',
      numericCode: '12345678',
      ruc: '1727155671001',
      sequential: 1,
    });
    expect(key).toMatch(/^\d{49}$/u);
    expect(key.at(-1)).toBe(String(sriMod11(key.slice(0, -1))));
  });

  it('formatea montos y secuenciales sin usar flotantes como fuente', () => {
    expect(centsToSriAmount(983)).toBe('9.83');
    expect(formatSriSequential(1)).toBe('000000001');
  });

  it('genera XML de factura 2.1.0 escapando datos del comprador', () => {
    const xml = buildSriInvoiceXml({
      accessKey: '2308202601172715567100110010010000000011234567810',
      buyer: {
        identification: '1712345678',
        identificationType: '05',
        name: 'Barbería <Nava>',
      },
      description: 'Plan Nava Esencial',
      environment: 'test',
      invoiceDate: new Date('2026-08-23T12:00:00.000Z'),
      issuer: {
        accountingRequired: 'NO',
        emissionPointCode: '001',
        establishmentCode: '001',
        legalName: 'Christopher Gallardo',
        mainAddress: 'Quito, Ecuador',
        ruc: '1727155671001',
        taxRegime: 'GENERAL',
      },
      paymentMethodCode: '19',
      sequential: 1,
      subtotalCents: 983,
      tax: { cents: 0, code: '2', percentageCode: '0', rateBasisPoints: 0 },
      totalCents: 983,
    });
    expect(xml).toContain('<factura id="comprobante" version="2.1.0"');
    expect(xml).toContain('Barbería &lt;Nava&gt;');
    expect(xml).toContain('<secuencial>000000001</secuencial>');
  });
});
