import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_LOCAL_TEST_DATABASE_URL =
  'postgresql://barber_saas:change-me-local-only@127.0.0.1:5433/barber_saas_test?schema=public';
const PROJECT_ROOT = new URL('../', import.meta.url);

function localDatabaseError() {
  return new Error(
    'La base local autorizada debe ser PostgreSQL en 127.0.0.1:5433/barber_saas_test.',
  );
}

export function assertLocalTestDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw localDatabaseError();
  }

  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '5433' ||
    url.pathname !== '/barber_saas_test'
  ) {
    throw localDatabaseError();
  }
  return value;
}

export function resolveLocalTestDatabaseUrl(environment = process.env) {
  const value = environment.TEST_DATABASE_URL?.trim();
  return assertLocalTestDatabaseUrl(value || DEFAULT_LOCAL_TEST_DATABASE_URL);
}

export function loadLocalTestDatabaseEnvironment(environment = process.env) {
  const envFile = fileURLToPath(new URL('.env', PROJECT_ROOT));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const testDatabaseUrl = resolveLocalTestDatabaseUrl({
    ...process.env,
    ...environment,
  });
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.TEST_DATABASE_URL = testDatabaseUrl;
  return {
    ...environment,
    DATABASE_URL: testDatabaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
  };
}

function run(command, arguments_, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      env: environment,
      shell: false,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            signal
              ? `El comando local terminó por la señal ${signal}.`
              : `El comando local terminó con código ${code}.`,
          ),
        );
    });
  });
}

function dockerEnvironmentValue(value) {
  return `'${value.replaceAll("'", "\\'")}'`;
}

async function startPostgres(environment) {
  const url = new URL(environment.TEST_DATABASE_URL);
  const directory = await mkdtemp(join(tmpdir(), 'barber-saas-test-db-'));
  const environmentFile = join(directory, 'compose.env');
  const contents = [
    `POSTGRES_DB=${dockerEnvironmentValue(url.pathname.slice(1))}`,
    `POSTGRES_PASSWORD=${dockerEnvironmentValue(decodeURIComponent(url.password))}`,
    `POSTGRES_USER=${dockerEnvironmentValue(decodeURIComponent(url.username))}`,
  ].join('\n');
  try {
    await writeFile(environmentFile, `${contents}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await run(
      'docker',
      ['compose', '--env-file', environmentFile, 'up', '-d', 'postgres-test'],
      environment,
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function main() {
  const [mode, ...arguments_] = process.argv.slice(2);
  const environment = loadLocalTestDatabaseEnvironment();
  if (mode === '--start-postgres') return startPostgres(environment);
  if (mode === '--run-pnpm' && arguments_.length > 0) {
    await startPostgres(environment);
    const pnpmCli = fileURLToPath(
      new URL('node_modules/pnpm/bin/pnpm.cjs', PROJECT_ROOT),
    );
    return run(process.execPath, [pnpmCli, ...arguments_], environment);
  }
  throw new Error(
    'Uso: node scripts/test-database-env.mjs --start-postgres | --run-pnpm <argumentos de pnpm>.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error de base de datos de pruebas: ${error.message}`);
    process.exitCode = 1;
  });
}
