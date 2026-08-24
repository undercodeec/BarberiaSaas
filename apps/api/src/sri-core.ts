import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';

export const SRI_INVOICE_DOCUMENT_TYPE = '01';
export const SRI_INVOICE_XML_VERSION = '2.1.0';

export type SriEnvironment = 'test' | 'production';
export type SriTaxRegime = 'GENERAL' | 'RIMPE' | 'RIMPE_NEGOCIO_POPULAR';

export interface SriInvoiceXmlInput {
  readonly accessKey: string;
  readonly buyer: {
    readonly address?: string | null;
    readonly identification: string;
    readonly identificationType: string;
    readonly name: string;
  };
  readonly description: string;
  readonly environment: SriEnvironment;
  readonly invoiceDate: Date;
  readonly issuer: {
    readonly accountingRequired: 'SI' | 'NO';
    readonly emissionPointCode: string;
    readonly establishmentCode: string;
    readonly legalName: string;
    readonly mainAddress: string;
    readonly ruc: string;
    readonly taxRegime: SriTaxRegime;
    readonly tradeName?: string | null;
  };
  readonly paymentMethodCode: string;
  readonly sequential: number;
  readonly subtotalCents: number;
  readonly tax: {
    readonly cents: number;
    readonly code: string;
    readonly percentageCode: string;
    readonly rateBasisPoints: number;
  };
  readonly totalCents: number;
}

function fixedDigits(value: string, length: number, field: string) {
  if (!new RegExp(`^\\d{${length}}$`, 'u').test(value))
    throw new Error(`${field} debe tener exactamente ${length} dígitos.`);
  return value;
}

export function formatSriSequential(sequential: number) {
  if (
    !Number.isInteger(sequential) ||
    sequential < 1 ||
    sequential > 999_999_999
  )
    throw new Error('El secuencial SRI debe estar entre 1 y 999999999.');
  return String(sequential).padStart(9, '0');
}

/** Módulo 11 definido por el SRI para el dígito 49 de la clave de acceso. */
export function sriMod11(value: string) {
  if (!/^\d+$/u.test(value))
    throw new Error('El módulo 11 SRI solo acepta dígitos.');
  let factor = 2;
  let sum = 0;
  for (const digit of [...value].reverse()) {
    sum += Number(digit) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const result = 11 - (sum % 11);
  return result === 11 ? 0 : result === 10 ? 1 : result;
}

export function formatSriDate(value: Date) {
  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${value.getUTCFullYear()}`;
}

export function generateSriAccessKey(input: {
  readonly date: Date;
  readonly documentType?: string;
  readonly emissionCode?: '1';
  readonly environment: SriEnvironment;
  readonly establishmentCode: string;
  readonly emissionPointCode: string;
  readonly numericCode: string;
  readonly ruc: string;
  readonly sequential: number;
}) {
  const date = formatSriDate(input.date).replaceAll('/', '');
  const documentType = fixedDigits(
    input.documentType ?? SRI_INVOICE_DOCUMENT_TYPE,
    2,
    'Tipo de documento',
  );
  const ruc = fixedDigits(input.ruc, 13, 'RUC');
  const environment = input.environment === 'production' ? '2' : '1';
  const series = `${fixedDigits(input.establishmentCode, 3, 'Establecimiento')}${fixedDigits(input.emissionPointCode, 3, 'Punto de emisión')}`;
  const sequential = formatSriSequential(input.sequential);
  const numericCode = fixedDigits(input.numericCode, 8, 'Código numérico');
  const base = `${date}${documentType}${ruc}${environment}${series}${sequential}${numericCode}${input.emissionCode ?? '1'}`;
  if (base.length !== 48)
    throw new Error('La base de la clave SRI debe tener 48 dígitos.');
  return `${base}${sriMod11(base)}`;
}

export function centsToSriAmount(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0)
    throw new Error(
      'Los montos SRI deben ser enteros no negativos en centavos.',
    );
  return (cents / 100).toFixed(2);
}

function appendText(
  document: XMLDocument,
  parent: Element,
  name: string,
  value: string | number,
) {
  const element = document.createElement(name);
  element.appendChild(document.createTextNode(String(value)));
  parent.appendChild(element);
  return element;
}

function appendOptionalText(
  document: XMLDocument,
  parent: Element,
  name: string,
  value: string | null | undefined,
) {
  if (value?.trim()) appendText(document, parent, name, value.trim());
}

/**
 * Construye el subconjunto normal de factura 2.1.0 para una suscripción Nava.
 * El DOM evita interpolar datos del comprador dentro de XML sin escapar.
 */
export function buildSriInvoiceXml(input: SriInvoiceXmlInput) {
  if (input.totalCents !== input.subtotalCents + input.tax.cents)
    throw new Error('El total SRI no coincide con subtotal más impuesto.');
  fixedDigits(input.accessKey, 49, 'Clave de acceso');
  fixedDigits(input.buyer.identificationType, 2, 'Tipo de identificación');
  fixedDigits(input.issuer.ruc, 13, 'RUC');
  fixedDigits(input.issuer.establishmentCode, 3, 'Establecimiento');
  fixedDigits(input.issuer.emissionPointCode, 3, 'Punto de emisión');
  fixedDigits(input.paymentMethodCode, 2, 'Forma de pago');

  const document = new DOMImplementation().createDocument(
    null,
    'factura',
    null,
  );
  const root = document.documentElement;
  root.setAttribute('id', 'comprobante');
  root.setAttribute('version', SRI_INVOICE_XML_VERSION);

  const taxInfo = document.createElement('infoTributaria');
  appendText(
    document,
    taxInfo,
    'ambiente',
    input.environment === 'production' ? 2 : 1,
  );
  appendText(document, taxInfo, 'tipoEmision', 1);
  appendText(document, taxInfo, 'razonSocial', input.issuer.legalName);
  appendOptionalText(
    document,
    taxInfo,
    'nombreComercial',
    input.issuer.tradeName,
  );
  appendText(document, taxInfo, 'ruc', input.issuer.ruc);
  appendText(document, taxInfo, 'claveAcceso', input.accessKey);
  appendText(document, taxInfo, 'codDoc', SRI_INVOICE_DOCUMENT_TYPE);
  appendText(document, taxInfo, 'estab', input.issuer.establishmentCode);
  appendText(document, taxInfo, 'ptoEmi', input.issuer.emissionPointCode);
  appendText(
    document,
    taxInfo,
    'secuencial',
    formatSriSequential(input.sequential),
  );
  appendText(document, taxInfo, 'dirMatriz', input.issuer.mainAddress);
  if (input.issuer.taxRegime !== 'GENERAL')
    appendText(
      document,
      taxInfo,
      'contribuyenteRimpe',
      'CONTRIBUYENTE RÉGIMEN RIMPE',
    );
  root.appendChild(taxInfo);

  const invoiceInfo = document.createElement('infoFactura');
  appendText(
    document,
    invoiceInfo,
    'fechaEmision',
    formatSriDate(input.invoiceDate),
  );
  appendText(
    document,
    invoiceInfo,
    'dirEstablecimiento',
    input.issuer.mainAddress,
  );
  appendText(
    document,
    invoiceInfo,
    'obligadoContabilidad',
    input.issuer.accountingRequired,
  );
  appendText(
    document,
    invoiceInfo,
    'tipoIdentificacionComprador',
    input.buyer.identificationType,
  );
  appendText(document, invoiceInfo, 'razonSocialComprador', input.buyer.name);
  appendText(
    document,
    invoiceInfo,
    'identificacionComprador',
    input.buyer.identification,
  );
  appendOptionalText(
    document,
    invoiceInfo,
    'direccionComprador',
    input.buyer.address,
  );
  appendText(
    document,
    invoiceInfo,
    'totalSinImpuestos',
    centsToSriAmount(input.subtotalCents),
  );
  appendText(document, invoiceInfo, 'totalDescuento', '0.00');
  const taxes = document.createElement('totalConImpuestos');
  const tax = document.createElement('totalImpuesto');
  appendText(document, tax, 'codigo', input.tax.code);
  appendText(document, tax, 'codigoPorcentaje', input.tax.percentageCode);
  appendText(
    document,
    tax,
    'baseImponible',
    centsToSriAmount(input.subtotalCents),
  );
  appendText(document, tax, 'valor', centsToSriAmount(input.tax.cents));
  taxes.appendChild(tax);
  invoiceInfo.appendChild(taxes);
  appendText(
    document,
    invoiceInfo,
    'importeTotal',
    centsToSriAmount(input.totalCents),
  );
  appendText(document, invoiceInfo, 'moneda', 'DOLAR');
  const payments = document.createElement('pagos');
  const payment = document.createElement('pago');
  appendText(document, payment, 'formaPago', input.paymentMethodCode);
  appendText(document, payment, 'total', centsToSriAmount(input.totalCents));
  payments.appendChild(payment);
  invoiceInfo.appendChild(payments);
  root.appendChild(invoiceInfo);

  const details = document.createElement('detalles');
  const detail = document.createElement('detalle');
  appendText(document, detail, 'codigoPrincipal', 'NAVA-SUSCRIPCION');
  appendText(document, detail, 'descripcion', input.description);
  appendText(document, detail, 'cantidad', '1.00');
  appendText(
    document,
    detail,
    'precioUnitario',
    centsToSriAmount(input.subtotalCents),
  );
  appendText(document, detail, 'descuento', '0.00');
  appendText(
    document,
    detail,
    'precioTotalSinImpuesto',
    centsToSriAmount(input.subtotalCents),
  );
  const detailTaxes = document.createElement('impuestos');
  const detailTax = document.createElement('impuesto');
  appendText(document, detailTax, 'codigo', input.tax.code);
  appendText(document, detailTax, 'codigoPorcentaje', input.tax.percentageCode);
  appendText(
    document,
    detailTax,
    'tarifa',
    (input.tax.rateBasisPoints / 100).toFixed(2),
  );
  appendText(
    document,
    detailTax,
    'baseImponible',
    centsToSriAmount(input.subtotalCents),
  );
  appendText(document, detailTax, 'valor', centsToSriAmount(input.tax.cents));
  detailTaxes.appendChild(detailTax);
  detail.appendChild(detailTaxes);
  details.appendChild(detail);
  root.appendChild(details);

  return `<?xml version="1.0" encoding="UTF-8"?>${new XMLSerializer().serializeToString(document)}`;
}
