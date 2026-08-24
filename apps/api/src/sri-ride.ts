import { centsToSriAmount, formatSriSequential } from './sri-core';

interface RideInput {
  readonly accessKey: string;
  readonly authorizationDate: Date | null;
  readonly authorizationNumber: string | null;
  readonly buyer: { readonly identification: string; readonly name: string };
  readonly description: string;
  readonly issuer: {
    readonly legalName: string;
    readonly ruc: string;
    readonly taxRegime: string;
  };
  readonly issuedAt: Date;
  readonly sequential: number;
  readonly subtotalCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
}

function pdfText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[\\()]/gu, '\\$&')
    .replace(/[^\x20-\x7e]/gu, '?');
}

function line(value: string, x: number, y: number, bold = false) {
  return `BT /${bold ? 'F2' : 'F1'} 10 Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`;
}

/** RIDE mínimo y estable para una factura SaaS; no pretende ser un editor visual. */
export function buildSriRidePdf(input: RideInput) {
  const number = `001-001-${formatSriSequential(input.sequential)}`;
  const date = new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'short',
    timeZone: 'America/Guayaquil',
  }).format(input.issuedAt);
  const authorizationDate = input.authorizationDate
    ? new Intl.DateTimeFormat('es-EC', {
        dateStyle: 'short',
        timeStyle: 'medium',
        timeZone: 'America/Guayaquil',
      }).format(input.authorizationDate)
    : 'Pendiente';
  const lines = [
    line('NAVA - FACTURA ELECTRONICA', 48, 790, true),
    line(`RUC: ${input.issuer.ruc}`, 48, 772),
    line(`Factura No.: ${number}`, 48, 754, true),
    line(`Fecha de emision: ${date}`, 48, 736),
    line(
      `Autorizacion: ${input.authorizationNumber ?? input.accessKey}`,
      48,
      718,
    ),
    line(`Fecha autorizacion: ${authorizationDate}`, 48, 700),
    line('DATOS DEL COMPRADOR', 48, 666, true),
    line(`Razon social: ${input.buyer.name}`, 48, 648),
    line(`Identificacion: ${input.buyer.identification}`, 48, 630),
    line('DETALLE', 48, 594, true),
    line('Descripcion', 48, 576, true),
    line('Cantidad', 365, 576, true),
    line('Total', 455, 576, true),
    line(input.description, 48, 558),
    line('1.00', 365, 558),
    line(`$ ${centsToSriAmount(input.subtotalCents)}`, 455, 558),
    line(`Subtotal: $ ${centsToSriAmount(input.subtotalCents)}`, 365, 520),
    line(`Impuestos: $ ${centsToSriAmount(input.taxCents)}`, 365, 502),
    line(`TOTAL: $ ${centsToSriAmount(input.totalCents)}`, 365, 484, true),
    line(`Clave de acceso: ${input.accessKey}`, 48, 430),
    ...(input.issuer.taxRegime === 'GENERAL'
      ? []
      : [line('CONTRIBUYENTE RÉGIMEN RIMPE', 48, 412, true)]),
    line(
      'Este documento es una representación impresa del comprobante electrónico.',
      48,
      80,
    ),
  ];
  const content = lines.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, 'latin1'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, 'latin1');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, 'latin1');
}
