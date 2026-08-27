import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseEnvironmentFile } from './production-env.mjs';

const rootEnvironmentFile = fileURLToPath(new URL('../.env', import.meta.url));

async function main() {
  const [command, ...commandArguments] = process.argv.slice(3);
  if (process.argv[2] !== '--run' || !command) {
    throw new Error('Uso: node scripts/frontend-dev-env.mjs --run <comando>.');
  }
  const fileEnvironment = existsSync(rootEnvironmentFile)
    ? parseEnvironmentFile(readFileSync(rootEnvironmentFile, 'utf8'))
    : {};
  const environment = { ...fileEnvironment, ...process.env };
  if (!environment.NEXT_PUBLIC_API_URL?.trim()) {
    throw new Error(
      'NEXT_PUBLIC_API_URL falta. Crea el .env raíz desde .env.example para desarrollo.',
    );
  }
  const child = spawn(command, commandArguments, {
    env: environment,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`El servidor de desarrollo terminó con código ${code}.`),
          ),
    );
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error de configuración de desarrollo: ${error.message}`);
    process.exitCode = 1;
  });
}
