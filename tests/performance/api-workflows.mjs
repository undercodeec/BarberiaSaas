import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { loadLocalTestDatabaseEnvironment } from '../../scripts/test-database-env.mjs';

const API_HOST = '127.0.0.1';
const API_PORT = 4100;
const BASE_URL = `http://${API_HOST}:${API_PORT}`;
const FIXTURE_PATH = new URL(
  '../../apps/api/.secrets/performance-session.json',
  import.meta.url,
);
const API_ENTRYPOINT = new URL('../../apps/api/dist/index.js', import.meta.url);
const READ_INTERACTIONS = 200;
const READ_CONCURRENCY = 20;
const WRITE_INTERACTIONS = 50;
const WRITE_CONCURRENCY = 10;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1_000;
const BASELINE_RESULT_PATH = new URL(
  '../../.tmp/performance-v1.json',
  import.meta.url,
);
const RESULT_PATH = new URL('../../.tmp/performance-v2.json', import.meta.url);
let requestSequence = 0;

function budgetViolations(results, activity) {
  const violations = [];
  for (const result of results) {
    const isCriticalWrite =
      result.scenario === 'appointment-create' ||
      result.scenario === 'inventory-adjustment';
    const latencyBudget = isCriticalWrite ? 500 : 300;
    if (result.interactionP95Ms > latencyBudget) {
      violations.push(
        `${result.scenario}: p95 ${result.interactionP95Ms} ms excede ${latencyBudget} ms`,
      );
    }
    if (result.bytesP95 > 250_000) {
      violations.push(
        `${result.scenario}: ${result.bytesP95} bytes p95 excede 250000`,
      );
    }
    if (result.failures > 0) {
      violations.push(`${result.scenario}: ${result.failures} respuestas fallidas`);
    }
  }
  if (activity.failures > 0)
    violations.push(`session-activity-100: ${activity.failures} respuestas fallidas`);
  if (activity.updates !== 0)
    violations.push(
      `session-activity-100: ${activity.updates} escrituras con sesión reciente`,
    );
  return violations;
}

export const scalableScenarios = [
  'clients-first-page',
  'clients-search',
  'contact-import-100',
  'agenda-week-five-locations',
  'private-availability',
  'appointment-create',
  'inventory-first-page',
  'inventory-deep-cursor',
  'inventory-summary',
  'inventory-adjustment',
  'public-catalog',
].map((name) => ({ name }));

function percentile(values, value) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)
  ];
}

function assertString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `El fixture local no contiene ${field}; regénéralo con seed:performance -- --reset.`,
    );
  }
  return value;
}

function readFixture(value) {
  const fixture = JSON.parse(value);
  if (!Array.isArray(fixture.locationIds) || fixture.locationIds.length !== 5) {
    throw new Error('El fixture local no contiene las cinco sedes esperadas.');
  }
  if (
    !Array.isArray(fixture.productIds) ||
    fixture.productIds.length < WRITE_INTERACTIONS
  ) {
    throw new Error(
      'El fixture local no contiene productos suficientes; regénéralo con seed:performance -- --reset.',
    );
  }
  return {
    clientId: assertString(fixture.clientId, 'clientId'),
    locationIds: fixture.locationIds.map((id) =>
      assertString(id, 'locationId'),
    ),
    organizationId: assertString(fixture.organizationId, 'organizationId'),
    productIds: fixture.productIds.map((id) => assertString(id, 'productId')),
    professionalMembershipId: assertString(
      fixture.professionalMembershipId,
      'professionalMembershipId',
    ),
    serviceId: assertString(fixture.serviceId, 'serviceId'),
    token: assertString(fixture.token, 'token'),
  };
}

async function assertPortAvailable() {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () =>
      reject(
        new Error(
          `El puerto ${API_PORT} está ocupado; el runner no usará un servidor existente.`,
        ),
      ),
    );
    server.listen(API_PORT, API_HOST, () => server.close(resolve));
  });
}

function startApi(environment) {
  const apiEnvironment = {
    APPDATA: process.env.APPDATA,
    ComSpec: process.env.ComSpec,
    DATABASE_URL: environment.DATABASE_URL,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    NODE_ENV: 'production',
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TEST_DATABASE_URL: environment.TEST_DATABASE_URL,
    TMP: process.env.TMP,
    USERPROFILE: process.env.USERPROFILE,
  };
  const child = spawn(process.execPath, [fileURLToPath(API_ENTRYPOINT)], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: {
      ...apiEnvironment,
      API_HOST,
      API_PORT: String(API_PORT),
      API_TRUST_PROXY: 'true',
      APP_ENV: 'local',
      CORS_ORIGIN: 'http://localhost:3000',
    },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = [];
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));
  return { child, output };
}

async function waitForHealth(child, output) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${BASE_URL}/health`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return;
    } catch {
      // La API todavía está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const detail = output.join('').trim().slice(-600);
  throw new Error(
    detail
      ? `La API de rendimiento no inició: ${detail}`
      : 'La API de rendimiento no inició.',
  );
}

function stopApi(child) {
  if (child.exitCode === null) child.kill();
}

async function request(path, options = {}) {
  const startedAt = performance.now();
  const headers = new Headers(options.headers);
  if (!headers.has('x-forwarded-for')) {
    const sequence = requestSequence;
    requestSequence += 1;
    headers.set(
      'x-forwarded-for',
      `127.0.${Math.floor(sequence / 250) + 1}.${(sequence % 250) + 1}`,
    );
  }
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const responseBody = await response.text();
    const bytes = Buffer.byteLength(responseBody);
    return {
      bytes,
      durationMs: performance.now() - startedAt,
      failure: response.ok
        ? null
        : `${response.status} ${path} ${responseBody.slice(0, 120)}`,
      queryCount: Number(response.headers.get('x-nava-query-count') ?? 0),
    };
  } catch {
    return {
      bytes: 0,
      durationMs: performance.now() - startedAt,
      failure: `NETWORK ${path}`,
      queryCount: 0,
    };
  }
}

async function measure(name, interactions, concurrency, execute) {
  const durations = [];
  const bytes = [];
  const failures = [];
  let maximumQueryCount = 0;
  let requestCount = 0;
  let next = 0;

  async function worker() {
    while (next < interactions) {
      const index = next;
      next += 1;
      const startedAt = performance.now();
      const executed = await execute(index);
      const responses = Array.isArray(executed) ? executed : [executed];
      durations.push(performance.now() - startedAt);
      for (const response of responses) {
        requestCount += 1;
        bytes.push(response.bytes);
        maximumQueryCount = Math.max(maximumQueryCount, response.queryCount);
        if (response.failure) failures.push(response.failure);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return {
    bytesP95: Number(percentile(bytes, 0.95).toFixed(2)),
    failures: failures.length,
    failureSamples: failures.slice(0, 3),
    httpRequests: requestCount,
    interactionP50Ms: Number(percentile(durations, 0.5).toFixed(2)),
    interactionP95Ms: Number(percentile(durations, 0.95).toFixed(2)),
    maximumQueryCount,
    scenario: name,
  };
}

function authenticatedHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

function jsonRequest(token, body) {
  return {
    body: JSON.stringify(body),
    headers: {
      ...authenticatedHeaders(token),
      'content-type': 'application/json',
    },
    method: 'POST',
  };
}

function run(command, arguments_, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      env: environment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = [];
    child.stdout.on('data', (chunk) => output.push(chunk.toString()));
    child.stderr.on('data', (chunk) => output.push(chunk.toString()));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve(output.join(''));
      else
        reject(
          new Error(`El comando local de métricas terminó con código ${code}.`),
        );
    });
  });
}

async function sessionUpdates(environment) {
  const databaseUrl = new URL(environment.TEST_DATABASE_URL);
  const container = await testDatabaseContainer(environment);
  const output = await run(
    'docker',
    [
      'exec',
      container,
      'psql',
      '-U',
      databaseUrl.username,
      '-d',
      databaseUrl.pathname.slice(1),
      '-tAc',
      "SELECT pg_stat_force_next_flush() IS NULL; SELECT n_tup_upd FROM pg_stat_user_tables WHERE relname = 'sessions';",
    ],
    environment,
  );
  const value = Number(output.trim().split(/\s+/u).at(-1));
  if (!Number.isSafeInteger(value))
    throw new Error('No se pudo leer n_tup_upd de sessions.');
  return value;
}

async function testDatabaseContainer(environment) {
  const output = await run(
    'docker',
    [
      'ps',
      '--filter',
      'publish=5433',
      '--filter',
      'label=com.docker.compose.service=postgres-test',
      '--format',
      '{{.ID}}',
    ],
    environment,
  );
  const containers = output.trim().split(/\s+/u).filter(Boolean);
  if (containers.length !== 1) {
    throw new Error(
      'No se encontró exactamente un contenedor PostgreSQL local de pruebas en el puerto 5433.',
    );
  }
  return containers[0];
}

async function cleanupFixture(environment, fixture, marker) {
  const databaseUrl = new URL(environment.TEST_DATABASE_URL);
  const container = await testDatabaseContainer(environment);
  const sql = [
    `DELETE FROM audit_logs WHERE organization_id = '${fixture.organizationId}'::uuid AND ((entity_type = 'client' AND entity_id IN (SELECT id FROM clients WHERE notes = '${marker}')) OR (entity_type = 'appointment' AND entity_id IN (SELECT id FROM appointments WHERE notes = '${marker}')) OR (action = 'inventory.stock_adjusted' AND entity_id IN (SELECT product_id FROM stock_movements WHERE notes = '${marker}')));`,
    `DELETE FROM appointments WHERE organization_id = '${fixture.organizationId}'::uuid AND notes = '${marker}';`,
    `DELETE FROM clients WHERE organization_id = '${fixture.organizationId}'::uuid AND notes = '${marker}';`,
    `WITH affected AS (SELECT product_id FROM stock_movements WHERE organization_id = '${fixture.organizationId}'::uuid AND notes = '${marker}') UPDATE location_inventory AS inventory SET quantity_on_hand = quantity_on_hand - 1 FROM affected WHERE inventory.product_id = affected.product_id AND inventory.location_id = '${fixture.locationIds[0]}'::uuid;`,
    `DELETE FROM stock_movements WHERE organization_id = '${fixture.organizationId}'::uuid AND notes = '${marker}';`,
  ].join(' ');
  await run(
    'docker',
    [
      'exec',
      container,
      'psql',
      '-U',
      databaseUrl.username,
      '-d',
      databaseUrl.pathname.slice(1),
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    environment,
  );
}

async function contactImportV2(token, marker, index) {
  return request(
    '/v2/clients/import',
    jsonRequest(token, {
      contacts: Array.from({ length: 100 }, (_, contactIndex) => ({
        fullName: `Import ${index}-${contactIndex}`,
        notes: marker,
        phone: `+5938${String(index * 100 + contactIndex).padStart(8, '0')}`,
      })),
    }),
  );
}

async function main() {
  const environment = loadLocalTestDatabaseEnvironment();
  const fixture = readFixture(await readFile(FIXTURE_PATH, 'utf8'));
  const baseline = JSON.parse(await readFile(BASELINE_RESULT_PATH, 'utf8'));
  const marker = `performance-run:${randomUUID()}`;
  await assertPortAvailable();
  const api = startApi(environment);
  try {
    await waitForHealth(api.child, api.output);
    const headers = authenticatedHeaders(fixture.token);
    const date = new Date().toISOString().slice(0, 10);
    const results = [];
    results.push(
      await measure('clients-first-page', READ_INTERACTIONS, READ_CONCURRENCY, () =>
        request('/v2/clients?limit=50', { headers }),
      ),
    );
    results.push(
      await measure('clients-search', READ_INTERACTIONS, READ_CONCURRENCY, () =>
        request('/v2/clients?limit=50&search=Cliente%200000', { headers }),
      ),
    );
    results.push(
      await measure('contact-import-100', 10, 1, (index) =>
        contactImportV2(fixture.token, marker, index),
      ),
    );
    results.push(
      await measure(
        'agenda-week-five-locations',
        READ_INTERACTIONS,
        READ_CONCURRENCY,
        () =>
          request(
            `/v2/appointments?locationIds=${fixture.locationIds.join(',')}&from=${date}&to=${date}`,
            { headers },
          ),
      ),
    );
    results.push(
      await measure(
        'private-availability',
        READ_INTERACTIONS,
        READ_CONCURRENCY,
        () =>
          request(
            `/v2/availability?date=${date}&locationId=${fixture.locationIds[0]}&membershipId=${fixture.professionalMembershipId}&serviceIds=${fixture.serviceId}`,
            { headers },
          ),
      ),
    );
    results.push(
      await measure(
        'appointment-create',
        WRITE_INTERACTIONS,
        WRITE_CONCURRENCY,
        (index) =>
          request(
            '/v1/appointments',
            jsonRequest(fixture.token, {
              clientId: fixture.clientId,
              locationId: fixture.locationIds[0],
              notes: marker,
              professionalMembershipId: fixture.professionalMembershipId,
              serviceIds: [fixture.serviceId],
              startsAt: new Date(
                Date.UTC(2035, 0, 1, 14, 0) + index * 86_400_000,
              ).toISOString(),
            }),
          ),
      ),
    );
    results.push(
      await measure('inventory-first-page', READ_INTERACTIONS, READ_CONCURRENCY, () =>
        request(`/v2/inventory/products?locationId=${fixture.locationIds[0]}&limit=50`, {
          headers,
        }),
      ),
    );
    results.push(
      await measure(
        'inventory-summary',
        READ_INTERACTIONS,
        READ_CONCURRENCY,
        () =>
          request(
            `/v2/inventory/summary?locationId=${fixture.locationIds[0]}`,
            { headers },
          ),
      ),
    );
    results.push(
      await measure(
        'inventory-deep-page',
        READ_INTERACTIONS,
        READ_CONCURRENCY,
        () =>
          request(
            `/v2/inventory/movements?locationId=${fixture.locationIds[0]}&limit=30`,
            { headers },
          ),
      ),
    );
    results.push(
      await measure(
        'inventory-adjustment',
        WRITE_INTERACTIONS,
        WRITE_CONCURRENCY,
        (index) =>
          request(
            '/v1/inventory/adjustments',
            jsonRequest(fixture.token, {
              locationId: fixture.locationIds[0],
              notes: marker,
              productId: fixture.productIds[index],
              quantityDelta: 1,
              type: 'purchase',
              unitCostCents: 500,
            }),
          ),
      ),
    );
    results.push(
      await measure(
        'public-catalog',
        READ_INTERACTIONS,
        READ_CONCURRENCY,
        (index) =>
          request('/v2/public/perf-data-local/sede-1/catalog', {
            headers: { 'x-forwarded-for': `127.0.1.${(index % 250) + 1}` },
          }),
      ),
    );

    const updatesBefore = await sessionUpdates(environment);
    const activity = await measure(
      'session-activity-100',
      100,
      READ_CONCURRENCY,
      () => request('/v1/auth/session', { headers }),
    );
    const updatesAfter = await sessionUpdates(environment);
    const sessionActivity = { ...activity, updates: updatesAfter - updatesBefore };
    const violations = budgetViolations(results, sessionActivity);
    const report = {
      fixture: {
        appointments: 100000,
        clients: 100000,
        products: 100000,
        stockMovements: 100000,
      },
      budgetViolations: violations,
      sessionActivity,
      baselineV1: baseline.v1,
      v2: results,
    };
    await mkdir(new URL('../../.tmp/', import.meta.url), { recursive: true });
    await writeFile(RESULT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (violations.length > 0) process.exitCode = 1;
  } finally {
    await cleanupFixture(environment, fixture, marker);
    stopApi(api.child);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error de rendimiento local: ${error.message}`);
    process.exitCode = 1;
  });
}
