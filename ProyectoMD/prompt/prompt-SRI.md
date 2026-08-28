Quiero que actualices la documentación operativa del proyecto Nava para evitar que vuelva a ocurrir un incidente como el producido con la migración:

`20260827150000_branch_operation_scope`

Archivo objetivo:

`D:\Documentos\BarberiaSaas\ProyectoMD\ESTADO_PROYECTO.md`

## OBJETIVO

Documentar de forma permanente un protocolo obligatorio para:

* creación de nuevas migraciones Prisma/PostgreSQL;
* validación SQL antes de hacer commit;
* pruebas de migraciones sobre PostgreSQL real;
* prevención de migraciones parcialmente aplicadas;
* manejo de migraciones fallidas;
* uso correcto de Neon pooled/direct connection para operaciones de Prisma Migrate;
* despliegues posteriores en VPS;
* evitar que Codex vuelva a entregar SQL que solo fue validado sintácticamente pero no ejecutado realmente contra PostgreSQL.

Esta nueva documentación debe convertirse en parte de las reglas de **NO REGRESIÓN** del proyecto.

NO reemplaces ni elimines las reglas vigentes de despliegue que ya existen en `ESTADO_PROYECTO.md`.

Debes complementar la documentación actual.

---

# INCIDENTE QUE DEBE QUEDAR DOCUMENTADO

El 27 de agosto de 2026 ocurrió un fallo en producción con:

`packages/database/prisma/migrations/20260827150000_branch_operation_scope/migration.sql`

La migración originalmente utilizaba un patrón equivalente a:

```sql
UPDATE "organizations" AS organization
SET "primary_location_id" = location."id"
FROM LATERAL (
  SELECT "id"
  FROM "locations"
  WHERE "organization_id" = organization."id"
    AND "is_active" = true
  ORDER BY "created_at" ASC
  LIMIT 1
) AS location;
```

PostgreSQL rechazó ese SQL porque el `FROM LATERAL` utilizado desde esa posición no podía referenciar correctamente el alias de la tabla objetivo del `UPDATE`.

PostgreSQL produjo:

`42P10`

y Prisma lo reportó como:

`P3018`.

La solución fue cambiarlo a una subconsulta correlacionada:

```sql
UPDATE "organizations" AS organization
SET "primary_location_id" = (
  SELECT location."id"
  FROM "locations" AS location
  WHERE location."organization_id" = organization."id"
    AND location."is_active" = true
  ORDER BY location."created_at" ASC
  LIMIT 1
)
WHERE organization."primary_location_id" IS NULL;
```

La migración además había podido dejar parcialmente ejecutado:

```sql
ALTER TABLE "organizations"
ADD COLUMN "primary_location_id" UUID;
```

por lo que posteriormente se utilizó:

```sql
ADD COLUMN IF NOT EXISTS
```

para soportar de forma segura el estado parcial durante la recuperación.

La migración fallida fue revertida físicamente de forma controlada, después se marcó mediante:

`prisma migrate resolve --rolled-back 20260827150000_branch_operation_scope`

y finalmente Prisma volvió a ejecutarla correctamente.

El resultado final verificado fue:

* `20260827150000_branch_operation_scope`: aplicada correctamente.
* `20260827160000_local_multi_professional_limits`: aplicada correctamente.
* 76 migraciones encontradas.
* `Database schema is up to date!`
* `organizations.primary_location_id`: existente.
* `organizations_primary_location_id_idx`: existente.
* `cash_register_sessions_open_location_unique`: existente.

El registro histórico correcto de `_prisma_migrations` conserva:

1. primer intento de `150000` fallido y posteriormente marcado `rolled_back`;
2. segundo intento de `150000` finalizado correctamente;
3. `160000` finalizado correctamente.

NO se debe eliminar ese historial.

---

# SEGUNDO INCIDENTE: PRISMA / NEON ADVISORY LOCK

Durante la recuperación también apareció:

`P1002`

con el mensaje de timeout intentando obtener:

`pg_advisory_lock(72707369)`.

La conexión utilizada inicialmente era la pooled de Neon:

`*-pooler.*.neon.tech`

Se encontró una sesión PgBouncer `idle` reteniendo el advisory lock.

Para la recuperación se utilizó temporalmente la conexión directa de Neon:

`*.neon.tech`

sin `-pooler`.

Con ella se pudo:

* inspeccionar `_prisma_migrations`;
* inspeccionar el esquema PostgreSQL;
* identificar el advisory lock;
* liberar exclusivamente la sesión idle que retenía el lock;
* ejecutar `prisma migrate resolve`;
* ejecutar `prisma migrate deploy`;
* comprobar `prisma migrate status`.

Esto debe quedar documentado como antecedente operativo.

No cambies automáticamente la arquitectura existente ni agregues `DIRECT_URL` al proyecto sin analizar previamente `packages/database/prisma.config.ts`.

La documentación vigente indica que actualmente la configuración Prisma utiliza `DATABASE_URL`.

Si propones una mejora permanente para separar conexión runtime pooled y conexión administrativa/directa, debes dejarla únicamente como una **mejora recomendada pendiente de implementación**, salvo que el repositorio ya tenga soporte explícito para ella.

No modifiques código como parte de esta tarea.

---

# NUEVA POLÍTICA OBLIGATORIA DE MIGRACIONES

Agrega una sección clara, visible y prioritaria denominada aproximadamente:

## SEGURIDAD DE MIGRACIONES PRISMA/POSTGRESQL — NO REGRESIONAR

Debe establecer como mínimo las siguientes reglas.

### 1. Ninguna migración SQL se considera válida solo porque Prisma la genere o porque el archivo tenga sintaxis aparentemente correcta

Antes de hacer commit de una nueva migración que contenga SQL manual, DDL no trivial, UPDATE, DELETE, backfill, índice parcial, constraint, subquery, CTE, LATERAL, trigger o modificación de datos:

DEBE ejecutarse realmente contra PostgreSQL.

No aceptar únicamente:

* lectura visual;
* `prisma validate`;
* typecheck;
* lint;
* razonamiento teórico sobre SQL.

El SQL debe ejecutarse.

### 2. Prueba obligatoria en PostgreSQL real

Toda migración nueva debe probarse al menos en:

#### A. Base vacía

Crear una PostgreSQL temporal/aislada y ejecutar toda la cadena:

`prisma migrate deploy`

desde la primera migración hasta la última.

El objetivo es detectar:

* SQL incompatible;
* referencias inexistentes;
* orden incorrecto;
* constraints inválidas;
* errores de PostgreSQL;
* incompatibilidades entre migraciones históricas y nuevas.

La prueba completa debe terminar sin migraciones fallidas.

#### B. Estado inmediatamente anterior

También debe probarse la nueva migración sobre una base que represente exactamente el esquema productivo anterior a la migración.

No basta solamente con probar una base vacía.

### 3. Pruebas específicas para migraciones con transformación de datos

Si una migración contiene:

* UPDATE;
* INSERT;
* DELETE;
* backfill;
* selección de registro primario;
* migración de relaciones;
* deduplicación;
* modificación de claves;
* creación de índices UNIQUE;
* cambios de ownership/scope;
* movimientos entre organizaciones/sucursales;

Codex debe crear datos representativos antes de ejecutarla.

Validar al menos:

* cero registros;
* un registro;
* varios registros;
* registros ya configurados;
* registros NULL;
* datos que no deben sobrescribirse;
* organizaciones sin relaciones relacionadas;
* duplicados cuando una restricción UNIQUE pueda verse afectada.

Para `branch_operation_scope`, por ejemplo, debían haberse probado:

* organización con una sola sede activa;
* organización con varias sedes activas;
* organización con `primary_location_id` ya establecido;
* organización sin sede activa.

### 4. SQL PostgreSQL avanzado requiere prueba de ejecución

Cuando se utilicen construcciones como:

* `UPDATE ... FROM`;
* `LATERAL`;
* correlated subqueries;
* CTE;
* `ON CONFLICT`;
* partial indexes;
* expression indexes;
* exclusion constraints;
* funciones PostgreSQL;
* JSONB;
* casts;
* ventanas;
* locks;

Codex NO debe asumir que una construcción permitida en un `SELECT` será válida dentro de `UPDATE`, `DELETE` u otro contexto.

Debe ejecutar un caso mínimo reproducible en PostgreSQL antes del commit.

El incidente `42P10` debe citarse como ejemplo de por qué esta regla existe.

### 5. Analizar comportamiento ante aplicación parcial

Antes de aprobar una migración con varias sentencias, revisar qué ocurriría si falla después de la primera, segunda o una sentencia posterior.

Clasificar:

* qué objetos podrían quedar creados;
* qué datos podrían quedar modificados;
* qué sentencias serían seguras de reintentar;
* cuáles producirían `already exists`;
* qué necesitaría rollback.

Usar `IF NOT EXISTS` o equivalentes solamente cuando:

* mantengan la semántica correcta;
* no oculten una diferencia peligrosa de esquema;
* exista una razón explícita para soportar reintentos.

NO convertir todas las migraciones indiscriminadamente en idempotentes.

### 6. Transacciones

Analizar si una migración compleja debe ejecutarse dentro de una transacción PostgreSQL.

No agregar `BEGIN/COMMIT` de forma automática.

Antes debe comprobarse:

* que todas las operaciones involucradas sean adecuadas para una transacción;
* duración esperada;
* locks;
* tamaño de tablas;
* impacto en producción.

La decisión debe quedar justificada para migraciones de riesgo alto.

### 7. No modificar migraciones aplicadas exitosamente

Regla absoluta:

Una migración que ya figura como aplicada correctamente en un entorno persistente no debe editarse retrospectivamente.

Si se necesita modificar el esquema después:

crear una migración nueva.

Única excepción operacional:

si una migración acaba de fallar y NO fue aplicada exitosamente, debe inspeccionarse:

* `_prisma_migrations`;
* `finished_at`;
* `rolled_back_at`;
* `logs`;
* esquema físico;

antes de decidir cómo corregirla.

No modificar una migración fallida a ciegas.

### 8. Ante P3018

Si aparece `P3018`:

DETENER el despliegue.

No ejecutar inmediatamente:

* otro `migrate deploy`;
* migraciones posteriores;
* DROP arbitrarios;
* modificación manual de `_prisma_migrations`.

Primero obtener evidencia de:

```sql
SELECT
  migration_name,
  started_at,
  finished_at,
  rolled_back_at,
  applied_steps_count,
  logs
FROM "_prisma_migrations"
ORDER BY started_at DESC;
```

Después inspeccionar físicamente los objetos que la migración pretendía crear/modificar.

Solo después definir recuperación.

### 9. Ante P1002

Si Prisma devuelve `P1002` por advisory lock:

NO repetir indefinidamente `migrate deploy`.

Primero:

* ejecutar `prisma migrate status`;
* identificar si realmente existen migraciones pendientes;
* inspeccionar advisory locks;
* comprobar si la conexión utilizada es pooled/PgBouncer;
* revisar si existe un proceso Prisma real todavía trabajando.

No matar procesos PostgreSQL indiscriminadamente.

Solo liberar una sesión cuando exista evidencia de que:

* mantiene el advisory lock de Prisma;
* está abandonada/idle;
* no corresponde a una migración legítima en ejecución.

### 10. Neon pooled vs conexión directa

Documentar explícitamente el antecedente:

La aplicación utiliza Neon y puede conectarse mediante endpoint pooled.

Las operaciones administrativas de Prisma pueden requerir conexión directa cuando existan problemas de advisory locks/session state.

No introducir una URL directa permanentemente sin aprobación de arquitectura.

No imprimir:

* DATABASE_URL;
* usuario;
* contraseña;
* tokens;
* secretos.

Si se deriva temporalmente una URL directa desde la pooled, nunca mostrar su contenido completo en consola/documentación.

### 11. No utilizar `source /etc/nava/api.env`

Mantener la regla existente:

`/etc/nava/api.env` no debe ejecutarse mediante:

```bash
source /etc/nava/api.env
```

ni:

```bash
. /etc/nava/api.env
```

Los valores pueden contener caracteres especiales y secretos.

Cualquier lectura puntual debe hacerse de forma segura sin imprimir valores.

### 12. Gate obligatorio antes de commit

Antes de entregar una migración, Codex debe ejecutar los comandos realmente disponibles en el repositorio para:

* validar Prisma;
* ejecutar la migración en PostgreSQL real;
* aplicar toda la cadena desde base vacía;
* ejecutar pruebas del paquete database;
* typecheck relacionado;
* pruebas específicas de la funcionalidad modificada.

NO inventes nombres de scripts.

Inspecciona `package.json` raíz y los `package.json` relevantes y documenta los comandos reales disponibles actualmente.

Como antecedente, durante este incidente se verificaron exitosamente comandos equivalentes a:

* `pnpm db:migrate:deploy`
* `pnpm db:validate`
* pruebas de `@barber-saas/database`
* typecheck de `@barber-saas/database`

Pero debes comprobar el repositorio actual antes de escribir el runbook definitivo.

### 13. Evidencia mínima que Codex debe entregar

Cuando cree una migración nueva, su respuesta final debe incluir obligatoriamente:

1. nombre de migración;
2. tablas/columnas/índices afectados;
3. motivo;
4. riesgo;
5. datos modificados;
6. comportamiento ante registros existentes;
7. comportamiento ante NULL;
8. comportamiento ante reintento;
9. si puede quedar parcialmente aplicada;
10. rollback propuesto;
11. pruebas PostgreSQL ejecutadas;
12. prueba de cadena completa;
13. resultado de `prisma migrate status`;
14. tests ejecutados;
15. confirmación explícita de que NO se tocó producción.

Si alguno no fue probado:

debe indicarse como pendiente y NO afirmar que la migración está lista para producción.

### 14. Gate obligatorio antes de producción

Antes de desplegar cualquier migración en VPS:

1. confirmar commit exacto;
2. `git status` limpio;
3. backup acorde al riesgo;
4. `pnpm db:status`;
5. comprobar migraciones pendientes;
6. revisar SQL de cada migración pendiente;
7. comprobar que fue ejecutada previamente contra PostgreSQL real;
8. aplicar migraciones;
9. volver a ejecutar `db:status`;
10. comprobar objetos críticos creados;
11. recién entonces continuar con build/reinicio.

Respetar además las reglas existentes:

* `pnpm env:check:production`;
* `pnpm build:production`;
* reinicio controlado de API/Web/Admin;
* healthchecks;
* puertos;
* HTTP;
* `nginx -t`.

No sustituir el runbook vigente por comandos antiguos.

---

# CLASIFICACIÓN DE RIESGO DE MIGRACIONES

Agrega una tabla breve:

### BAJO

Ejemplo:

* índice no unique sobre columna existente;
* columna nullable sin backfill;
* cambios puramente aditivos simples.

### MEDIO

Ejemplo:

* UPDATE/backfill;
* foreign keys;
* índice parcial;
* modificación de defaults;
* cambio de relaciones.

### ALTO

Ejemplo:

* UNIQUE sobre datos existentes;
* DROP;
* NOT NULL con datos existentes;
* migración de relaciones;
* cambio masivo de filas;
* operaciones de caja/pagos/suscripciones;
* cambios multi-tenant;
* migraciones que puedan bloquear tablas importantes.

Para MEDIO y ALTO exigir pruebas PostgreSQL específicas.

Para ALTO exigir además estrategia de rollback y revisión explícita antes de producción.

---

# CHECKLIST PARA CODEX

Agrega una checklist reutilizable aproximadamente así:

```text
[ ] Revisé el estado actual del schema.prisma.
[ ] Revisé las migraciones anteriores relacionadas.
[ ] No estoy editando una migración aplicada exitosamente.
[ ] Ejecuté el SQL contra PostgreSQL real.
[ ] Probé la migración sobre el esquema inmediatamente anterior.
[ ] Probé la cadena completa desde una BD vacía.
[ ] Probé datos representativos y casos límite.
[ ] Revisé si puede quedar parcialmente aplicada.
[ ] Definí comportamiento de reintento.
[ ] Definí rollback.
[ ] Ejecuté prisma validate.
[ ] Ejecuté las pruebas relacionadas.
[ ] Ejecuté typecheck relacionado.
[ ] Confirmé prisma migrate status.
[ ] No utilicé producción para probar.
[ ] No expuse DATABASE_URL ni secretos.
```

Una migración no debe marcarse como lista para producción si alguna casilla crítica continúa pendiente.

---

# REGLA DE COMPORTAMIENTO PARA FUTURAS TAREAS DE CODEX

Documenta expresamente:

Cuando en una tarea futura se solicite crear o modificar Prisma schema, tablas, índices, relaciones o SQL de migración:

Codex debe leer primero esta sección de `ESTADO_PROYECTO.md`.

Estas reglas prevalecen sobre instrucciones genéricas de “crear la migración y dar comandos para VPS”.

Codex NO debe entregar directamente comandos de producción hasta haber completado y reportado las pruebas de migración requeridas.

Si descubre que una migración puede ser riesgosa:

debe detener el paso a producción, explicar el riesgo y preparar primero las pruebas/recuperación necesarias.

---

# ACTUALIZACIÓN DEL INCIDENTE

Agrega también al estado operativo del 27 de agosto de 2026 una nota breve indicando que el incidente quedó RESUELTO.

Debe dejar constancia de:

* commit corregido: `798e6c2 fix(database): repair branch operation migration`;
* fallo original PostgreSQL `42P10` / Prisma `P3018`;
* recuperación de estado parcial;
* Prisma `migrate resolve --rolled-back`;
* advisory lock/P1002 encontrado posteriormente;
* recuperación mediante conexión directa Neon;
* ejecución exitosa de:

  * `20260827150000_branch_operation_scope`
  * `20260827160000_local_multi_professional_limits`;
* `76 migrations found`;
* `Database schema is up to date!`;
* verificación positiva de:

  * `organizations.primary_location_id`;
  * `organizations_primary_location_id_idx`;
  * `cash_register_sessions_open_location_unique`.

No incluyas:

* DATABASE_URL;
* host completo si contiene información sensible;
* contraseñas;
* tokens;
* secretos;
* PID histórico salvo que sea estrictamente necesario, preferiblemente omitirlo.

---

# MUY IMPORTANTE

No realices cambios funcionales de código.

No crees migraciones.

No ejecutes operaciones contra producción.

Esta tarea es exclusivamente documental.

Antes de modificar:

`D:\Documentos\BarberiaSaas\ProyectoMD\ESTADO_PROYECTO.md`

lee completamente su sección inicial de:

* Estado validado de producción;
* Base de datos, Prisma y migraciones;
* REGLAS DE DESPLIEGUE — NO REGRESIONAR.

Integra esta nueva política sin contradecirlas.

Si encuentras información antigua dentro del documento que contradiga el estado validado del 27 de agosto de 2026, NO restaures procedimientos antiguos.

La sección inicial vigente continúa siendo la fuente de verdad.

Al terminar:

1. muéstrame exactamente qué secciones agregaste o modificaste;
2. indícame dónde quedaron dentro de `ESTADO_PROYECTO.md`;
3. confirma que no eliminaste las reglas vigentes;
4. confirma que no introdujiste secretos;
5. ejecuta `git diff --check`;
6. muéstrame un resumen de `git diff -- ProyectoMD/ESTADO_PROYECTO.md`;
7. NO hagas commit automáticamente.
