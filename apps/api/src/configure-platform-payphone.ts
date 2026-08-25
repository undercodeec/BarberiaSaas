import {
  PayphoneEnvironment,
  PlatformPaymentConfigurationStatus,
  createDatabaseClient,
} from '@barber-saas/database';
import { config as loadEnvironment } from 'dotenv';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { encryptPlatformPaymentCredential } from './security';

loadEnvironment({ path: process.env.API_ENV_FILE ?? '.env' });

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatoria.`);
  return value;
}

async function ask(question: string): Promise<string> {
  const readline = createInterface({ input, output });
  try {
    return (await readline.question(question)).trim();
  } finally {
    readline.close();
  }
}

async function askSecret(question: string): Promise<string> {
  if (!input.isTTY || !output.isTTY)
    throw new Error('Este comando debe ejecutarse desde una terminal interactiva.');

  output.write(question);
  input.setRawMode(true);
  input.resume();

  try {
    return await new Promise<string>((resolve, reject) => {
      let secret = '';
      const onData = (chunk: Buffer) => {
        const character = chunk.toString('utf8');
        if (character === '\r' || character === '\n') {
          cleanup();
          output.write('\n');
          resolve(secret.trim());
          return;
        }
        if (character === '\u0003') {
          cleanup();
          reject(new Error('OperaciÃ³n cancelada.'));
          return;
        }
        if (character === '\u007f' || character === '\b') {
          secret = secret.slice(0, -1);
          return;
        }
        if (!character.startsWith('\u001b')) secret += character;
      };
      const cleanup = () => {
        input.off('data', onData);
        input.setRawMode(false);
        input.pause();
      };
      input.on('data', onData);
    });
  } catch (error) {
    input.setRawMode(false);
    throw error;
  }
}

async function main(): Promise<void> {
  const databaseUrl = requiredEnvironment('DATABASE_URL');
  const encryptionKey = requiredEnvironment(
    'PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY',
  );
  const storeId = await ask('StoreId de PayPhone: ');
  const token = await askSecret('Token de PayPhone (no se mostrara): ');
  const environmentAnswer = (
    await ask('Entorno [TEST/PRODUCTION] (TEST): ')
  ).toUpperCase();
  const environment =
    environmentAnswer === 'PRODUCTION'
      ? PayphoneEnvironment.PRODUCTION
      : PayphoneEnvironment.TEST;

  if (!storeId || !token)
    throw new Error('StoreId y token de PayPhone son obligatorios.');
  if (storeId.length > 160)
    throw new Error('El StoreId no puede superar 160 caracteres.');

  const confirmation = await ask(
    `Escriba CONFIGURAR para habilitar PayPhone ${environment}: `,
  );
  if (confirmation !== 'CONFIGURAR') throw new Error('OperaciÃ³n cancelada.');

  const database = createDatabaseClient({ connectionString: databaseUrl });
  try {
    await database.platformPaymentConfiguration.upsert({
      where: { provider: 'payphone' },
      create: {
        environment,
        storeId,
        encryptedToken: encryptPlatformPaymentCredential({
          secret: token,
          encodedKey: encryptionKey,
        }),
        isEnabled: true,
        status: PlatformPaymentConfigurationStatus.READY,
        webhookAuthorizedAt: new Date(),
        lastErrorCode: null,
      },
      update: {
        environment,
        storeId,
        encryptedToken: encryptPlatformPaymentCredential({
          secret: token,
          encodedKey: encryptionKey,
        }),
        isEnabled: true,
        status: PlatformPaymentConfigurationStatus.READY,
        webhookAuthorizedAt: new Date(),
        lastErrorCode: null,
      },
    });
  } finally {
    await database.$disconnect();
  }

  output.write(
    `ConfiguraciÃ³n PayPhone ${environment} guardada y cifrada. El token no fue mostrado.\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Error desconocido.';
  output.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
