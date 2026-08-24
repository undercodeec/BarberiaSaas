import {
  SriInvoiceDeliveryStatus,
  SriInvoiceStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import nodemailer from 'nodemailer';

import type { ApiConfig } from './config';

export async function sendSriInvoiceEmail(
  database: DatabaseClient,
  config: ApiConfig,
  invoiceId: string,
) {
  const invoice = await database.sriInvoice.findUnique({
    where: { id: invoiceId },
  });
  if (
    !invoice ||
    invoice.status !== SriInvoiceStatus.AUTHORIZED ||
    !invoice.authorizedXml ||
    !invoice.ridePdf ||
    !config.SMTP_FROM ||
    !config.SMTP_HOST
  )
    return false;
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
          content: invoice.authorizedXml,
          contentType: 'application/xml; charset=utf-8',
          filename: `${invoice.accessKey}.xml`,
        },
        {
          content: Buffer.from(invoice.ridePdf),
          contentType: 'application/pdf',
          filename: `RIDE-${invoice.accessKey}.pdf`,
        },
      ],
      from: config.SMTP_FROM,
      subject: `Factura electrónica Nava - ${String(invoice.sequential).padStart(9, '0')}`,
      text: 'Adjuntamos el XML autorizado y el RIDE de tu factura electrónica Nava.',
      to: invoice.buyerEmail,
    });
    await database.sriInvoice.update({
      data: {
        deliveryStatus: SriInvoiceDeliveryStatus.SENT,
        emailedAt: new Date(),
      },
      where: { id: invoice.id },
    });
    return true;
  } catch {
    await database.sriInvoice.update({
      data: { deliveryStatus: SriInvoiceDeliveryStatus.FAILED },
      where: { id: invoice.id },
    });
    return false;
  }
}

export async function deliverSriInvoices(
  database: DatabaseClient,
  config: ApiConfig,
  limit = 25,
) {
  if (!config.SMTP_FROM || !config.SMTP_HOST) return 0;
  const invoices = await database.sriInvoice.findMany({
    select: { id: true },
    take: limit,
    where: {
      deliveryStatus: {
        in: [SriInvoiceDeliveryStatus.PENDING, SriInvoiceDeliveryStatus.FAILED],
      },
      status: SriInvoiceStatus.AUTHORIZED,
    },
  });
  for (const invoice of invoices)
    await sendSriInvoiceEmail(database, config, invoice.id);
  return invoices.length;
}
