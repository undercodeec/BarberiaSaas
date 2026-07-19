import { config as loadEnvironment } from 'dotenv';

import { buildApi } from './app';
import { readConfig } from './config';
import { createRecoveryMailer } from './recovery-mailer';

async function main(): Promise<void> {
  loadEnvironment({ path: '../../.env', quiet: true });

  const config = readConfig();
  const app = await buildApi({
    config,
    recoveryMailer: createRecoveryMailer(config),
  });

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  try {
    await app.listen({ host: config.API_HOST, port: config.API_PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
