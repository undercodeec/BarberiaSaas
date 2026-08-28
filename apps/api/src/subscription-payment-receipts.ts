import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

import {
  MembershipRole,
  MembershipStatus,
  SubscriptionPaymentReceiptDeliveryStatus,
  SubscriptionPaymentStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import nodemailer from 'nodemailer';
import { z } from 'zod';

import type { ApiConfig } from './config';
import { ApiError } from './errors';

const RECEIPT_RETRY_DELAY_MS = 5 * 60 * 1000;
const RECEIPT_MAX_ATTEMPTS = 6;
const receiptParamsSchema = z.object({ id: z.uuid() });

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{ readonly user: { readonly id: string } }>;

export const TEMPORARY_RECEIPT_DISCLAIMER =
  'Este comprobante temporal de pago no es una factura electrónica ni un comprobante autorizado por el SRI.';
export const NAVA_POLICIES_URL = 'https://navacloud.app/politicas';

let navaLogoPng: Buffer | undefined;
let navaLogoPdfImages:
  | {
      readonly alpha: Buffer;
      readonly height: number;
      readonly rgb: Buffer;
      readonly width: number;
    }
  | undefined;

function navaLogoPath() {
  return resolve(import.meta.dirname, '../../mobile/assets/nava-logo.png');
}

function loadNavaLogoPng() {
  navaLogoPng ??= readFileSync(navaLogoPath());
  return navaLogoPng;
}

function paeth(left: number, above: number, upperLeft: number) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance
      ? above
      : upperLeft;
}

/** Convierte el PNG RGBA canónico de Nava en canales PDF RGB + máscara alfa. */
function loadNavaLogoPdfImages() {
  if (navaLogoPdfImages) return navaLogoPdfImages;
  const png = loadNavaLogoPng();
  if (
    png
      .subarray(0, 8)
      .compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0 ||
    png[24] !== 8 ||
    png[25] !== 6 ||
    png[28] !== 0
  )
    throw new Error(
      'El logo de Nava debe ser un PNG RGBA de 8 bits sin entrelazado.',
    );
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const idat: Buffer[] = [];
  let cursor = 8;
  while (cursor < png.length) {
    const length = png.readUInt32BE(cursor);
    const type = png.subarray(cursor + 4, cursor + 8).toString('ascii');
    if (type === 'IDAT')
      idat.push(png.subarray(cursor + 8, cursor + 8 + length));
    cursor += length + 12;
  }
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== height * (stride + 1))
    throw new Error('El logo de Nava tiene datos PNG inválidos.');
  const rgba = Buffer.alloc(width * height * bytesPerPixel);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = row * (stride + 1);
    const filter = raw[sourceStart]!;
    for (let column = 0; column < stride; column += 1) {
      const source = raw[sourceStart + 1 + column]!;
      const left =
        column >= bytesPerPixel
          ? rgba[row * stride + column - bytesPerPixel]!
          : 0;
      const above = row > 0 ? rgba[(row - 1) * stride + column]! : 0;
      const upperLeft =
        row > 0 && column >= bytesPerPixel
          ? rgba[(row - 1) * stride + column - bytesPerPixel]!
          : 0;
      const value =
        filter === 0
          ? source
          : filter === 1
            ? (source + left) & 255
            : filter === 2
              ? (source + above) & 255
              : filter === 3
                ? (source + Math.floor((left + above) / 2)) & 255
                : filter === 4
                  ? (source + paeth(left, above, upperLeft)) & 255
                  : (() => {
                      throw new Error(
                        'El logo de Nava contiene un filtro PNG no válido.',
                      );
                    })();
      rgba[row * stride + column] = value;
    }
  }
  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgb[pixel * 3] = rgba[pixel * 4]!;
    rgb[pixel * 3 + 1] = rgba[pixel * 4 + 1]!;
    rgb[pixel * 3 + 2] = rgba[pixel * 4 + 2]!;
    alpha[pixel] = rgba[pixel * 4 + 3]!;
  }
  navaLogoPdfImages = {
    alpha: deflateSync(alpha),
    height,
    rgb: deflateSync(rgb),
    width,
  };
  return navaLogoPdfImages;
}

function pdfText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[\\()]/gu, '\\$&')
    .replace(/[^\x20-\x7e]/gu, '?');
}

function pdfLine(value: string, y: number, bold = false) {
  return `BT /${bold ? 'F2' : 'F1'} 10 Tf 48 ${y} Td (${pdfText(value)}) Tj ET`;
}

function formatMoney(cents: number, currencyCode: string) {
  return new Intl.NumberFormat('es-EC', {
    currency: currencyCode,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(cents / 100);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'America/Guayaquil',
  }).format(value);
}

function truncate(value: string, length = 72) {
  return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

function formatSubscriptionDuration(startsAt: Date, endsAt: Date) {
  const days = Math.round((endsAt.getTime() - startsAt.getTime()) / 86_400_000);
  return `${days} días`;
}

export interface TemporaryPaymentReceiptPdfInput {
  readonly currencyCode: string;
  readonly internalReference: string;
  readonly organizationName: string;
  readonly paidAt: Date;
  readonly paymentProvider: string;
  readonly periodEndsAt: Date;
  readonly periodStartsAt: Date;
  readonly planName: string;
  readonly providerTransactionId: string | null;
  readonly receiptNumber: string;
  readonly recipientName: string;
  readonly totalCents: number;
}

/** PDF persistido como evidencia comercial; deliberadamente distinto de un RIDE. */
export function buildTemporaryPaymentReceiptPdf(
  input: TemporaryPaymentReceiptPdfInput,
) {
  const logo = loadNavaLogoPdfImages();
  const lines = [
    pdfLine('COMPROBANTE TEMPORAL DE PAGO', 702, true),
    pdfLine(
      'NO ES FACTURA ELECTRONICA NI COMPROBANTE AUTORIZADO POR EL SRI',
      684,
      true,
    ),
    pdfLine(`Comprobante: ${input.receiptNumber}`, 654, true),
    pdfLine(`Compra verificada: ${formatDate(input.paidAt)}`, 636),
    pdfLine('DETALLE DE TU COMPRA', 600, true),
    pdfLine(`Organizacion: ${truncate(input.organizationName)}`, 582),
    pdfLine(`Titular: ${truncate(input.recipientName)}`, 564),
    pdfLine(`Plan adquirido: ${truncate(input.planName)}`, 546),
    pdfLine(
      `Valor pagado: ${formatMoney(input.totalCents, input.currencyCode)}`,
      528,
      true,
    ),
    pdfLine('VIGENCIA DE LA SUSCRIPCION', 492, true),
    pdfLine(`Inicio: ${formatDate(input.periodStartsAt)}`, 474),
    pdfLine(`Fin: ${formatDate(input.periodEndsAt)}`, 456),
    pdfLine(
      `Duracion del periodo: ${formatSubscriptionDuration(input.periodStartsAt, input.periodEndsAt)}`,
      438,
    ),
    pdfLine('Renovacion: manual; no se realiza cobro automatico.', 420),
    pdfLine('PAGO VERIFICADO', 384, true),
    pdfLine(`Procesador: ${truncate(input.paymentProvider)}`, 366),
    pdfLine(`Referencia Nava: ${input.internalReference}`, 348),
    ...(input.providerTransactionId
      ? [
          pdfLine(
            `Referencia del procesador: ${input.providerTransactionId}`,
            330,
          ),
        ]
      : []),
    pdfLine(
      'Nava conservara este comprobante y su registro de entrega por correo.',
      126,
    ),
    pdfLine(
      'La factura electronica se emitira y enviara cuando la emision SRI este habilitada.',
      108,
    ),
    pdfLine(`Politicas: ${NAVA_POLICIES_URL}`, 90),
    pdfLine('Soporte: soporte@navacloud.app', 72),
  ];
  const content = lines.join('\n');
  const objects: readonly (string | Buffer)[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R /F2 8 0 R >> /XObject << /Logo 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask 6 0 R /Length ${logo.rgb.length} >>\nstream\n`,
        'latin1',
      ),
      logo.rgb,
      Buffer.from('\nendstream', 'latin1'),
    ]),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${logo.alpha.length} >>\nstream\n`,
        'latin1',
      ),
      logo.alpha,
      Buffer.from('\nendstream', 'latin1'),
    ]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  const header = Buffer.from('%PDF-1.4\n', 'latin1');
  const output: Buffer[] = [header];
  const offsets = [0];
  let length = header.length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const body = Buffer.isBuffer(object)
      ? object
      : Buffer.from(object, 'latin1');
    const wrapped = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
      body,
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
    output.push(wrapped);
    length += wrapped.length;
  });
  const xref = length;
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  trailer += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  trailer += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.concat([...output, Buffer.from(trailer, 'latin1')]);
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({ '&': '&amp;', "'": '&#39;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[
        character
      ]!,
  );
}

export function paymentReceiptEmailContent(receipt: {
  readonly currencyCode: string;
  readonly internalReference: string;
  readonly organizationName: string;
  readonly paidAt: Date;
  readonly paymentProvider: string;
  readonly periodEndsAt: Date;
  readonly periodStartsAt: Date;
  readonly planName: string;
  readonly providerTransactionId: string | null;
  readonly receiptNumber: string;
  readonly totalCents: number;
}) {
  const amount = formatMoney(receipt.totalCents, receipt.currencyCode);
  const detailRows = [
    ['Plan adquirido', receipt.planName],
    ['Organización', receipt.organizationName],
    ['Valor pagado', amount],
    ['Pago verificado', formatDate(receipt.paidAt)],
    ['Inicio de vigencia', formatDate(receipt.periodStartsAt)],
    ['Fin de vigencia', formatDate(receipt.periodEndsAt)],
    [
      'Duración',
      formatSubscriptionDuration(receipt.periodStartsAt, receipt.periodEndsAt),
    ],
    ['Renovación', 'Manual; Nava no realiza cobros automáticos.'],
    ['Procesador', receipt.paymentProvider],
    ['Referencia Nava', receipt.internalReference],
    ...(receipt.providerTransactionId
      ? [['Referencia del procesador', receipt.providerTransactionId]]
      : []),
  ] as const;
  const text = [
    `Confirmamos tu compra de ${receipt.planName} por ${amount}.`,
    `Comprobante: ${receipt.receiptNumber}.`,
    ...detailRows.map(([label, value]) => `${label}: ${value}`),
    TEMPORARY_RECEIPT_DISCLAIMER,
    'Conserva este correo y el PDF adjunto como constancia comercial de tu pago.',
    'Cuando la emisión SRI esté habilitada, la factura electrónica se enviará al correo de facturación registrado.',
    `Políticas: ${NAVA_POLICIES_URL}`,
    'Soporte: soporte@navacloud.app',
  ].join('\n\n');
  const rows = detailRows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;color:#65707c">${escapeHtml(label)}</td><td style="padding:8px 12px;font-weight:600;color:#101317">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#101317"><main style="max-width:640px;margin:0 auto;padding:28px 16px"><section style="overflow:hidden;background:#fff;border:1px solid #e3e7eb;border-radius:16px"><header style="padding:28px 30px 20px;border-bottom:1px solid #e3e7eb"><img src="cid:nava-logo" alt="Nava" style="display:block;width:170px;height:auto" /><p style="margin:22px 0 0;font-size:14px;color:#65707c">Comprobante temporal de pago</p><h1 style="margin:6px 0 0;font-size:24px">Tu suscripción está activa</h1></header><div style="padding:24px 30px"><p style="margin-top:0">Confirmamos tu compra. Adjuntamos el comprobante <strong>${escapeHtml(receipt.receiptNumber)}</strong> con el detalle completo.</p><table role="presentation" style="width:100%;border-collapse:collapse;background:#f7f9fa;border-radius:10px">${rows}</table><p style="margin:22px 0 0;padding:14px;background:#fff7e9;border-radius:8px;font-size:13px;line-height:1.45"><strong>Importante:</strong> ${escapeHtml(TEMPORARY_RECEIPT_DISCLAIMER)}</p><p style="font-size:14px;line-height:1.5">Consulta las <a href="${NAVA_POLICIES_URL}" style="color:#176b3a">Políticas de Nava</a>. Si necesitas ayuda, escríbenos a <a href="mailto:soporte@navacloud.app" style="color:#176b3a">soporte@navacloud.app</a>.</p></div></section></main></body></html>`;
  return { html, text };
}

export function sriProductionBillingIsEnabled(config: ApiConfig) {
  return (
    config.SRI_EMISSION_ENABLED === 'true' &&
    config.SRI_ENV === 'production' &&
    config.SRI_PRODUCTION_ENABLED === 'true'
  );
}

function receiptNumber(paymentAttemptId: string, paidAt: Date) {
  return `NAVA-R-${paidAt.getUTCFullYear()}-${paymentAttemptId.replaceAll('-', '').slice(0, 16).toUpperCase()}`;
}

export async function queuePaymentReceiptForPayment(
  database: DatabaseClient,
  config: ApiConfig,
  paymentAttemptId: string,
) {
  if (sriProductionBillingIsEnabled(config))
    return { created: false, reason: 'SRI_PRODUCTION_ENABLED' };
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`receipt:${paymentAttemptId}`}))
    `;
    const existing = await transaction.subscriptionPaymentReceipt.findUnique({
      where: { subscriptionPaymentAttemptId: paymentAttemptId },
    });
    if (existing) return { created: false, reason: 'ALREADY_EXISTS' };
    const payment = await transaction.subscriptionPaymentAttempt.findUnique({
      include: {
        initiatedBy: { select: { email: true, fullName: true } },
        invoice: true,
        organization: {
          select: {
            billingProfile: { select: { email: true, legalName: true } },
            name: true,
          },
        },
      },
      where: { id: paymentAttemptId },
    });
    if (!payment || payment.status !== SubscriptionPaymentStatus.APPLIED)
      return { created: false, reason: 'PAYMENT_NOT_APPLIED' };
    if (!payment.invoice.periodStartsAt || !payment.invoice.periodEndsAt)
      return { created: false, reason: 'PAYMENT_PERIOD_UNAVAILABLE' };
    const recipientEmail =
      payment.organization.billingProfile?.email ?? payment.initiatedBy?.email;
    if (!recipientEmail)
      return { created: false, reason: 'RECIPIENT_EMAIL_UNAVAILABLE' };
    const paidAt = payment.appliedAt ?? payment.invoice.paidAt ?? new Date();
    const recipientName =
      payment.organization.billingProfile?.legalName ??
      payment.initiatedBy?.fullName ??
      payment.organization.name;
    const number = receiptNumber(payment.id, paidAt);
    const documentPdf = buildTemporaryPaymentReceiptPdf({
      currencyCode: payment.currencyCode,
      internalReference: payment.internalReference,
      organizationName: payment.organization.name,
      paidAt,
      paymentProvider: payment.provider,
      periodEndsAt: payment.invoice.periodEndsAt,
      periodStartsAt: payment.invoice.periodStartsAt,
      planName: payment.invoice.planName,
      providerTransactionId: payment.providerTransactionId,
      receiptNumber: number,
      recipientName,
      totalCents: payment.amountCents,
    });
    const receipt = await transaction.subscriptionPaymentReceipt.create({
      data: {
        currencyCode: payment.currencyCode,
        documentPdf,
        documentSha256: createHash('sha256').update(documentPdf).digest('hex'),
        internalReference: payment.internalReference,
        organizationId: payment.organizationId,
        organizationName: payment.organization.name,
        paidAt,
        paymentProvider: payment.provider,
        periodEndsAt: payment.invoice.periodEndsAt,
        periodStartsAt: payment.invoice.periodStartsAt,
        planCode: payment.invoice.planCode,
        planName: payment.invoice.planName,
        providerTransactionId: payment.providerTransactionId,
        receiptNumber: number,
        recipientEmail,
        recipientName,
        subscriptionInvoiceId: payment.invoiceId,
        subscriptionPaymentAttemptId: payment.id,
        totalCents: payment.amountCents,
      },
    });
    await transaction.auditLog.create({
      data: {
        action: 'subscription.payment_receipt_queued',
        afterData: { paymentAttemptId: payment.id, receiptNumber: number },
        entityId: receipt.id,
        entityType: 'subscription_payment_receipt',
        organizationId: payment.organizationId,
      },
    });
    return { created: true, receiptId: receipt.id, reason: null };
  });
}

export async function queuePendingPaymentReceipts(
  database: DatabaseClient,
  config: ApiConfig,
  limit = 50,
) {
  if (sriProductionBillingIsEnabled(config)) return 0;
  const payments = await database.subscriptionPaymentAttempt.findMany({
    select: { id: true },
    take: limit,
    where: { paymentReceipt: null, status: SubscriptionPaymentStatus.APPLIED },
  });
  const results = await Promise.all(
    payments.map(({ id }) =>
      queuePaymentReceiptForPayment(database, config, id),
    ),
  );
  return results.filter(({ created }) => created).length;
}

export async function sendPaymentReceiptEmail(
  database: DatabaseClient,
  config: ApiConfig,
  receiptId: string,
) {
  const receipt = await database.subscriptionPaymentReceipt.findUnique({
    where: { id: receiptId },
  });
  if (!receipt || !config.SMTP_FROM || !config.SMTP_HOST) return false;
  const now = new Date();
  const email = paymentReceiptEmailContent(receipt);
  try {
    const transporter = nodemailer.createTransport({
      auth:
        config.SMTP_USER && config.SMTP_PASSWORD
          ? { pass: config.SMTP_PASSWORD, user: config.SMTP_USER }
          : undefined,
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE === 'true',
    });
    await transporter.sendMail({
      attachments: [
        {
          cid: 'nava-logo',
          content: loadNavaLogoPng(),
          contentType: 'image/png',
          contentDisposition: 'inline',
          filename: 'nava-logo.png',
        },
        {
          content: Buffer.from(receipt.documentPdf),
          contentType: 'application/pdf',
          filename: `${receipt.receiptNumber}.pdf`,
        },
      ],
      from: config.SMTP_FROM,
      subject: `Comprobante de pago Nava ${receipt.receiptNumber}`,
      html: email.html,
      text: email.text,
      to: receipt.recipientEmail,
    });
    await database.subscriptionPaymentReceipt.update({
      data: {
        attemptCount: { increment: 1 },
        deliveryStatus: SubscriptionPaymentReceiptDeliveryStatus.SENT,
        emailedAt: now,
        lastAttemptAt: now,
        lastErrorCode: null,
      },
      where: { id: receipt.id },
    });
    return true;
  } catch {
    await database.subscriptionPaymentReceipt.update({
      data: {
        attemptCount: { increment: 1 },
        deliveryStatus: SubscriptionPaymentReceiptDeliveryStatus.FAILED,
        lastAttemptAt: now,
        lastErrorCode: 'SMTP_DELIVERY_FAILED',
      },
      where: { id: receipt.id },
    });
    return false;
  }
}

export async function deliverPaymentReceipts(
  database: DatabaseClient,
  config: ApiConfig,
  limit = 25,
) {
  if (!config.SMTP_FROM || !config.SMTP_HOST) return 0;
  const retryBefore = new Date(Date.now() - RECEIPT_RETRY_DELAY_MS);
  const receipts = await database.subscriptionPaymentReceipt.findMany({
    select: { id: true },
    take: limit,
    where: {
      attemptCount: { lt: RECEIPT_MAX_ATTEMPTS },
      deliveryStatus: {
        in: [
          SubscriptionPaymentReceiptDeliveryStatus.PENDING,
          SubscriptionPaymentReceiptDeliveryStatus.FAILED,
        ],
      },
      OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lte: retryBefore } }],
    },
  });
  for (const receipt of receipts)
    await sendPaymentReceiptEmail(database, config, receipt.id);
  return receipts.length;
}

async function ownerOrganizationId(database: DatabaseClient, userId: string) {
  const memberships = await database.membership.findMany({
    select: { organizationId: true, role: true },
    where: { status: MembershipStatus.ACTIVE, userId },
  });
  if (memberships.length !== 1)
    throw new ApiError(
      409,
      'ORGANIZATION_SELECTION_REQUIRED',
      'Selecciona una sola organización para consultar sus comprobantes.',
    );
  const membership = memberships[0]!;
  if (membership.role !== MembershipRole.OWNER)
    throw new ApiError(
      403,
      'SUBSCRIPTION_OWNER_REQUIRED',
      'Solo el propietario puede consultar comprobantes de suscripción.',
    );
  return membership.organizationId;
}

export function registerSubscriptionPaymentReceiptRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
  config: ApiConfig,
) {
  app.get('/v1/subscription/payment-receipts', async (request) => {
    const { user } = await authenticate(database, request);
    const organizationId = await ownerOrganizationId(database, user.id);
    const receipts = await database.subscriptionPaymentReceipt.findMany({
      orderBy: { paidAt: 'desc' },
      select: {
        deliveryStatus: true,
        id: true,
        paidAt: true,
        planCode: true,
        planName: true,
        receiptNumber: true,
        totalCents: true,
      },
      where: { organizationId },
    });
    return {
      receipts: receipts.map((receipt) => ({
        deliveryStatus: receipt.deliveryStatus.toLowerCase(),
        id: receipt.id,
        paidAt: receipt.paidAt.toISOString(),
        planCode: receipt.planCode,
        planName: receipt.planName,
        receiptNumber: receipt.receiptNumber,
        totalCents: receipt.totalCents,
      })),
    };
  });

  app.get(
    '/v1/subscription/payment-receipts/:id/pdf',
    async (request, reply) => {
      const { user } = await authenticate(database, request);
      const organizationId = await ownerOrganizationId(database, user.id);
      const { id } = receiptParamsSchema.parse(request.params);
      const receipt = await database.subscriptionPaymentReceipt.findFirst({
        select: { documentPdf: true, receiptNumber: true },
        where: { id, organizationId },
      });
      if (!receipt)
        throw new ApiError(
          404,
          'SUBSCRIPTION_PAYMENT_RECEIPT_NOT_FOUND',
          'El comprobante de pago no existe.',
        );
      return reply
        .header(
          'Content-Disposition',
          `attachment; filename="${receipt.receiptNumber}.pdf"`,
        )
        .type('application/pdf')
        .send(receipt.documentPdf);
    },
  );

  app.post('/v1/subscription/payment-receipts/:id/resend', async (request) => {
    const { user } = await authenticate(database, request);
    const organizationId = await ownerOrganizationId(database, user.id);
    const { id } = receiptParamsSchema.parse(request.params);
    const receipt = await database.subscriptionPaymentReceipt.findFirst({
      select: { id: true },
      where: { id, organizationId },
    });
    if (!receipt)
      throw new ApiError(
        404,
        'SUBSCRIPTION_PAYMENT_RECEIPT_NOT_FOUND',
        'El comprobante de pago no existe.',
      );
    const sent = await sendPaymentReceiptEmail(database, config, receipt.id);
    if (!sent)
      throw new ApiError(
        503,
        'SUBSCRIPTION_PAYMENT_RECEIPT_EMAIL_FAILED',
        'No fue posible reenviar el comprobante de pago.',
      );
    await database.auditLog.create({
      data: {
        action: 'subscription.payment_receipt_resent',
        actorUserId: user.id,
        entityId: receipt.id,
        entityType: 'subscription_payment_receipt',
        organizationId,
      },
    });
    return { sent: true };
  });
}
