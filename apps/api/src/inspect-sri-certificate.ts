import { config as loadEnvironment } from 'dotenv';

import { readConfig } from './config';
import { inspectSriCertificate } from './sri-signer';

async function main() {
  loadEnvironment({ path: '../../.env', quiet: true });
  const config = readConfig();
  if (!config.SRI_CERTIFICATE_PATH || !config.SRI_CERTIFICATE_PASSWORD)
    throw new Error(
      'SRI_CERTIFICATE_PATH y SRI_CERTIFICATE_PASSWORD deben estar configuradas.',
    );
  const certificate = await inspectSriCertificate({
    certificatePassword: config.SRI_CERTIFICATE_PASSWORD,
    certificatePath: config.SRI_CERTIFICATE_PATH,
  });
  console.log(
    JSON.stringify({
      canSign: certificate.canSign,
      expiresAt: certificate.expiresAt.toISOString(),
      subject: certificate.subject,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'No fue posible validar el certificado SRI.',
  );
  process.exitCode = 1;
});
