import { DOMImplementation, DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { access, readFile } from 'node:fs/promises';
import forge from 'node-forge';
import * as xades from 'xadesjs';
import xpath from 'xpath';

interface CertificateMaterial {
  readonly certificateBase64: string;
  readonly expiresAt: Date;
  readonly privateKeyPkcs8: ArrayBuffer;
  readonly publicKeySpki: ArrayBuffer;
}

let xmlDependenciesReady = false;

function prepareXades() {
  if (xmlDependenciesReady) return;
  xades.setNodeDependencies({
    DOMImplementation,
    DOMParser,
    XMLSerializer,
    xpath,
  });
  xades.Application.setEngine('NavaSRI', globalThis.crypto);
  xmlDependenciesReady = true;
}

function certificateError() {
  return new Error(
    'No fue posible abrir el certificado SRI. Verifica la ruta y contraseña sin exponerlas en registros.',
  );
}

function firstBag(p12: forge.pkcs12.Pkcs12Pfx, bagType: string) {
  return p12.getBags({ bagType })[bagType]?.[0] ?? null;
}

function exactArrayBuffer(value: Uint8Array) {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}

async function loadCertificate(
  certificatePath: string,
  certificatePassword: string,
): Promise<CertificateMaterial> {
  try {
    await access(certificatePath);
    const content = await readFile(certificatePath);
    const p12 = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(content.toString('binary')),
      false,
      certificatePassword,
    );
    const encryptedKeyBagType = forge.pki.oids.pkcs8ShroudedKeyBag;
    const keyBagType = forge.pki.oids.keyBag;
    const certificateBagType = forge.pki.oids.certBag;
    if (!encryptedKeyBagType || !keyBagType || !certificateBagType)
      throw certificateError();
    const keyBag =
      firstBag(p12, encryptedKeyBagType) ?? firstBag(p12, keyBagType);
    const certificateBag = firstBag(p12, certificateBagType);
    if (!keyBag?.key || !certificateBag?.cert) throw certificateError();
    const certificate = certificateBag.cert;
    if (certificate.validity.notAfter <= new Date())
      throw new Error('El certificado SRI está vencido.');
    const privateKeyInfo = forge.pki.wrapRsaPrivateKey(
      forge.pki.privateKeyToAsn1(keyBag.key),
    );
    const certificateDer = forge.asn1
      .toDer(forge.pki.certificateToAsn1(certificate))
      .getBytes();
    return {
      certificateBase64: Buffer.from(certificateDer, 'binary').toString(
        'base64',
      ),
      expiresAt: certificate.validity.notAfter,
      privateKeyPkcs8: exactArrayBuffer(
        Buffer.from(forge.asn1.toDer(privateKeyInfo).getBytes(), 'binary'),
      ),
      publicKeySpki: exactArrayBuffer(
        Buffer.from(
          forge.asn1
            .toDer(forge.pki.publicKeyToAsn1(certificate.publicKey))
            .getBytes(),
          'binary',
        ),
      ),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'El certificado SRI está vencido.'
    )
      throw error;
    throw certificateError();
  }
}

export async function inspectSriCertificate(input: {
  readonly certificatePassword: string;
  readonly certificatePath: string;
}) {
  const certificate = await loadCertificate(
    input.certificatePath,
    input.certificatePassword,
  );
  return { expiresAt: certificate.expiresAt };
}

/** Firma enveloped XAdES_BES 1.3.2 con RSA-SHA1, tal como pide la ficha SRI 2.34. */
export async function signSriInvoiceXml(input: {
  readonly certificatePassword: string;
  readonly certificatePath: string;
  readonly xml: string;
}) {
  prepareXades();
  const certificate = await loadCertificate(
    input.certificatePath,
    input.certificatePassword,
  );
  const algorithm = {
    hash: 'SHA-1',
    name: 'RSASSA-PKCS1-v1_5',
  } as const;
  const privateKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    certificate.privateKeyPkcs8,
    algorithm,
    false,
    ['sign'],
  );
  const publicKey = await globalThis.crypto.subtle.importKey(
    'spki',
    certificate.publicKeySpki,
    algorithm,
    false,
    ['verify'],
  );
  const document = xades.Parse(input.xml);
  const signature = new xades.SignedXml();
  await signature.Sign(algorithm, privateKey, document, {
    keyValue: publicKey,
    references: [{ hash: 'SHA-1', transforms: ['enveloped'] }],
    signingCertificate: certificate.certificateBase64,
    x509: [certificate.certificateBase64],
  });
  return signature.toString();
}
