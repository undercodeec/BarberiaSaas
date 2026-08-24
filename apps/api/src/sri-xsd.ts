import libxml from 'libxmljs2';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const invoiceSchemaUrl = new URL(
  './sri-schemas/factura_V2.1.0.xsd',
  import.meta.url,
);

function validationMessage(error: unknown) {
  return error instanceof Error
    ? error.message.replaceAll(/\s+/gu, ' ').trim()
    : String(error);
}

/**
 * Valida el XML sin firma contra el XSD oficial SRI de factura 2.1.0, incluido
 * localmente. No depende de Internet durante la emisión.
 */
export function validateSriInvoiceXml(xml: string) {
  const schemaPath = fileURLToPath(invoiceSchemaUrl);
  const schema = libxml.parseXml(readFileSync(schemaPath, 'utf8'), {
    baseUrl: pathToFileURL(schemaPath).href,
  });
  const invoice = libxml.parseXml(xml);
  if (invoice.errors.length > 0)
    throw new Error(
      `XML de factura inválido: ${invoice.errors.map(validationMessage).join(' | ')}`,
    );
  if (invoice.validate(schema)) return;
  throw new Error(
    `XSD factura 2.1.0 rechazó el XML: ${invoice.validationErrors
      .map(validationMessage)
      .join(' | ')}`,
  );
}
