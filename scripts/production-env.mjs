import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_ENV_FILE = '/etc/nava/frontend.env';

export function parseEnvironmentFile(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) {
      throw new Error('El archivo de entorno contiene una línea inválida.');
    }
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
  return values;
}

export function validateProductionFrontendEnvironment(environment) {
  const value = environment.NEXT_PUBLIC_API_URL?.trim();
  if (!value) {
    throw new Error(
      'NEXT_PUBLIC_API_URL es obligatoria. Defínela en /etc/nava/frontend.env.',
    );
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('NEXT_PUBLIC_API_URL debe ser una URL absoluta válida.');
  }
  if (url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_API_URL debe usar HTTPS en producción.');
  }
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(
      'NEXT_PUBLIC_API_URL no puede apuntar a localhost en producción.',
    );
  }
  if (url.hostname.includes('navaclouda.app')) {
    throw new Error(
      'NEXT_PUBLIC_API_URL contiene un dominio Nava inválido; usa api.navacloud.app.',
    );
  }
  return url.toString().replace(/\/+$/u, '');
}

export function loadProductionFrontendEnvironment(environment = process.env) {
  const envFile = environment.NAVA_FRONTEND_ENV_FILE ?? DEFAULT_ENV_FILE;
  const fileEnvironment = existsSync(envFile)
    ? parseEnvironmentFile(readFileSync(envFile, 'utf8'))
    : {};
  const merged = { ...fileEnvironment, ...environment };
  validateProductionFrontendEnvironment(merged);
  return merged;
}

async function main() {
  const argumentsAfterRun = process.argv.slice(3);
  const environment = loadProductionFrontendEnvironment();
  const [command, ...commandArguments] = argumentsAfterRun;
  if (process.argv[2] !== '--run') {
    console.log('Entorno público de producción válido.');
    return;
  }
  if (!command) {
    throw new Error('Uso: node scripts/production-env.mjs --run <comando>.');
  }
  const usePnpmCli = command === 'pnpm' && Boolean(process.env.npm_execpath);
  const child = spawn(
    usePnpmCli ? process.execPath : command,
    usePnpmCli
      ? [process.env.npm_execpath, ...commandArguments]
      : commandArguments,
    {
      env: environment,
      stdio: 'inherit',
    },
  );
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            signal
              ? `El comando de build terminó por la señal ${signal}.`
              : `El comando de build terminó con código ${code}.`,
          ),
        );
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error de configuración de producción: ${error.message}`);
    process.exitCode = 1;
  });
}
