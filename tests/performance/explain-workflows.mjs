import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalTestDatabaseEnvironment } from '../../scripts/test-database-env.mjs';

const FIXTURE_PATH = new URL(
  '../../apps/api/.secrets/performance-session.json',
  import.meta.url,
);

function collectPlanNodes(value, nodes = []) {
  if (!value || typeof value !== 'object') return nodes;
  if ('Node Type' in value) {
    nodes.push({
      indexName: value['Index Name'] ?? null,
      nodeType: value['Node Type'],
    });
  }
  for (const child of Object.values(value)) collectPlanNodes(child, nodes);
  return nodes;
}

function assertUsesIndex(name, nodes, expectedIndexes) {
  const matching = nodes.find(
    (node) =>
      expectedIndexes.includes(node.indexName) &&
      ['Bitmap Index Scan', 'Index Only Scan', 'Index Scan'].includes(
        node.nodeType,
      ),
  );
  if (!matching)
    throw new Error(
      `${name} no usó uno de los índices esperados ${expectedIndexes.join(', ')}; nodos observados: ${JSON.stringify(nodes)}.`,
    );
}

async function explain(database, query) {
  const result = await database.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.text}`,
    query.values,
  );
  const plan = result.rows[0]?.['QUERY PLAN']?.[0]?.Plan;
  if (!plan) throw new Error('PostgreSQL no devolvió un plan JSON.');
  return collectPlanNodes(plan);
}

async function main() {
  const environment = loadLocalTestDatabaseEnvironment();
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
  const require = createRequire(
    new URL('../../packages/database/package.json', import.meta.url),
  );
  const { Client } = require('pg');
  const database = new Client({ connectionString: environment.TEST_DATABASE_URL });
  try {
    await database.connect();
    const organizationId = fixture.organizationId;
    const locationId = fixture.locationIds?.[0];
    if (typeof organizationId !== 'string' || typeof locationId !== 'string')
      throw new Error('El fixture local no contiene IDs de organización y sede.');
    // El fixture se inserta por lotes; refrescamos estadísticas antes de
    // comprobar el plan que PostgreSQL elegirá para sus tablas grandes.
    await database.query('ANALYZE clients, products, stock_movements');
    const reports = [
      {
        expectedIndexes: [
          'clients_full_name_trgm_idx',
          'clients_organization_full_name_trgm_idx',
        ],
        name: 'clients-search',
        query: {
          text: `SELECT id FROM clients
          WHERE organization_id = $1::uuid
            AND deleted_at IS NULL
            AND LOWER(full_name) LIKE '%cliente 0000%'
          LIMIT 50`,
          values: [organizationId],
        },
      },
      {
        expectedIndexes: ['products_status_name_cursor_idx'],
        name: 'inventory-first-page',
        query: {
          text: `SELECT id FROM products
          WHERE organization_id = $1::uuid AND is_active = TRUE
          ORDER BY is_active DESC, name ASC, id ASC
          LIMIT 50`,
          values: [organizationId],
        },
      },
      {
        expectedIndexes: ['stock_movements_location_created_cursor_idx'],
        name: 'inventory-deep-cursor',
        query: {
          text: `SELECT id FROM stock_movements
          WHERE location_id = $1::uuid
          ORDER BY created_at DESC, id DESC
          LIMIT 30`,
          values: [locationId],
        },
      },
    ];
    const output = [];
    for (const report of reports) {
      const nodes = await explain(database, report.query);
      assertUsesIndex(report.name, nodes, report.expectedIndexes);
      output.push({
        indexes: report.expectedIndexes,
        name: report.name,
        nodes,
      });
    }
    // Solo se emiten tipos de nodo y nombres de índices; nunca literales ni IDs.
    console.log(JSON.stringify({ plans: output }, null, 2));
  } finally {
    await database.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error de EXPLAIN local: ${error.message}`);
    process.exitCode = 1;
  });
}
