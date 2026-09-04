# Plan de implementación de escalabilidad del tratamiento de datos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Reducir consultas, escrituras y transferencia innecesarias en reservas, agenda, clientes e inventario, manteniendo compatibilidad con las versiones móviles instaladas y soportando 100.000 registros por negocio.

**Architecture:** Se añadirán contratos v2 paginados y ligeros junto a los contratos v1 existentes. La API compartirá cursores, contexto de acceso, medición y cálculo de disponibilidad; React Query consumirá páginas y resúmenes con políticas de frescura dependientes del foco. PostgreSQL filtrará y agregará los datos mediante consultas e índices verificados con planes de ejecución reales.

**Tech Stack:** TypeScript 6, Node.js 24, Fastify 5, Prisma 7.8, PostgreSQL 18, React Native 0.86/Expo 57, React Query 5, Next.js 16, Vitest 4, Jest 29 y Playwright 1.61.

**Spec:** docs/superpowers/specs/2026-09-04-data-processing-scalability-design.md

## Global Constraints

- Mantener sin cambios incompatibles todos los endpoints v1 y las URLs públicas compartidas.
- No incorporar Redis, CQRS, colas externas ni almacenamiento de objetos.
- No modificar reglas comerciales, permisos, límites de planes, estados de citas o invariantes de inventario.
- Toda lista nueva usa cursor; límite predeterminado 50, máximo 100.
- Todo rango de agenda admite como máximo 31 días y todas las sedes se validan contra el tenant.
- Las listas y resúmenes no incluyen imágenes Base64; los medios se cargan bajo demanda.
- Las reservas y el inventario vuelven a validar dentro de la transacción; PostgreSQL conserva la autoridad final.
- La lectura de sesión ocurre por solicitud; lastActiveAt se escribe como máximo una vez cada cinco minutos.
- Las pruebas con datos destructivos usan exclusivamente TEST_DATABASE_URL cuando host=127.0.0.1 o localhost, puerto=5433 y la base incluye barber_saas_test.
- Nunca imprimir DATABASE_URL, TEST_DATABASE_URL, tokens, búsquedas, cuerpos, PII ni parámetros SQL.
- No ejecutar migraciones, benchmarks o pruebas contra Neon de producción.
- Aplicar TDD en cada tarea: prueba roja observada, implementación mínima, prueba verde, refactor y commit.
- No eliminar endpoints v1 dentro de este plan.

## Mapa de archivos y responsabilidades

| Archivo | Responsabilidad |
| --- | --- |
| packages/api-client/src/index.ts | Contratos compartidos CursorPage, clientes, agenda, inventario y catálogo público v2 |
| packages/validation/src/index.ts | Validación de límites, cursores, búsquedas, lotes y rangos v2 |
| apps/api/src/cursor-page.ts | Codificación, validación y corte limit+1 de cursores opacos |
| apps/api/src/session-activity.ts | Decisión pura de cuándo persistir actividad |
| apps/api/src/request-metrics.ts | Contexto asíncrono y contadores de consultas por solicitud |
| apps/api/src/operational-access.ts | Membresía, sedes activas y asignaciones memoizadas en una sentencia por petición |
| apps/api/src/media-response.ts | Decodificación segura de Data URI, ETag y respuesta binaria |
| apps/api/src/clients-v2.ts | Lecturas, notas, medios e importación escalables de clientes |
| apps/api/src/availability-engine.ts | Fusión y recorrido lineal de intervalos |
| apps/api/src/agenda-v2.ts | Agenda multi-sede, resumen mensual y disponibilidad privada |
| apps/api/src/inventory-v2.ts | Productos, resumen, movimientos y medios de inventario |
| apps/api/src/public-booking-v2.ts | Catálogo, disponibilidad y medios públicos ligeros |
| apps/mobile/src/features/clients/client-queries.ts | Opciones React Query y lotes de clientes |
| apps/mobile/src/features/agenda/agenda-queries.ts | Consulta multi-sede y política de polling enfocado |
| apps/mobile/src/features/inventory/inventory-queries.ts | Páginas, resumen y movimientos de inventario |
| apps/mobile/src/lib/use-route-focus.ts | Estado de foco reutilizable sin polling en rutas inactivas |
| packages/database/prisma/migrations/20260904150000_data_processing_indexes/migration.sql | Índices aditivos para las consultas v2 |
| packages/database/prisma/migrations/20260904150000_data_processing_indexes/rollback.sql | Reversión explícita de índices y extensión administrada |
| scripts/test-database-env.mjs | Guardia reutilizable que ejecuta pnpm solo contra PostgreSQL local de pruebas |
| apps/api/scripts/seed-performance.mjs | Dataset local reproducible de 100.000 registros |
| tests/performance/api-workflows.mjs | Carga autenticada y presupuestos p50/p95/bytes |
| docs/testing/data-processing-performance.md | Procedimiento reproducible y resultados antes/después |

---

### Task 0: Instrumentar y capturar la línea base antes de optimizar

**Files:**

- Create: scripts/test-database-env.mjs
- Create: scripts/test-database-env.test.mjs
- Create: apps/api/src/request-metrics.ts
- Create: apps/api/src/request-metrics.test.ts
- Create: apps/api/scripts/seed-performance.mjs
- Create: apps/api/scripts/seed-performance.test.mjs
- Create: tests/performance/api-workflows.mjs
- Create: docs/testing/data-processing-performance.md
- Modify: packages/database/src/index.ts
- Modify: apps/api/src/app.ts
- Modify: apps/api/src/app.integration.test.ts
- Modify: package.json

**Interfaces:**

- Produces: assertLocalTestDatabaseUrl(value), resolveLocalTestDatabaseUrl(environment), loadLocalTestDatabaseEnvironment() y modos CLI --start-postgres/--run-pnpm.
- Produces: runWithRequestMetrics(requestId, fn), observeDatabaseQuery(durationMs), currentRequestMetrics() e installRequestMetricsHooks(app).
- Modifica CreateDatabaseClientOptions con queryObserver?: (event: { durationMs: number }) => void; el texto y los parámetros SQL nunca salen de la capa Prisma.
- Produces: distributeRows(total, partitions) y un fixture local identificado por el slug perf-data-local.
- Produces: pnpm with:test-db, pnpm seed:performance y pnpm test:performance:data.
- La instrumentación es observacional: no modifica consultas de negocio, respuestas públicas ni contratos.

- [ ] **Step 1: Escribir la prueba roja de seguridad y distribución**

~~~javascript
assert.throws(
  () => assertLocalTestDatabaseUrl('postgresql://user:pass@remote/db'),
  /base local autorizada/,
);
assert.doesNotThrow(() =>
  assertLocalTestDatabaseUrl(
    'postgresql://user:pass@127.0.0.1:5433/barber_saas_test',
  ),
);
assert.throws(
  () =>
    resolveLocalTestDatabaseUrl({
      TEST_DATABASE_URL: 'postgresql://user:pass@remote/db',
    }),
  /base local autorizada/,
);
assert.equal(
  resolveLocalTestDatabaseUrl({
    DATABASE_URL: 'postgresql://neon.example/production',
  }),
  'postgresql://barber_saas:change-me-local-only@127.0.0.1:5433/barber_saas_test?schema=public',
);
assert.deepEqual(distributeRows(100_000, 5), [
  20_000,
  20_000,
  20_000,
  20_000,
  20_000,
]);
~~~

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: node --test scripts/test-database-env.test.mjs && pnpm --filter @barber-saas/api exec node --test scripts/seed-performance.test.mjs

Expected: FAIL porque los dos módulos todavía no existen.

- [ ] **Step 3: Implementar la guardia reutilizable**

scripts/test-database-env.mjs usa process.loadEnvFile sobre el .env de la raíz. Si TEST_DATABASE_URL existe, exige protocolo postgresql, host 127.0.0.1 o localhost, puerto 5433 y nombre exacto barber_saas_test; una URL explícita insegura siempre falla. Si falta, usa exclusivamente la credencial local documentada en .env.example y el destino fijo 127.0.0.1:5433/barber_saas_test; nunca lee usuario, contraseña, host o base desde DATABASE_URL. loadLocalTestDatabaseEnvironment asigna DATABASE_URL=TEST_DATABASE_URL después de validar.

El modo --start-postgres lanza docker compose -p barber-saas-performance up -d postgres-test con shell=false y las credenciales del TEST_DATABASE_URL validado en el entorno del hijo; el nombre de proyecto crea un volumen de pruebas aislado y el comando espera el healthcheck. El modo --run-pnpm llama primero al mismo arranque idempotente, después solo permite ejecutar pnpm (pnpm.cmd en Windows) con shell=false, hereda el entorno ya reemplazado y propaga el exit code. Ningún error incluye la URL ni credenciales.

Añadir al package.json raíz:

~~~json
{
  "with:test-db": "node scripts/test-database-env.mjs --run-pnpm"
}
~~~

- [ ] **Step 4: Implementar el seed idempotente**

El script importa loadLocalTestDatabaseEnvironment, la ejecuta antes de crear Prisma y nunca usa DATABASE_URL como fallback. Con --reset elimina exclusivamente la organización cuyo slug es perf-data-local y sus relaciones en cascada. Crea owner, membresía, suscripción multi activa con límites/funciones vigentes, cinco sedes, profesionales suficientes, servicios, horarios, token de sesión local y, en lotes de 1.000:

- 100.000 clientes con términos de búsqueda distribuidos;
- 100.000 citas distribuidas entre sedes, profesionales, fechas y estados;
- 100.000 productos e inventario para una sede;
- 100.000 movimientos de stock;
- cuatro registros separados con imágenes Base64 de 1 MB.

Guardar ids y token en apps/api/.secrets/performance-session.json, ruta ya ignorada por Git. Imprimir únicamente conteos y duración, nunca conexión o token.

- [ ] **Step 5: Escribir pruebas rojas de métricas aisladas**

~~~typescript
it('isolates parallel request counters', async () => {
  const [left, right] = await Promise.all([
    runWithRequestMetrics('left', async () => {
      observeDatabaseQuery(4);
      observeDatabaseQuery(6);
      return currentRequestMetrics();
    }),
    runWithRequestMetrics('right', async () => {
      observeDatabaseQuery(9);
      return currentRequestMetrics();
    }),
  ]);
  expect(left).toMatchObject({ databaseMs: 10, queryCount: 2 });
  expect(right).toMatchObject({ databaseMs: 9, queryCount: 1 });
});
~~~

Run: pnpm --filter @barber-saas/api test -- request-metrics.test.ts

Expected: FAIL porque request-metrics.ts no existe.

- [ ] **Step 6: Implementar observación neutral por solicitud**

request-metrics.ts usa AsyncLocalStorage<RequestMetrics>. packages/database/src/index.ts añade queryObserver opcional y solo habilita eventos Prisma query cuando se suministra; el callback recibe únicamente durationMs. La API pasa observeDatabaseQuery, instala hooks Fastify y registra únicamente route template, statusCode, durationMs, queryCount, databaseMs y responseBytes; nunca query, URL completa, parámetros o cuerpo.

En APP_ENV=local exponer x-nava-query-count y x-nava-response-bytes; omitirlos en preview/staging/production. Probar dos solicitudes paralelas y GET /health con conteo cero para demostrar aislamiento y ausencia de cambios de respuesta.

- [ ] **Step 7: Ejecutar verificación de instrumentación**

Run: node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/api test -- request-metrics.test.ts app.integration.test.ts; después pnpm --filter @barber-saas/api typecheck.

Expected: PASS.

- [ ] **Step 8: Crear el runner v1**

api-workflows.mjs lee apps/api/.secrets/performance-session.json y mide:

~~~javascript
const baselineScenarios = [
  'clients-list: GET /v1/clients',
  'contact-import-100: GET /v1/clients + hasta 100 POST /v1/clients',
  'agenda-week-five-locations: cinco GET /v1/appointments',
  'private-availability: GET /v1/availability',
  'appointment-create: POST /v1/appointments',
  'inventory-list: GET /v1/inventory',
  'inventory-dashboard-summary: GET /v1/inventory',
  'inventory-deep-page: GET /v1/inventory/movements?page=100&pageSize=30',
  'inventory-adjustment: POST /v1/inventory/adjustments',
  'public-catalog: GET /v1/public/{organization}/{location}',
];
~~~

El runner importa la misma guardia, levanta un proceso hijo de la API compilada en 127.0.0.1:4100 con DATABASE_URL fijada explícitamente al valor local validado y APP_ENV=local; no acepta PERF_BASE_URL ni conecta con un servidor preexistente. Espera /health, ejecuta la carga y termina el hijo en finally. Si el puerto está ocupado, falla sin enviar solicitudes.

Registrar por escenario solicitudes HTTP por interacción, p50, p95, bytes p95, máximo de x-nava-query-count y fallos. Las lecturas usan 200 iteraciones/concurrencia 20; creación de citas y ajustes usan 50/concurrencia 10 con recursos deterministas no conflictivos; la importación ejecuta 10 interacciones de 100 contactos con los cuatro workers actuales. Restaurar únicamente los subrecursos del tenant perf-data-local entre escenarios de escritura para que cada medición parta del mismo estado.

Para actividad de sesión, medir el delta de n_tup_upd de la tabla sessions alrededor de 100 solicitudes autenticadas mediante docker compose -p barber-saas-performance exec -T postgres-test psql y pg_stat_force_next_flush(), con argumentos directos y shell=false. El runner de línea base informa resultados y solo falla por errores HTTP; los presupuestos v2 todavía no se aplican.

- [ ] **Step 9: Añadir scripts y ejecutar la línea base**

~~~json
{
  "seed:performance": "pnpm --filter @barber-saas/api exec node scripts/seed-performance.mjs",
  "test:performance:data": "node tests/performance/api-workflows.mjs"
}
~~~

Run:

~~~powershell
node scripts/test-database-env.mjs --start-postgres
node scripts/test-database-env.mjs --run-pnpm db:migrate:deploy
pnpm seed:performance -- --reset
pnpm --filter @barber-saas/api build
pnpm test:performance:data
~~~

Expected: exit 0 y métricas completas de los diez escenarios.

- [ ] **Step 10: Documentar el entorno y resultados**

docs/testing/data-processing-performance.md registra fecha, CPU, RAM, versiones, tamaño de fixture, concurrencia, solicitudes y tabla v1. Marcar la columna v2 como “no ejecutada” en esta tarea; esto es un estado medido, no una decisión pendiente.

- [ ] **Step 11: Commit**

~~~bash
git add scripts/test-database-env.mjs scripts/test-database-env.test.mjs apps/api/src/request-metrics.ts apps/api/src/request-metrics.test.ts apps/api/scripts/seed-performance.mjs apps/api/scripts/seed-performance.test.mjs tests/performance/api-workflows.mjs packages/database/src/index.ts apps/api/src/app.ts apps/api/src/app.integration.test.ts package.json
git add -f docs/testing/data-processing-performance.md
git commit -m "perf(api): instrument and baseline data workflows"
~~~

---

### Task 1: Contratos paginados y cursores compartidos

**Files:**

- Create: apps/api/src/cursor-page.ts
- Create: apps/api/src/cursor-page.test.ts
- Modify: packages/api-client/src/index.ts
- Modify: packages/api-client/src/index.test.ts
- Modify: packages/validation/src/index.ts
- Modify: packages/validation/src/index.test.ts

**Interfaces:**

- Produces: CursorKind, encodeCursor(kind, values, id), decodeCursor(token, expectedKind), sliceCursorPage(rows, limit, cursorFor).
- Produces: CursorPage<T>, ClientPageResponse, ClientNotesPageResponse, ClientImportResponse, AppointmentsPageResponse, AppointmentCalendarSummaryResponse, InventoryProductsPageResponse, InventorySummaryResponse, StockMovementsPageResponse y PublicBookingCatalogV2.
- Consumes: ApiError para mapear cursores inválidos a INVALID_CURSOR.

- [ ] **Step 1: Escribir las pruebas rojas de cursores**

~~~typescript
import { describe, expect, it } from 'vitest';
import {
  decodeCursor,
  encodeCursor,
  sliceCursorPage,
} from './cursor-page';

describe('cursor-page', () => {
  it('round-trips version, resource, values and id', () => {
    const token = encodeCursor('client', ['Ana', true], 'client-2');
    expect(decodeCursor(token, 'client')).toEqual({
      id: 'client-2',
      kind: 'client',
      values: ['Ana', true],
      version: 1,
    });
  });

  it('rejects a cursor created for another resource', () => {
    const token = encodeCursor('client', ['Ana'], 'client-2');
    expect(() => decodeCursor(token, 'inventory-product')).toThrow(
      'INVALID_CURSOR',
    );
  });

  it('returns only limit rows and builds the next cursor from the last item', () => {
    const result = sliceCursorPage(
      [{ id: '1' }, { id: '2' }, { id: '3' }],
      2,
      (row) => encodeCursor('client', [row.id], row.id),
    );
    expect(result.items.map(({ id }) => id)).toEqual(['1', '2']);
    expect(decodeCursor(result.nextCursor!, 'client').id).toBe('2');
  });
});
~~~

- [ ] **Step 2: Ejecutar las pruebas para comprobar RED**

Run: pnpm --filter @barber-saas/api test -- cursor-page.test.ts

Expected: FAIL porque apps/api/src/cursor-page.ts no existe.

- [ ] **Step 3: Implementar el núcleo mínimo de cursor**

~~~typescript
export type CursorKind =
  | 'appointment'
  | 'client'
  | 'client-note'
  | 'inventory-product'
  | 'stock-movement';

interface CursorPayload {
  readonly id: string;
  readonly kind: CursorKind;
  readonly values: readonly (boolean | number | string)[];
  readonly version: 1;
}

export function encodeCursor(
  kind: CursorKind,
  values: CursorPayload['values'],
  id: string,
): string {
  return Buffer.from(JSON.stringify({ id, kind, values, version: 1 }))
    .toString('base64url');
}

export function decodeCursor(
  token: string,
  expectedKind: CursorKind,
): CursorPayload {
  const parsed = cursorPayloadSchema.safeParse(
    JSON.parse(Buffer.from(token, 'base64url').toString('utf8')),
  );
  if (!parsed.success || parsed.data.kind !== expectedKind)
    throw new ApiError(400, 'INVALID_CURSOR', 'El cursor no es válido.');
  return parsed.data;
}
~~~

Implementar sliceCursorPage con filas limit+1; nextCursor debe ser null cuando no existe fila adicional.

- [ ] **Step 4: Añadir pruebas rojas de validación y contratos**

En packages/validation/src/index.test.ts comprobar:

~~~typescript
expect(
  clientPageQuerySchema.parse({ limit: '100', search: ' Ana ' }),
).toMatchObject({ limit: 100, search: 'Ana' });
expect(() => clientPageQuerySchema.parse({ limit: '101' })).toThrow();
expect(() =>
  agendaPageQuerySchema.parse({
    from: '2026-01-01',
    locationIds: 'a,b',
    to: '2026-02-02',
  }),
).toThrow();
expect(() =>
  agendaPageQuerySchema.parse({
    activeAfter: 'not-an-instant',
    from: '2026-01-01',
    locationIds: 'a',
    to: '2026-01-01',
  }),
).toThrow();
expect(() =>
  clientImportSchema.parse({
    contacts: Array.from({ length: 101 }, (_, index) => ({
      fullName: 'Cliente ' + index,
      phone: '+59399000' + index,
    })),
  }),
).toThrow();
~~~

En packages/api-client/src/index.test.ts crear valores tipados para CursorPage<ClientRecord>, InventoryProductsPageResponse y PublicBookingCatalogV2 que usen imageUrl y nunca imageData.

- [ ] **Step 5: Ejecutar las pruebas de contratos para comprobar RED**

Run: pnpm --filter @barber-saas/validation test && pnpm --filter @barber-saas/api-client test

Expected: FAIL por exports y tipos ausentes.

- [ ] **Step 6: Implementar esquemas y tipos compartidos**

Añadir:

~~~typescript
export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface ClientPageResponse extends CursorPage<ClientRecord> {}

export interface ClientNoteSummary {
  readonly createdAt: string;
  readonly description: string;
  readonly hasPhoto: boolean;
  readonly id: string;
  readonly photoUrl: string | null;
}

export interface ClientImportItemResult {
  readonly clientId: string | null;
  readonly inputIndex: number;
  readonly reason: 'already_exists' | 'invalid' | 'plan_limit' | null;
  readonly status: 'created' | 'rejected' | 'skipped';
}
~~~

Definir los demás tipos enumerados en Interfaces. agendaPageQuerySchema admite activeAfter opcional como instante ISO y lo usa solo para exigir endsAt > activeAfter dentro del rango civil; esto permite que dashboard solicite únicamente la cita en curso o siguiente. Mantener intactos ClientsResponse, InventoryResponse, AppointmentsResponse y PublicBookingCatalog.

- [ ] **Step 7: Ejecutar pruebas y typecheck**

Run: pnpm --filter @barber-saas/api test -- cursor-page.test.ts && pnpm --filter @barber-saas/validation test && pnpm --filter @barber-saas/api-client test && pnpm --filter @barber-saas/api typecheck

Expected: PASS.

- [ ] **Step 8: Commit**

~~~bash
git add apps/api/src/cursor-page.ts apps/api/src/cursor-page.test.ts packages/api-client/src/index.ts packages/api-client/src/index.test.ts packages/validation/src/index.ts packages/validation/src/index.test.ts
git commit -m "feat(api): add scalable cursor contracts"
~~~

---

### Task 2: Actividad de sesión limitada

**Files:**

- Create: apps/api/src/session-activity.ts
- Create: apps/api/src/session-activity.test.ts
- Modify: apps/api/src/app.ts:1161-1187, 1190-1215
- Modify: apps/api/src/app.integration.test.ts

**Interfaces:**

- Produces: SESSION_ACTIVITY_TOUCH_INTERVAL_MS y shouldTouchSession(lastActiveAt, now).
- Consumes: los contadores de Task 0 para demostrar la eliminación de escrituras repetidas.

- [ ] **Step 1: Escribir pruebas rojas del intervalo de sesión**

~~~typescript
it('touches activity only after five minutes', () => {
  const now = new Date('2026-09-04T12:05:00.000Z');
  expect(shouldTouchSession(new Date('2026-09-04T12:00:01.000Z'), now)).toBe(
    false,
  );
  expect(shouldTouchSession(new Date('2026-09-04T12:00:00.000Z'), now)).toBe(
    true,
  );
});
~~~

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: pnpm --filter @barber-saas/api test -- session-activity.test.ts

Expected: FAIL porque el módulo no existe.

- [ ] **Step 3: Implementar la decisión pura y el UPDATE condicional**

~~~typescript
export const SESSION_ACTIVITY_TOUCH_INTERVAL_MS = 5 * 60 * 1_000;

export function shouldTouchSession(lastActiveAt: Date, now: Date): boolean {
  return (
    now.getTime() - lastActiveAt.getTime() >=
    SESSION_ACTIVITY_TOUCH_INTERVAL_MS
  );
}
~~~

En authenticate, sustituir update incondicional por:

~~~typescript
if (shouldTouchSession(session.lastActiveAt, now)) {
  await database.session.updateMany({
    data: { lastActiveAt: now },
    where: {
      id: session.id,
      lastActiveAt: {
        lte: new Date(now.getTime() - SESSION_ACTIVITY_TOUCH_INTERVAL_MS),
      },
    },
  });
}
~~~

- [ ] **Step 4: Añadir integración roja de no escritura repetida**

Crear una sesión con lastActiveAt reciente, inyectar dos GET /v1/auth/session y comprobar que lastActiveAt no cambia. Retroceder lastActiveAt seis minutos, repetir y comprobar que avanza una sola vez. Esta prueba protege la semántica v1.

- [ ] **Step 5: Ejecutar la integración con TEST_DATABASE_URL**

Run: node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/api test -- app.integration.test.ts

Expected antes del cambio en authenticate: FAIL porque lastActiveAt cambia en cada petición. Expected después del Step 3: PASS.

- [ ] **Step 6: Confirmar reducción medida y commit**

Ejecutar 100 GET autenticados con sesión reciente y afirmar que x-nava-query-count no incluye UPDATE de sesión. Retroceder lastActiveAt seis minutos, ejecutar otras 100 solicitudes concurrentes y afirmar mediante n_tup_upd que ocurre exactamente una actualización condicional.

~~~bash
git add apps/api/src/session-activity.ts apps/api/src/session-activity.test.ts apps/api/src/app.ts apps/api/src/app.integration.test.ts
git commit -m "perf(api): throttle session activity writes"
~~~

---

### Task 3: Contexto operacional memoizado

**Files:**

- Create: apps/api/src/operational-access.ts
- Create: apps/api/src/operational-access.test.ts
- Modify: apps/api/src/app.ts:1190-1200, 3230-3300

**Interfaces:**

- Consumes: Authenticate existente.
- Produces: createOperationalAccessLoader(database), OperationalAccessLoader y OperationalAccess.
- OperationalAccess contiene userId, membershipId, organizationId, currencyCode, role, assignedLocationIds y activeOrganizationLocations con id/name/timezone.

- [ ] **Step 1: Escribir prueba roja de memoización y aislamiento**

~~~typescript
it('loads active membership once per Fastify request', async () => {
  const database = fakeDatabaseWithActiveOwner();
  const loadAccess = createOperationalAccessLoader(database);
  const request = {} as FastifyRequest;
  const [first, second] = await Promise.all([
    loadAccess(request, 'user-1'),
    loadAccess(request, 'user-1'),
  ]);
  expect(first).toBe(second);
  expect(database.$queryRaw).toHaveBeenCalledTimes(1);
});

it('does not reuse access across requests', async () => {
  const database = fakeDatabaseWithActiveOwner();
  const loadAccess = createOperationalAccessLoader(database);
  await loadAccess({} as FastifyRequest, 'user-1');
  await loadAccess({} as FastifyRequest, 'user-1');
  expect(database.$queryRaw).toHaveBeenCalledTimes(2);
});
~~~

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: pnpm --filter @barber-saas/api test -- operational-access.test.ts

Expected: FAIL porque el módulo no existe.

- [ ] **Step 3: Implementar loader mediante WeakMap**

~~~typescript
export interface OperationalAccess {
  readonly activeOrganizationLocations: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly timezone: string;
  }>;
  readonly assignedLocationIds: readonly string[];
  readonly currencyCode: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly role: MembershipRole;
  readonly userId: string;
}

export function createOperationalAccessLoader(database: DatabaseClient) {
  const requests = new WeakMap<FastifyRequest, Promise<OperationalAccess>>();
  return (request: FastifyRequest, userId: string) => {
    const cached = requests.get(request);
    if (cached) return cached;
    const pending = loadActiveOperationalAccess(database, userId);
    requests.set(request, pending);
    return pending;
  };
}
~~~

loadActiveOperationalAccess ejecuta una sola sentencia SQL parametrizada: selecciona la membresía activa, role, organization.currency_code y agrega por LATERAL/JSONB_AGG tanto las sedes activas de la organización como los location_id asignados al miembro. Eliminar locationIds del ejemplo en favor de activeOrganizationLocations y assignedLocationIds. Rechaza ausencia con ORGANIZATION_REQUIRED. Los permisos de cada endpoint continúan validándose después de cargar el contexto. Añadir una aserción de prueba que el observador registra exactamente una operación aun cuando existan 25 sedes y varias asignaciones.

- [ ] **Step 4: Registrar una instancia por buildApi**

Crear loadOperationalAccess una vez después de crear Fastify y pasarlo únicamente a los módulos v2. No cambiar las firmas de los módulos v1 todavía.

- [ ] **Step 5: Ejecutar pruebas**

Run: pnpm --filter @barber-saas/api test -- operational-access.test.ts && pnpm --filter @barber-saas/api typecheck

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add apps/api/src/operational-access.ts apps/api/src/operational-access.test.ts apps/api/src/app.ts
git commit -m "refactor(api): share operational access per request"
~~~

---

### Task 4: API v2 de clientes, notas, medios e importación

**Files:**

- Create: apps/api/src/media-response.ts
- Create: apps/api/src/media-response.test.ts
- Create: apps/api/src/clients-v2.ts
- Create: apps/api/src/clients-v2.integration.test.ts
- Modify: apps/api/src/app.ts:3230-3300
- Modify: apps/api/src/subscription-policy.ts
- Modify: apps/api/src/subscription-policy.test.ts

**Interfaces:**

- Consumes: clientPageQuerySchema, clientImportSchema, CursorPage helpers y OperationalAccessLoader.
- Produces: registerClientV2Routes(app, database, authenticate, loadOperationalAccess).
- Produces: assertCanCreateClients(transaction, organizationId, requestedCount): Promise<number>, donde el retorno es la cantidad permitida.
- Produces: decodeDataUri(value), sendMedia(reply, media, visibility).

- [ ] **Step 1: Escribir pruebas rojas de medios**

~~~typescript
it('decodes allowed image data URIs and rejects other content', () => {
  expect(decodeDataUri('data:image/png;base64,aGVsbG8=')).toMatchObject({
    bytes: Buffer.from('hello'),
    contentType: 'image/png',
  });
  expect(() => decodeDataUri('data:text/html;base64,aGVsbG8=')).toThrow(
    'INVALID_MEDIA',
  );
});
~~~

- [ ] **Step 2: Implementar media-response**

Aceptar image/jpeg, image/png y image/webp; calcular ETag SHA-256; responder 304 ante If-None-Match; usar private, max-age=300 para medios privados y public, max-age=300 para públicos.

- [ ] **Step 3: Escribir integración roja del listado**

Crear dos tenants con clientes, etiquetas y clientes eliminados. Solicitar GET /v2/clients?limit=2 y afirmar:

~~~typescript
expect(first.statusCode).toBe(200);
expect(first.json<ClientPageResponse>().items).toHaveLength(2);
expect(first.json<ClientPageResponse>().nextCursor).toEqual(expect.any(String));
expect(secondPageIds).not.toEqual(
  expect.arrayContaining(firstPageIds),
);
expect(allReturnedOrganizationIds).not.toContain(otherOrganizationId);
~~~

Añadir casos de búsqueda, etiqueta, teléfono enmascarado por rol, cursor inválido y límite 101.

- [ ] **Step 4: Ejecutar listado para comprobar RED**

Run: node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/api test -- clients-v2.integration.test.ts

Expected: FAIL con 404 para /v2/clients.

- [ ] **Step 5: Implementar listado con select y limit+1**

Orden: fullName asc, id asc. Cursor:

~~~typescript
const after = cursor
  ? Prisma.sql`AND (client.full_name, client.id) > (${cursor.values[0]}, ${cursor.id}::uuid)`
  : Prisma.empty;
~~~

Ejecutar una sola sentencia SQL parametrizada construida con Prisma.sql/Prisma.join. Aplicar organization_id, deleted_at IS NULL, el clientScope equivalente según role y un EXISTS por labelId. La búsqueda escapa literalmente %, _ y \\ y usa LOWER(full_name) LIKE, phone LIKE y LOWER(email) LIKE para coincidir con los índices de Task 12. Agregar etiquetas con LATERAL/JSONB_AGG limitado a id/name/color, seleccionar solo campos de ClientRecord, ordenar full_name/id y pedir limit+1. No ejecutar count ni consultas por relación.

- [ ] **Step 6: Escribir e implementar notas paginadas y fotografía**

Prueba roja: la página de notas contiene hasPhoto y photoUrl, pero JSON.stringify(response) no contiene data:image. GET de photoUrl devuelve bytes, Content-Type, ETag y 304. Otro tenant recibe 404.

Orden de notas: createdAt desc, id desc. Ejecutar una sola consulta SQL parametrizada y acotada por tenant/cliente que seleccione id, created_at, description y (photo_data IS NOT NULL) AS has_photo, sin devolver photo_data. La URL se deriva de has_photo. La consulta usa limit+1 y desempate por id; cuenta como una sola operación dentro del presupuesto de cuatro.

- [ ] **Step 7: Escribir prueba roja del límite por lote**

En subscription-policy.test.ts:

~~~typescript
it('returns only the remaining client capacity for a batch', async () => {
  const allowed = await assertCanCreateClients(transactionAtLimit(98, 100), 'org', 5);
  expect(allowed).toBe(2);
});
~~~

- [ ] **Step 8: Implementar importación transaccional**

POST /v2/clients/import acepta máximo 100. Dentro de un advisory lock por organization:

~~~typescript
const allowedCount = await assertCanCreateClients(
  transaction,
  access.organizationId,
  uniqueCandidates.length,
);
const accepted = uniqueCandidates.slice(0, allowedCount);
const created = await transaction.client.createManyAndReturn({
  data: accepted.map((contact) => ({
    createdByUserId: user.id,
    fullName: contact.fullName,
    organizationId: access.organizationId,
    phone: contact.phone,
    updatedByUserId: user.id,
  })),
});
await transaction.auditLog.createMany({
  data: created.map((client) => ({
    action: 'client.created',
    actorUserId: user.id,
    entityId: client.id,
    entityType: 'client',
    metadata: { source: 'contact_import' },
    organizationId: access.organizationId,
  })),
});
~~~

Normalizar cada candidato a dígitos canónicos para deduplicar dentro del lote. Consultar teléfonos existentes en una sola operación SQL parametrizada con organization_id, deleted_at IS NULL y regexp_replace(phone, '\D', '', 'g') = ANY($phoneDigits); Task 12 añade el índice de expresión correspondiente. Conservar orden por inputIndex y devolver created/skipped/rejected. Un fallo SQL revierte clientes y auditorías.

- [ ] **Step 9: Verificar compatibilidad v1 y presupuesto**

Ejecutar pruebas existentes de clientes y nuevas. En el test v2 afirmar x-nava-query-count <= 4 para página y <= 8 para lote con sesión reciente.

Run: node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/api test -- clients.test.ts clients-v2.integration.test.ts subscription-policy.test.ts app.integration.test.ts

Expected: PASS.

- [ ] **Step 10: Commit**

~~~bash
git add apps/api/src/media-response.ts apps/api/src/media-response.test.ts apps/api/src/clients-v2.ts apps/api/src/clients-v2.integration.test.ts apps/api/src/app.ts apps/api/src/subscription-policy.ts apps/api/src/subscription-policy.test.ts
git commit -m "feat(api): add scalable client data flows"
~~~

---

### Task 5: Migración móvil de clientes y selección para reservas

**Files:**

- Create: apps/mobile/src/features/clients/client-queries.ts
- Create: apps/mobile/src/features/clients/client-queries.test.ts
- Modify: apps/mobile/app/(onboarding)/clients.tsx:270-465
- Modify: apps/mobile/app/(onboarding)/new-booking.tsx:1-70
- Modify: apps/mobile/src/features/screens/clients-components.tsx
- Modify: apps/mobile/src/lib/client-record.ts
- Create: apps/mobile/src/lib/client-record.test.ts

**Interfaces:**

- Consumes: ClientPageResponse y ClientImportResponse.
- Produces: clientPageQueryOptions(api, scope, filters), flattenClientPages(data), chunkContacts(contacts, 100).

- [ ] **Step 1: Escribir pruebas rojas de opciones y lotes**

~~~typescript
it('requests one page and forwards cancellation', async () => {
  const api = { request: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) };
  const signal = new AbortController().signal;
  const options = clientPageQueryOptions(api, scope, { search: 'Ana' });
  await options.queryFn({ pageParam: null, signal } as never);
  expect(api.request).toHaveBeenCalledTimes(1);
  expect(api.request).toHaveBeenCalledWith(
    '/v2/clients?limit=50&search=Ana',
    { signal },
  );
});

it('chunks 205 contacts into three API batches', () => {
  expect(chunkContacts(makeContacts(205), 100).map((part) => part.length)).toEqual(
    [100, 100, 5],
  );
});
~~~

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: pnpm --filter @barber-saas/mobile test -- client-queries.test.ts

Expected: FAIL porque el módulo no existe.

- [ ] **Step 3: Implementar useInfiniteQuery y búsqueda con debounce**

clientPageQueryOptions usa initialPageParam null, getNextPageParam response.nextCursor, limit 50 y signal. clients.tsx mantiene searchInput inmediato y debouncedSearch de 300 ms. La lista renderiza flattenClientPages y solicita fetchNextPage al acercarse al final.

Eliminar refetchInterval=30000 y el refetch incondicional de useFocusEffect. Conservar refetch al foco solo cuando la consulta está obsoleta según staleTime=60000.

- [ ] **Step 4: Migrar importación**

No solicitar /v1/clients para conocer todos los teléfonos. Enviar los contactos seleccionados a POST /v2/clients/import en lotes de 100 y combinar ClientImportItemResult. Una selección de 73 contactos genera exactamente una solicitud.

Actualizar la caché con los created devueltos o invalidar solo tenant.key('clients-v2', filtros activos). Invalidar subscription una vez al terminar todos los lotes.

- [ ] **Step 5: Migrar selección de cliente de nueva reserva**

new-booking.tsx usa el mismo query option, no ClientsResponse. Sin búsqueda muestra la primera página; con texto usa debouncedSearch. Conservar “Continuar sin cliente”, creación inline, permisos y navegación.

- [ ] **Step 6: Añadir prueba de regresión de interfaz**

Renderizar el modelo de datos con dos páginas, seleccionar un cliente de la primera, cambiar búsqueda y verificar que selectedClientId se mantiene hasta que el usuario elija otro. Comprobar que una respuesta tardía de “An” no reemplaza “Ana” mediante signal abortado.

- [ ] **Step 7: Ejecutar pruebas y typecheck móvil**

Run: pnpm --filter @barber-saas/mobile test -- client-queries.test.ts client-record.test.ts && pnpm --filter @barber-saas/mobile typecheck

Expected: PASS.

- [ ] **Step 8: Commit**

~~~bash
git add apps/mobile/src/features/clients apps/mobile/app/\(onboarding\)/clients.tsx apps/mobile/app/\(onboarding\)/new-booking.tsx apps/mobile/src/features/screens/clients-components.tsx apps/mobile/src/lib/client-record.ts apps/mobile/src/lib/client-record.test.ts
git commit -m "perf(mobile): paginate client workflows"
~~~

---

### Task 6: Motor lineal compartido de disponibilidad

**Files:**

- Create: apps/api/src/availability-engine.ts
- Create: apps/api/src/availability-engine.test.ts
- Modify: apps/api/src/agenda.ts:230-448, 543-665
- Modify: apps/api/src/public-booking.ts:130-138, 460-559
- Create: apps/api/src/agenda.test.ts
- Modify: apps/api/src/public-booking.integration.test.ts

**Interfaces:**

- Produces: mergeRanges(ranges) y buildAvailability(input).
- buildAvailability recibe windows, occupied, durationMinutes, stepMinutes, date, timezone y now; devuelve slots y unavailableSlots.
- Consumes: zonedDateTimeToUtc mediante callbacks explícitos para mantener pruebas deterministas.

- [ ] **Step 1: Escribir pruebas rojas del motor**

~~~typescript
it('merges overlapping and adjacent occupied ranges', () => {
  expect(
    mergeRanges([
      range('09:00', '09:30'),
      range('09:20', '10:00'),
      range('10:00', '10:15'),
    ]),
  ).toEqual([range('09:00', '10:15')]);
});

it('keeps boundary-touching appointments available', () => {
  const result = buildAvailability(
    availabilityInput({
      occupied: [range('09:00', '09:30')],
      window: range('09:00', '10:30'),
    }),
  );
  expect(result.slots.map(({ startsAt }) => startsAt)).toContain(iso('09:30'));
});
~~~

Añadir casos de múltiples ventanas, DST, duración que cruza cierre, now para público y unavailableSlots privado.

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: pnpm --filter @barber-saas/api test -- availability-engine.test.ts

Expected: FAIL porque el módulo no existe.

- [ ] **Step 3: Implementar ordenación, fusión y puntero monotónico**

~~~typescript
const merged = mergeRanges(input.occupied);
let occupiedIndex = 0;
for (const window of input.windows) {
  for (let start = window.start; fits(start, window, input.durationMinutes); start = advance(start, input.stepMinutes)) {
    while (
      occupiedIndex < merged.length &&
      merged[occupiedIndex]!.endsAt <= start
    )
      occupiedIndex += 1;
    const conflict = merged[occupiedIndex];
    // clasificar y emitir la franja sin volver a recorrer rangos anteriores
  }
}
~~~

- [ ] **Step 4: Sustituir cálculos duplicados en v1 sin cambiar respuestas**

En agenda.ts y public-booking.ts seleccionar solo startsAt y endsAt. Consultar BusinessWeeklySchedule una vez con findUnique y convertirlo en una ventana. Mantener las diferencias funcionales: paso privado de 5 minutos, paso público igual a duración, exclusión de horas pasadas solo en público.

- [ ] **Step 5: Ejecutar regresión de reservas**

Run: node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/api test -- availability-engine.test.ts agenda.test.ts public-booking.integration.test.ts app.integration.test.ts

Expected: PASS y snapshots/respuestas v1 sin cambios.

- [ ] **Step 6: Commit**

~~~bash
git add apps/api/src/availability-engine.ts apps/api/src/availability-engine.test.ts apps/api/src/agenda.ts apps/api/src/agenda.test.ts apps/api/src/public-booking.ts apps/api/src/public-booking.integration.test.ts
git commit -m "perf(api): linearize booking availability"
~~~

---

### Task 7: API v2 de agenda multi-sede

**Files:**

- Create: apps/api/src/agenda-v2.ts
- Create: apps/api/src/agenda-v2.integration.test.ts
- Modify: apps/api/src/app.ts:3230-3300
- Modify: packages/validation/src/index.ts
- Modify: packages/validation/src/index.test.ts

**Interfaces:**

- Consumes: OperationalAccessLoader, agendaPageQuerySchema, appointmentCalendarSummaryQuerySchema, cursor helpers y publicAppointment.
- Produces: registerAgendaV2Routes(app, database, authenticate, loadOperationalAccess).

- [ ] **Step 1: Escribir integración roja multi-sede**

Crear un owner con tres sedes y otra sede ajena. GET /v2/appointments con dos locationIds debe devolver citas de ambas con una sola respuesta, orden startsAt asc/id asc y nextCursor. Una sede ajena devuelve 403 sin filtrar parcialmente.

~~~typescript
expect(Number(response.headers['x-nava-query-count'])).toBeLessThanOrEqual(4);
~~~

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/api test -- agenda-v2.integration.test.ts

Expected: FAIL con 404.

- [ ] **Step 3: Implementar GET /v2/appointments**

Validar rango civil <=31 días, activeAfter opcional como instante ISO y máximo 25 locationIds únicas. Owners/managers pueden usar sedes de su organización; otros roles solo locationIds asignadas. Convertir límites por zona horaria de cada sede y construir los predicados por sede con Prisma.sql/Prisma.join dentro de una única sentencia parametrizada. Cuando activeAfter está presente añadir appointment.ends_at > activeAfter sin alterar el orden ni los demás filtros.

Para garantizar una sola sentencia de datos, usar una consulta SQL parametrizada con LATERAL/JSON aggregation que seleccione profesional y servicios dentro de la misma sentencia. Mapear el resultado al contrato AppointmentRecord:

~~~typescript
SELECT appointment.*,
       professional_user.full_name AS professional_name,
       COALESCE(service_rows.items, '[]'::jsonb) AS services
FROM appointments AS appointment
JOIN memberships AS professional
  ON professional.id = appointment.professional_membership_id
JOIN users AS professional_user ON professional_user.id = professional.user_id
LEFT JOIN LATERAL (
  SELECT JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'id', service.id,
      'serviceId', service.service_id,
      'serviceName', service.service_name,
      'durationMinutes', service.duration_minutes,
      'priceCents', service.price_cents
    ) ORDER BY service.sort_order
  ) AS items
  FROM appointment_services AS service
  WHERE service.appointment_id = appointment.id
) AS service_rows ON TRUE
-- Los filtros tenant/sedes/rango/cursor son fragmentos Prisma.sql parametrizados.
ORDER BY appointment.starts_at ASC, appointment.id ASC
LIMIT page_size_plus_one
~~~

- [ ] **Step 4: Escribir prueba roja del resumen mensual**

Crear citas cerca de medianoche en dos zonas horarias. Afirmar agrupación por fecha local/sede y exclusión de pending_verification/expired igual que v1.

- [ ] **Step 5: Implementar calendar-summary en PostgreSQL**

Usar query parametrizada con Prisma.sql/Prisma.join; unir appointments con locations y agrupar por:

~~~sql
TO_CHAR(appointment.starts_at AT TIME ZONE location.timezone, 'YYYY-MM-DD')
~~~

La consulta filtra organization_id, location_id IN, estados y rango absoluto ampliado máximo 14 horas por extremos de zona. Aplicar HAVING sobre la fecha civil solicitada. Devolver count como Number.

- [ ] **Step 6: Implementar GET /v2/availability**

Crear loadBookingContextV2 como una sentencia SQL parametrizada que une location, membership, member_locations, professional_services y services para validar profesional/sede y producir snapshots. Después ejecutar una consulta de BusinessWeeklySchedule y una de rangos Appointment. Reutilizar availability-engine. Con autenticación y OperationalAccess el total estable es como máximo seis operaciones. Afirmar respuesta equivalente a /v1/availability para el mismo fixture.

- [ ] **Step 7: Ejecutar pruebas**

Run: node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/api test -- agenda-v2.integration.test.ts availability-engine.test.ts app.integration.test.ts

Expected: PASS.

- [ ] **Step 8: Commit**

~~~bash
git add apps/api/src/agenda-v2.ts apps/api/src/agenda-v2.integration.test.ts apps/api/src/app.ts packages/validation/src/index.ts packages/validation/src/index.test.ts
git commit -m "feat(api): add multi-location agenda queries"
~~~

---

### Task 8: Migración móvil de agenda y control de polling

**Files:**

- Create: apps/mobile/src/lib/use-route-focus.ts
- Create: apps/mobile/src/lib/query-lifecycle-focus.test.ts
- Create: apps/mobile/src/features/agenda/agenda-queries.ts
- Create: apps/mobile/src/features/agenda/agenda-queries.test.ts
- Modify: apps/mobile/app/(onboarding)/agenda.tsx:168-260, 546-570
- Modify: apps/mobile/app/(onboarding)/dashboard.tsx:136-165
- Modify: apps/mobile/app/(onboarding)/reschedule-booking.tsx:94-113

**Interfaces:**

- Consumes: AppointmentsPageResponse, AppointmentCalendarSummaryResponse y AvailabilityResponse.
- Produces: agendaPageQueryOptions, calendarSummaryQueryOptions y focusedInterval(isFocused, milliseconds).

- [ ] **Step 1: Escribir pruebas rojas de fan-out y polling**

~~~typescript
it('uses one request for all selected locations', async () => {
  const api = recordingApi({ items: [], nextCursor: null });
  await agendaPageQueryOptions(api, scope, {
    from: '2026-09-01',
    locationIds: ['a', 'b', 'c'],
    to: '2026-09-07',
  }).queryFn({ pageParam: null, signal: new AbortController().signal } as never);
  expect(api.request).toHaveBeenCalledTimes(1);
  expect(api.request.mock.calls[0][0]).toContain('locationIds=a%2Cb%2Cc');
});

expect(focusedInterval(false, 30_000)).toBe(false);
expect(focusedInterval(true, 30_000)).toBe(30_000);
~~~

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: pnpm --filter @barber-saas/mobile test -- agenda-queries.test.ts query-lifecycle-focus.test.ts

Expected: FAIL porque los módulos no existen.

- [ ] **Step 3: Implementar opciones de consulta**

agendaPageQueryOptions realiza una solicitud v2 con todas las sedes, cursor y signal. calendarSummaryQueryOptions solo se habilita en vista mensual. focusedInterval retorna false al perder foco.

- [ ] **Step 4: Migrar agenda.tsx**

Eliminar Promise.all(locationIds.map(request)). Usar useInfiniteQuery para día/semana. Para mes, solicitar calendar-summary y pedir los detalles del día seleccionado. Mantener filtros por profesional, transiciones, selección de cita, acciones y query keys tenant-aware.

Usar refetchInterval como función:

~~~typescript
refetchInterval: isRouteFocused ? 30_000 : false,
refetchIntervalInBackground: false,
~~~

- [ ] **Step 5: Migrar dashboard y reprogramación**

Dashboard solicita una página de citas del día con activeAfter=now y limit=1, suficiente para conservar exactamente la tarjeta de cita en curso o siguiente incluso cuando ya existan más de 50 citas finalizadas; no descarga inventario en esta tarea. Añadir una prueba con 60 citas finalizadas y una futura que confirme que solo la futura se devuelve. Reschedule usa /v2/availability y conserva todos los parámetros.

- [ ] **Step 6: Añadir prueba de invalidación precisa**

Al cancelar una cita en sede a, invalidar agenda-appointments cuyas claves incluyan a y el rango afectado; no invalidar páginas exclusivamente de sede b. Al reprogramar, invalidar fecha/sede origen y destino.

- [ ] **Step 7: Ejecutar pruebas y typecheck**

Run: pnpm --filter @barber-saas/mobile test -- agenda-queries.test.ts query-lifecycle-focus.test.ts agenda-range.test.ts && pnpm --filter @barber-saas/mobile typecheck

Expected: PASS.

- [ ] **Step 8: Commit**

~~~bash
git add apps/mobile/src/lib/use-route-focus.ts apps/mobile/src/lib/query-lifecycle-focus.test.ts apps/mobile/src/features/agenda apps/mobile/app/\(onboarding\)/agenda.tsx apps/mobile/app/\(onboarding\)/dashboard.tsx apps/mobile/app/\(onboarding\)/reschedule-booking.tsx
git commit -m "perf(mobile): consolidate agenda requests"
~~~

---

### Task 9: API v2 de inventario y resumen SQL

**Files:**

- Create: apps/api/src/inventory-v2.ts
- Create: apps/api/src/inventory-v2.integration.test.ts
- Modify: apps/api/src/app.ts:3230-3300
- Modify: packages/validation/src/index.ts
- Modify: packages/validation/src/index.test.ts

**Interfaces:**

- Consumes: OperationalAccessLoader, inventoryPageQuerySchema, stockMovementPageQuerySchema, media-response y cursor helpers.
- Produces: registerInventoryV2Routes(app, database, authenticate, loadOperationalAccess).
- InventoryProductsPageResponse devuelve items, nextCursor, summary, accessibleLocations, locationId y currencyCode.

- [ ] **Step 1: Escribir integración roja del producto liviano**

Crear dos sedes, un producto con imagen de 1 MB y existencias distintas. GET /v2/inventory/products?locationId=...&limit=1 debe:

~~~typescript
expect(body.items[0]).not.toHaveProperty('imageData');
expect(body.items[0].imageUrl).toMatch(
  /^\/v2\/inventory\/products\/.+\/image$/u,
);
expect(body.items[0].quantityOnHand).toBe(quantityAtSelectedLocation);
expect(Buffer.byteLength(response.body)).toBeLessThan(250_000);
~~~

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/api test -- inventory-v2.integration.test.ts

Expected: FAIL con 404.

- [ ] **Step 3: Implementar consulta paginada**

Permitir inventario solo a owner/manager, como v1. Para owner, las sedes accesibles son activeOrganizationLocations; para manager, su intersección con assignedLocationIds. Validar locationId contra esa lista antes de consultar. Consultar productos unidos únicamente a location_inventory de la sede seleccionada. Orden isActive desc, name asc, id asc. Aplicar status, search y lowStockOnly en SQL, incluyendo:

~~~sql
COALESCE(inventory.quantity_on_hand, 0) <= product.minimum_stock
AND product.stock_tracking_enabled = TRUE
~~~

Construir la sentencia con Prisma.sql y parámetros, nunca concatenando input. Seleccionar el booleano imageData IS NOT NULL AS has_image, no el contenido. accessibleLocations y currencyCode provienen del OperationalAccess ya cargado, sin consultas adicionales.

- [ ] **Step 4: Implementar resumen en la primera página**

La primera página ejecuta en paralelo una agregación SQL para activeProducts, inventoryCostCents, lowStockProducts y totalUnits. Páginas con cursor devuelven summary=null. GET /v2/inventory/summary expone la misma agregación para dashboard.

La agregación usa SUM/COUNT en PostgreSQL y no carga productos en Node.

- [ ] **Step 5: Implementar movimientos por cursor**

GET /v2/inventory/movements ordena createdAt desc/id desc, solicita limit+1 y filtra:

~~~typescript
OR: [
  { createdAt: { lt: cursorDate } },
  { createdAt: cursorDate, id: { lt: cursor.id } },
]
~~~

No ejecutar count ni skip. Mantener nombres de producto y reversal metadata.

- [ ] **Step 6: Implementar imagen privada**

GET /v2/inventory/products/:productId/image selecciona solo imageData bajo organizationId. Devuelve 404 si no existe/no hay imagen/otro tenant. Probar ETag y Cache-Control private.

- [ ] **Step 7: Verificar presupuesto y v1**

Con sesión reciente afirmar <=4 operaciones para productos, resumen y movimientos por separado. Repetir una página profunda construida con 20 cursores y comprobar que el conteo no cambia. Ejecutar pruebas existentes de ajustes, ventas y stock.

Run: node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/api test -- inventory-v2.integration.test.ts app.integration.test.ts

Expected: PASS.

- [ ] **Step 8: Commit**

~~~bash
git add apps/api/src/inventory-v2.ts apps/api/src/inventory-v2.integration.test.ts apps/api/src/app.ts packages/validation/src/index.ts packages/validation/src/index.test.ts
git commit -m "feat(api): add scalable inventory reads"
~~~

---

### Task 10: Migración móvil de inventario, caja y dashboard

**Files:**

- Create: apps/mobile/src/features/inventory/inventory-queries.ts
- Create: apps/mobile/src/features/inventory/inventory-queries.test.ts
- Modify: apps/mobile/app/(onboarding)/inventory.tsx:90-330
- Modify: apps/mobile/app/(onboarding)/cash-register.tsx:168-215
- Modify: apps/mobile/app/(onboarding)/dashboard.tsx:152-165
- Modify: apps/mobile/src/features/screens/dashboard-model.ts
- Modify: apps/mobile/src/features/screens/dashboard-model.test.ts

**Interfaces:**

- Consumes: InventoryProductsPageResponse, InventorySummaryResponse y StockMovementsPageResponse.
- Produces: inventoryProductsQueryOptions, inventoryMovementsQueryOptions y inventorySummaryQueryOptions.

- [ ] **Step 1: Escribir pruebas rojas de consultas**

~~~typescript
it('does not request movement history until its tab is visible', () => {
  expect(inventoryQueryState({ session: true, tab: 'products' })).toEqual({
    movementsEnabled: false,
    productsEnabled: true,
  });
});

it('builds a cursor request scoped to one location', async () => {
  const api = recordingApi(page);
  await inventoryProductsQueryOptions(api, scope, {
    locationId: 'location-a',
    search: 'cera',
  }).queryFn({ pageParam: 'cursor-1', signal } as never);
  expect(api.paths()).toEqual([
    '/v2/inventory/products?locationId=location-a&limit=50&search=cera&cursor=cursor-1',
  ]);
});
~~~

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: pnpm --filter @barber-saas/mobile test -- inventory-queries.test.ts

Expected: FAIL porque el módulo no existe.

- [ ] **Step 3: Implementar páginas y carga por pestaña**

inventory.tsx usa useInfiniteQuery para productos y movimientos. Solo la pestaña visible habilita su consulta. La primera página conserva summary y accessibleLocations; cambiar sede crea otra clave. Las imágenes usan imageUrl y carga lazy del componente visual.

Eliminar la invalidación indiscriminada de todas las páginas. Después de ajuste, actualizar quantityOnHand del producto en páginas cacheadas, invalidar summary de la sede y la primera página de movimientos.

- [ ] **Step 4: Migrar selector de producto de caja**

cash-register.tsx deja de solicitar /v1/inventory. Usa búsqueda paginada v2 para el selector de producto. Mantener selección, cálculo de precio, validación de existencias y venta.

- [ ] **Step 5: Migrar dashboard al resumen**

Sustituir GET /v1/inventory por GET /v2/inventory/summary. dashboard-model recibe InventorySummaryResponse, no InventoryResponse. Confirmar que tarjetas y alertas muestran los mismos valores.

- [ ] **Step 6: Añadir prueba de invalidaciones**

Una reversión de venta invalida solo: producto/sede afectados, inventory-summary de la sede, primera página de inventory-movements, cash-register-summary y business-summary. No invalidar páginas de otra sede.

- [ ] **Step 7: Ejecutar pruebas**

Run: pnpm --filter @barber-saas/mobile test -- inventory-queries.test.ts dashboard-model.test.ts && pnpm --filter @barber-saas/mobile typecheck

Expected: PASS.

- [ ] **Step 8: Commit**

~~~bash
git add apps/mobile/src/features/inventory apps/mobile/app/\(onboarding\)/inventory.tsx apps/mobile/app/\(onboarding\)/cash-register.tsx apps/mobile/app/\(onboarding\)/dashboard.tsx apps/mobile/src/features/screens/dashboard-model.ts apps/mobile/src/features/screens/dashboard-model.test.ts
git commit -m "perf(mobile): load inventory on demand"
~~~

---

### Task 11: Catálogo y disponibilidad pública v2

**Files:**

- Create: apps/api/src/public-booking-v2.ts
- Create: apps/api/src/public-booking-v2.integration.test.ts
- Create: apps/api/src/public-booking-context.ts
- Modify: apps/api/src/app.ts:3230-3300
- Modify: apps/api/src/public-booking.ts:140-350
- Modify: apps/web/app/[organizationSlug]/[locationSlug]/page.tsx
- Modify: apps/web/app/components/BookingExperience.tsx:180-215
- Modify: apps/web/app/api/public-proxy/[...path]/route.ts
- Modify: packages/api-client/src/index.ts
- Modify: apps/web/app/test-setup.ts
- Create: apps/web/app/public-booking-v2.test.ts

**Interfaces:**

- Consumes: PublicBookingCatalogV2, availability-engine y media-response.
- Produces: registerPublicBookingV2Routes(app, database).
- Produces: requirePublicLocation y loadPublicBookingPolicy reutilizados por v1/v2.
- Mantiene POST de creación/verificación/gestión en v1.

- [ ] **Step 1: Escribir integración roja del catálogo liviano**

Con fixtures que contengan imágenes Base64 en organización, profesional, servicio y producto:

~~~typescript
expect(serializedCatalog).not.toContain('data:image');
expect(body.services[0].imageUrl).toMatch('/v2/public/');
expect(body.products[0].imageUrl).toMatch('/v2/public/');
expect(body.professionals[0].photoUrl).toMatch('/v2/public/');
expect(response.headers['cache-control']).toContain('max-age=60');
~~~

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/api test -- public-booking-v2.integration.test.ts

Expected: FAIL con 404.

- [ ] **Step 3: Implementar catálogo con select**

Extraer requirePublicLocation y la evaluación de políticas a public-booking-context.ts; hacer que v1 y v2 importen esas mismas funciones y demostrar con la regresión que no cambian status/códigos. Seleccionar solo campos usados, reviews limitadas a 40 y banderas hasImage/hasPhoto. Generar URLs:

~~~text
/v2/public/{organizationSlug}/{locationSlug}/media/service/{serviceId}
/v2/public/{organizationSlug}/{locationSlug}/media/product/{productId}
/v2/public/{organizationSlug}/{locationSlug}/media/professional/{membershipId}
/v2/public/{organizationSlug}/{locationSlug}/media/organization/{organizationId}
~~~

Responder Cache-Control public, max-age=60, stale-while-revalidate=300.

- [ ] **Step 4: Implementar medios públicos**

Validar kind con enum, pertenencia al organization/location y visibilidad pública. Seleccionar una sola columna Base64. Responder Cache-Control public, max-age=300 y ETag. Un id de otro tenant devuelve 404.

- [ ] **Step 5: Implementar disponibilidad pública v2**

Reutilizar loadBookingContext y availability-engine. Seleccionar rangos del día y business schedule una vez. Respuesta igual a disponibilidad pública v1 para fixtures futuros, ocupados y límites.

- [ ] **Step 6: Migrar web sin cambiar URLs navegables**

La página [organizationSlug]/[locationSlug] obtiene /v2/public/.../catalog con Next:

~~~typescript
fetch(url, { next: { revalidate: 60 } })
~~~

BookingExperience usa imageUrl/photoUrl y /v2/public/.../availability a través del mismo origen /api/public-proxy. Ampliar el proxy para aceptar exclusivamente prefijos v1/public y v2/public; reenviar If-None-Match en GET/HEAD y Cache-Control, ETag, Content-Length y Content-Type desde medios v2. Mantener creación, verificación, pago, cancelación, reprogramación, reseñas y órdenes sobre sus endpoints v1 existentes. La prueba web debe afirmar que una URL de medio v2 atraviesa el proxy y conserva 304/ETag, mientras cualquier otro prefijo devuelve 404.

- [ ] **Step 7: Probar regresión pública**

Run: node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/api test -- public-booking-v2.integration.test.ts public-booking.integration.test.ts; después pnpm --filter @barber-saas/web test y pnpm --filter @barber-saas/web typecheck.

Expected: PASS.

- [ ] **Step 8: Commit**

~~~bash
git add apps/api/src/public-booking-v2.ts apps/api/src/public-booking-v2.integration.test.ts apps/api/src/public-booking-context.ts apps/api/src/public-booking.ts apps/api/src/app.ts apps/web/app/\[organizationSlug\]/\[locationSlug\]/page.tsx apps/web/app/components/BookingExperience.tsx apps/web/app/api/public-proxy/\[...path\]/route.ts apps/web/app/public-booking-v2.test.ts apps/web/app/test-setup.ts packages/api-client/src/index.ts
git commit -m "perf(web): load public booking media on demand"
~~~

---

### Task 12: Índices PostgreSQL basados en los contratos v2

**Files:**

- Create: packages/database/prisma/migrations/20260904150000_data_processing_indexes/migration.sql
- Create: packages/database/prisma/migrations/20260904150000_data_processing_indexes/rollback.sql
- Modify: packages/database/prisma/schema.prisma:1392-1467, 1738-1847, 1966-2016
- Create: packages/database/src/data-processing-indexes.test.ts
- Create: docs/database/data-processing-indexes.md

**Interfaces:**

- Consumes: formas de consulta finalizadas en Tasks 4, 7, 9 y 11.
- Produces: índices nombrados y documentados; no cambia filas ni contratos.

- [ ] **Step 1: Validar URL local sin imprimirla**

~~~powershell
node scripts/test-database-env.mjs --start-postgres
node scripts/test-database-env.mjs --run-pnpm db:status
~~~

El segundo comando vuelve a cargar y validar .env dentro del mismo proceso que lanza pnpm; Prisma nunca hereda DATABASE_URL de Neon. Todo comando de migración o prueba PostgreSQL de esta tarea debe pasar por este wrapper.

- [ ] **Step 2: Escribir prueba roja de objetos**

data-processing-indexes.test.ts consulta pg_indexes/pg_extension y exige:

~~~typescript
expect(indexNames).toEqual(
  expect.arrayContaining([
    'clients_active_name_cursor_idx',
    'clients_full_name_trgm_idx',
    'clients_phone_trgm_idx',
    'clients_phone_digits_idx',
    'clients_email_trgm_idx',
    'appointments_location_starts_cursor_idx',
    'products_status_name_cursor_idx',
    'products_name_trgm_idx',
    'stock_movements_location_created_cursor_idx',
  ]),
);
expect(extensions).toContain('pg_trgm');
~~~

- [ ] **Step 3: Ejecutar para comprobar RED**

Run: pnpm --filter @barber-saas/database test -- data-processing-indexes.test.ts

Expected: FAIL porque los índices no existen.

- [ ] **Step 4: Crear migración aditiva**

~~~sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "clients_active_name_cursor_idx"
  ON "clients" ("organization_id", "full_name", "id")
  WHERE "deleted_at" IS NULL;
CREATE INDEX "clients_full_name_trgm_idx"
  ON "clients" USING GIN (LOWER("full_name") gin_trgm_ops)
  WHERE "deleted_at" IS NULL;
CREATE INDEX "clients_phone_trgm_idx"
  ON "clients" USING GIN ("phone" gin_trgm_ops)
  WHERE "deleted_at" IS NULL;
CREATE INDEX "clients_phone_digits_idx"
  ON "clients" ("organization_id", regexp_replace("phone", '\\D', '', 'g'))
  WHERE "deleted_at" IS NULL;
CREATE INDEX "clients_email_trgm_idx"
  ON "clients" USING GIN (LOWER("email") gin_trgm_ops)
  WHERE "deleted_at" IS NULL AND "email" IS NOT NULL;

CREATE INDEX "appointments_location_starts_cursor_idx"
  ON "appointments" ("location_id", "starts_at", "id");
CREATE INDEX "products_status_name_cursor_idx"
  ON "products" ("organization_id", "is_active" DESC, "name", "id");
CREATE INDEX "products_name_trgm_idx"
  ON "products" USING GIN (LOWER("name") gin_trgm_ops);
CREATE INDEX "stock_movements_location_created_cursor_idx"
  ON "stock_movements" ("location_id", "created_at" DESC, "id" DESC);
~~~

No eliminar índices anteriores en esta migración. Una eliminación por redundancia requiere evidencia de pg_stat_user_indexes de producción y queda fuera de esta fase.

- [ ] **Step 5: Crear rollback explícito**

rollback.sql elimina solo los nueve índices nuevos. No elimina pg_trgm porque puede ser compartida con otros objetos presentes o futuros.

- [ ] **Step 6: Actualizar schema.prisma**

Representar en Prisma únicamente los índices B-tree no parciales soportados, con map exacto. Los índices parciales de clientes, los índices GIN y el índice de expresión clients_phone_digits_idx permanecen administrados por SQL y se documentan junto a los modelos para impedir que un futuro mantenedor los confunda con objetos huérfanos.

- [ ] **Step 7: Ejecutar migración sobre estado anterior y cadena completa**

Sobre copia/instancia temporal local: aplicar hasta 20260901110000, cargar fixtures con cero, uno y varios registros, aplicar 20260904150000 y ejecutar la prueba. En otra base temporal vacía ejecutar toda la cadena con pnpm db:migrate:deploy.

Run:

~~~powershell
node scripts/test-database-env.mjs --run-pnpm db:migrate:deploy
node scripts/test-database-env.mjs --run-pnpm db:status
node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/database test
node scripts/test-database-env.mjs --run-pnpm db:validate
~~~

Expected: schema up to date; test PASS; ninguna migración fallida.

- [ ] **Step 8: Documentar locks, parcialidad y rollback**

docs/database/data-processing-indexes.md debe declarar que CREATE INDEX normal puede bloquear escrituras brevemente, estimar duración con el dataset de 100.000, enumerar estado parcial tras cada sentencia y establecer rollback por índice. Si la medición local indica duración incompatible con despliegue, dividir en migración operativa con CREATE INDEX CONCURRENTLY y ejecutar cada sentencia fuera de una transacción, manteniendo los mismos nombres y pruebas.

- [ ] **Step 9: Commit**

~~~bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260904150000_data_processing_indexes packages/database/src/data-processing-indexes.test.ts
git add -f docs/database/data-processing-indexes.md
git commit -m "perf(database): index scalable data queries"
~~~

---

### Task 13: Dataset grande, EXPLAIN y presupuestos de rendimiento

**Files:**

- Modify: apps/api/scripts/seed-performance.mjs
- Modify: apps/api/scripts/seed-performance.test.mjs
- Modify: tests/performance/api-workflows.mjs
- Create: tests/performance/explain-workflows.mjs
- Modify: tests/performance/api-smoke.mjs
- Modify: package.json
- Modify: docs/testing/data-processing-performance.md

**Interfaces:**

- Consumes: fixture y línea base v1 de Task 0, endpoints v2, headers locales de medición e índices de Task 12.
- Produces: pnpm test:performance:data y pnpm test:performance:explain.

- [ ] **Step 1: Escribir prueba roja del catálogo de escenarios v2**

~~~javascript
assert.deepEqual(
  scalableScenarios.map(({ name }) => name),
  [
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
  ],
);
~~~

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: pnpm --filter @barber-saas/api exec node --test scripts/seed-performance.test.mjs

Expected: FAIL porque scalableScenarios todavía no se exporta.

- [ ] **Step 3: Extender el fixture sin cambiar su identidad**

Conservar la validación de TEST_DATABASE_URL, el organization slug perf-data-local y el borrado limitado a ese tenant implementados en Task 0. Extender el fixture para que incluya:

- 100.000 clientes distribuidos entre nombres, teléfonos, correos y etiquetas;
- 100.000 citas distribuidas entre cinco sedes, profesionales, fechas y estados;
- 100.000 productos con inventario por una sede seleccionada, sin imágenes grandes;
- 100.000 movimientos de stock;
- una muestra separada con imágenes Base64 de 1 MB para medir payload;
- owner, membresía, sedes, servicios, horarios y sesión/token local.

Insertar en lotes de 1.000 mediante createMany y transacciones acotadas por tipo de entidad. Imprimir ids no sensibles, conteos y la ruta ignorada del token; no imprimir la URL ni credenciales.

La distribución debe incluir empates deliberados en full_name/name/starts_at/created_at para probar el desempate por id, citas simultáneas entre profesionales, productos activos e inactivos y movimientos con la misma fecha. Volver a ejecutar las pruebas de guardia de Task 0 después de la extensión.

- [ ] **Step 4: Extender carga HTTP**

api-workflows.mjs ejecuta con concurrencia 20 y 200 solicitudes por escenario:

~~~javascript
export const scalableScenarios = [
  clientFirstPage,
  clientSearch,
  contactImport100,
  agendaWeekFiveLocations,
  privateAvailability,
  appointmentCreate,
  inventoryFirstPage,
  inventoryDeepCursor,
  inventorySummary,
  inventoryAdjustment,
  publicCatalog,
];
~~~

Las lecturas usan 200 iteraciones/concurrencia 20. appointment-create e inventory-adjustment usan 50/concurrencia 10 y claves/recursos deterministas no conflictivos; contact-import-100 usa 10 lotes de 100. Restaurar solo los subrecursos del tenant de performance entre escrituras. Calcular fallos, solicitudes HTTP por interacción, p50, p95, bytes p95 y máximo de x-nava-query-count. Fallar si lectura p95 >300 ms, escritura crítica p95 >500 ms, página >250 KB o uno de los presupuestos SQL de la spec se excede. Para appointment-create, inventory-adjustment y public-catalog, que no tienen presupuesto numérico aprobado, exigir que el conteo SQL no supere la línea base equivalente. Afirmar además una solicitud HTTP por interacción de importación v2 frente a las hasta 101 de la línea base.

- [ ] **Step 5: Añadir EXPLAIN JSON**

explain-workflows.mjs usa EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) con valores del tenant de performance. Guardar planes sanitizados sin literales de búsqueda ni ids. Afirmar que búsquedas y cursores de tablas grandes usan Bitmap Index Scan, Index Scan o Index Only Scan sobre los índices esperados; no prohibir Sequential Scan en tablas pequeñas.

El script importa loadLocalTestDatabaseEnvironment antes de conectarse y rechaza cualquier DATABASE_URL que no sea el TEST_DATABASE_URL local validado.

- [ ] **Step 6: Comparar contra la línea base conservada**

Leer la tabla v1 capturada en Task 0 y no sobrescribirla. Ejecutar v2 contra la misma clase de fixture y concurrencia, añadir la tabla de resultados v2 y calcular reducción de p50, p95, consultas, escrituras de sesión y bytes. Si cambió el equipo, runtime o configuración, marcar la comparación como no homologable y regenerar primero ambas mediciones desde el commit base en una rama/worktree separada.

- [ ] **Step 7: Añadir scripts raíz**

~~~json
{
  "test:performance:data": "node tests/performance/api-workflows.mjs",
  "test:performance:explain": "node tests/performance/explain-workflows.mjs",
  "seed:performance": "pnpm --filter @barber-saas/api exec node scripts/seed-performance.mjs"
}
~~~

- [ ] **Step 8: Ejecutar performance**

Run:

~~~powershell
node scripts/test-database-env.mjs --start-postgres
node scripts/test-database-env.mjs --run-pnpm db:migrate:deploy
pnpm seed:performance -- --reset
pnpm --filter @barber-saas/api build
pnpm test:performance:data
pnpm test:performance:explain
~~~

Expected: todos los escenarios cumplen presupuestos; el documento contiene comparación v1/v2 y características del equipo local.

- [ ] **Step 9: Commit**

~~~bash
git add apps/api/scripts/seed-performance.mjs apps/api/scripts/seed-performance.test.mjs tests/performance/api-workflows.mjs tests/performance/explain-workflows.mjs tests/performance/api-smoke.mjs package.json
git add -f docs/testing/data-processing-performance.md
git commit -m "test(performance): cover real data workflows"
~~~

---

### Task 14: Regresión completa, documentación operativa y cierre

**Files:**

- Modify: ProyectoMD/ESTADO_PROYECTO.md
- Modify: README.md
- Modify: docs/superpowers/specs/2026-09-04-data-processing-scalability-design.md

**Interfaces:**

- Consumes: todos los entregables de Tasks 0-13.
- Produces: estado verificable, comandos de operación y evidencia final.

- [ ] **Step 1: Ejecutar verificación focalizada**

Run:

~~~powershell
node scripts/test-database-env.mjs --run-pnpm db:validate
node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/database test
node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/api test
pnpm --filter @barber-saas/mobile test
pnpm --filter @barber-saas/web test
pnpm --filter @barber-saas/api-client test
pnpm --filter @barber-saas/validation test
~~~

Expected: PASS sin tests omitidos que tengan TEST_DATABASE_URL disponible.

- [ ] **Step 2: Ejecutar calidad y compilación**

Run:

~~~powershell
pnpm lint
pnpm typecheck
pnpm build
~~~

Expected: exit 0, sin errores ni warnings nuevos.

- [ ] **Step 3: Ejecutar concurrencia crítica**

Ejecutar pruebas que intentan dos reservas simultáneas para el mismo profesional/franja y dos salidas simultáneas del último stock. Afirmar una reserva aceptada/una conflictiva y stock nunca negativo.

Run: node scripts/test-database-env.mjs --run-pnpm --filter @barber-saas/api test -- agenda-v2.integration.test.ts inventory-v2.integration.test.ts public-booking.integration.test.ts

Expected: PASS.

- [ ] **Step 4: Ejecutar compatibilidad**

Ejecutar todas las pruebas de endpoints v1 y el e2e móvil/web existente. Confirmar que rutas v1 conservan status, campos y reglas.

Run: node scripts/test-database-env.mjs --run-pnpm test:e2e

Expected: PASS con API, web y servicios locales levantados según README.

- [ ] **Step 5: Actualizar documentación**

En ESTADO_PROYECTO registrar:

- rutas v2 disponibles y consumidores migrados;
- endpoints v1 aún compatibles;
- intervalos de polling y sesión;
- índices y migración;
- resultados p50/p95/query count/bytes;
- instrucción de usar solo TEST_DATABASE_URL local;
- que producción no fue modificada.

En README enlazar docs/testing/data-processing-performance.md. Cambiar Estado de la spec a Implementado y verificado solo si todos los comandos anteriores pasan.

- [ ] **Step 6: Revisar diff y secretos**

Run:

~~~powershell
git diff --check
git status --short
git diff --stat
rg -n 'postgres(ql)?://|Bearer [A-Za-z0-9_-]+|TEST_DATABASE_URL=' docs tests apps packages --glob '!*.example'
~~~

Expected: diff check limpio; ningún secreto ni URL real añadido. Las menciones documentales de nombres de variables son aceptables; ningún valor debe aparecer.

- [ ] **Step 7: Commit final**

~~~bash
git add ProyectoMD/ESTADO_PROYECTO.md README.md docs/superpowers/specs/2026-09-04-data-processing-scalability-design.md
git commit -m "docs: record scalable data processing rollout"
~~~

- [ ] **Step 8: Preparar entrega**

Resumir commits, archivos, migración, pruebas ejecutadas, métricas antes/después, riesgos de despliegue y confirmación explícita de que no se tocó Neon de producción. No entregar comandos de producción hasta que la evidencia de migración local cumpla la política del proyecto.
