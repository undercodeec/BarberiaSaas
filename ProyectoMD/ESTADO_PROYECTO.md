# Estado actual del proyecto Nava

## Actualización operativa — 26 de agosto de 2026

- El ciclo horario de suscripciones conserva snapshots IANA en facturas y
  eventos, usa períodos de 30 días UTC, una gracia auditable de 72 horas y
  formato administrativo/comunicaciones en la zona del negocio.
- Las migraciones `20260826170000_subscription_time_audit`,
  `20260826180000_registration_timezone` y
  `20260826190000_ensure_registration_timezone` deben aplicarse antes de
  desplegar estos cambios.
- Las integraciones PostgreSQL deben usar únicamente la base local de pruebas;
  no se debe compensar la latencia remota usando producción.

## Recibos temporales de pago — implementación local pendiente de despliegue

Como transición hasta contar con facturación electrónica SRI operativa en
producción, los pagos de suscripción con estado `APPLIED` generan de forma
idempotente un **Comprobante temporal de pago**. El documento se conserva como
PDF con huella SHA-256, se entrega mediante la cola SMTP con reintentos y puede
ser descargado o reenviado únicamente por el propietario de la organización.
El PDF y el correo HTML incorporan el logo oficial, detalle de plan, importe,
vigencia, renovación manual, referencias de pago y el enlace a las políticas.

No sustituye una factura electrónica autorizada: no se etiqueta como factura o
RIDE, no utiliza numeración fiscal SRI y no se debe ofrecer como soporte de
crédito tributario. La transición se detiene automáticamente para nuevos pagos
solo cuando estén activas a la vez `SRI_EMISSION_ENABLED=true`,
`SRI_ENV=production` y `SRI_PRODUCTION_ENABLED=true`.

La migración `20260827200000_subscription_payment_receipts` crea el registro
comercial separado de `sri_invoices`. Requiere la validación de migraciones de
alto riesgo, prueba SMTP real y compra controlada antes del despliegue.

El mismo corte reconcilia `billing_timezone` y `provider_paid_at` ya exigidos
por el esquema de suscripciones, evitando que un checkout falle al persistir la
factura comercial y su cambio de plan.

## Estado validado de producción — 27 de agosto de 2026

Esta sección es la fuente de verdad operativa para producción y prevalece sobre
cualquier corte histórico del resto del documento.

### Topología, servicios y verificación

- `api.navacloud.app` → Nginx → `127.0.0.1:4000` → `nava-api`.
- `reservas.navacloud.app` → Nginx → `127.0.0.1:3000` → `nava-web`.
- `admin.navacloud.app` → Nginx → puerto `3001` → `nava-admin`.
- Los tres servicios están activos y `nginx -t` es válido. Web y Admin deben
  responder HTTP `200`; que la raíz `/` de la API responda `404` es normal y
  no representa una falla del servicio.

### Configuración de frontend y servicios

- La única configuración canónica de frontend en producción es
  `/etc/nava/frontend.env`, con
  `NEXT_PUBLIC_API_URL=https://api.navacloud.app`.
- `apps/web/.env.production` y `apps/admin/.env.production` son mecanismos
  obsoletos para producción; no deben crearse, versionarse ni usarse como
  fuente de variables productivas.
- Web usa el override
  `/etc/systemd/system/nava-web.service.d/override.conf`:

  ```ini
  [Service]
  EnvironmentFile=
  EnvironmentFile=/etc/nava/frontend.env
  ```

- No se debe modificar Admin solo para que imite a Web: sus `EnvironmentFile`
  pueden estar vacíos si `nava-admin` continúa funcional con su configuración
  actual.
- Para la API, `/etc/nava/api.env` es un archivo dotenv de systemd. No se debe
  ejecutar `source /etc/nava/api.env` ni `. /etc/nava/api.env` en Bash; los
  valores deben inspeccionarse o cargarse mediante systemd, sin interpretar
  caracteres especiales de secretos como sintaxis de shell.

### Base de datos, Prisma y migraciones

- La conexión Prisma/Neon se define únicamente mediante `DATABASE_URL` en
  `packages/database/prisma.config.ts`; `DIRECT_URL` no forma parte de la
  configuración vigente.
- El estado validado posterior a la recuperación del 27 de agosto reporta
  **76 migraciones** y `Database schema is up to date!`.
- `P1002` durante el despliegue indica bloqueo de advisory lock: primero se
  debe ejecutar `pnpm db:status`. Si no hay migraciones pendientes, no se debe
  reintentar indefinidamente ni ejecutar `pnpm db:migrate:deploy`.
- `pnpm db:migrate:deploy` se ejecuta solo cuando `pnpm db:status` informa
  migraciones pendientes. Después se repite `pnpm db:status` para confirmar el
  resultado.

### PostgreSQL local exclusivo para pruebas

Las pruebas SQL y las integraciones PostgreSQL deben ejecutarse únicamente
contra la instancia local de pruebas. Neon es exclusivo de producción y no se
debe usar para pruebas, migraciones locales ni desarrollo.

- La configuración local se carga desde `D:\Documentos\BarberiaSaas\.env`.
- `TEST_DATABASE_URL` debe apuntar a `barber_saas_test` en `127.0.0.1:5433`.
- No copiar secretos del `.env` a este documento, logs ni commits.

Con Docker Desktop, iniciar el servicio local de pruebas:

```powershell
Set-Location D:\Documentos\BarberiaSaas
docker compose up -d postgres-test
pnpm --filter @barber-saas/database db:generate
```

Antes de migrar, cargar en la sesión el valor existente en el `.env` local,
sin imprimirlo. Prisma usa `DATABASE_URL`, mientras las integraciones validan
`TEST_DATABASE_URL`:

```powershell
$env:TEST_DATABASE_URL = (Get-Content .env |
  Where-Object { $_ -match '^TEST_DATABASE_URL=' } |
  ForEach-Object { $_ -replace '^TEST_DATABASE_URL=', '' }).Trim('"')
$env:DATABASE_URL = $env:TEST_DATABASE_URL
pnpm db:migrate:deploy
```

Ejecutar las integraciones PostgreSQL:

```powershell
pnpm --filter @barber-saas/api test -- app.integration.test.ts
pnpm --filter @barber-saas/api test -- public-booking.integration.test.ts
```

Si `TEST_DATABASE_URL` no existe, apunta a Neon, usa un puerto distinto de
`5433` o no contiene `barber_saas_test`, detenerse y corregir el `.env` local.
Nunca continuar apuntando a producción.

```powershell
docker compose ps postgres-test
pnpm db:status
```

Al terminar, detener la instancia local si no se necesita:

```powershell
docker compose stop postgres-test
```

## REGLAS DE DESPLIEGUE — NO REGRESIONAR

1. Usar exclusivamente `/opt/nava/app` y actualizar con
   `git pull --ff-only origin main`.
2. Ejecutar `pnpm install --frozen-lockfile`, comprobar migraciones con
   `pnpm db:status` y aplicar `pnpm db:migrate:deploy` solo si hay pendientes.
3. Tras una migración aplicada, repetir `pnpm db:status`; ante `P1002`,
   comprobar ese estado antes de cualquier nuevo intento.
4. Validar variables y compilar con `pnpm env:check:production` y
   `pnpm build:production`. No sustituir estos comandos por builds que lean
   `.env.production` dentro de las aplicaciones.
5. Recargar systemd y reiniciar los tres servicios. Verificar estado, puertos,
   HTTP y Nginx antes de considerar terminado el despliegue.

```bash
cd /opt/nava/app
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm db:status
# Ejecutar solo si el estado informa migraciones pendientes.
pnpm db:migrate:deploy
pnpm db:status
pnpm env:check:production
pnpm build:production
sudo systemctl daemon-reload
sudo systemctl restart nava-api
sudo systemctl restart nava-web
sudo systemctl restart nava-admin
sudo systemctl status nava-api nava-web nava-admin --no-pager
sudo ss -ltnp | grep -E ':4000|:3000|:3001'
curl -fsS https://reservas.navacloud.app/
curl -fsS https://admin.navacloud.app/
curl -i https://api.navacloud.app/
sudo nginx -t
```

Resultados esperados: Web y Admin devuelven `200`; API puede devolver `404`
en `/`; los tres servicios deben permanecer `active (running)`.

## SEGURIDAD DE MIGRACIONES PRISMA/POSTGRESQL — NO REGRESIONAR

Esta política es obligatoria para cualquier cambio de `schema.prisma`, tabla,
índice, relación o SQL de migración. Prevalece sobre una instrucción genérica
de «crear la migración y dar comandos para VPS». Codex debe leerla antes de
empezar esa clase de tarea y no debe proponer despliegue hasta completar y
reportar las pruebas requeridas.

### Incidente resuelto — 27 de agosto de 2026

- `20260827150000_branch_operation_scope` falló inicialmente con PostgreSQL
  `42P10`, reportado por Prisma como `P3018`: su `UPDATE ... FROM LATERAL`
  referenciaba el alias objetivo de `organizations` desde una posición no
  permitida.
- El commit `798e6c2 fix(database): repair branch operation migration` usa una
  subconsulta correlacionada y conserva el criterio de primera sede activa por
  `created_at ASC`, sin sobrescribir una sede primaria ya definida.
- La inspección evidenció estado parcial: podía existir
  `organizations.primary_location_id` aunque no se hubieran ejecutado el
  `UPDATE` ni los índices posteriores. `ADD COLUMN IF NOT EXISTS` se añadió
  solo para soportar este reintento seguro; no se usa indiscriminadamente.
- La recuperación física controlada fue seguida por
  `prisma migrate resolve --rolled-back 20260827150000_branch_operation_scope`
  y una nueva ejecución correcta. El historial de `_prisma_migrations` debe
  conservar el primer intento fallido/rolled back, el segundo terminado y la
  posterior `20260827160000_local_multi_professional_limits`; nunca se borra ni
  se modifica manualmente.
- También apareció `P1002`: una sesión idle de PgBouncer en el endpoint pooled
  de Neon retenía el advisory lock de Prisma. La inspección y recuperación se
  hicieron temporalmente mediante conexión directa de Neon, sin revelar URL ni
  credenciales y liberando solo la sesión idle identificada.
- Resultado verificado: están aplicadas `20260827150000_branch_operation_scope`
  y `20260827160000_local_multi_professional_limits`; existen
  `organizations.primary_location_id`,
  `organizations_primary_location_id_idx` y
  `cash_register_sessions_open_location_unique`.

### Validación obligatoria antes de commit

1. Una migración SQL no es válida solo porque Prisma la genere, `prisma
   validate`, typecheck, lint o revisión visual no fallen. Todo SQL manual,
   DDL no trivial, `UPDATE`, `DELETE`, backfill, constraint, índice parcial,
   CTE, `LATERAL`, trigger o transformación de datos debe ejecutarse realmente
   contra PostgreSQL.
2. Crear una PostgreSQL temporal y aislada y ejecutar la cadena completa desde
   cero con `pnpm db:migrate:deploy`. Debe terminar sin migraciones fallidas.
   Esto detecta orden incorrecto, referencias inexistentes e incompatibilidades
   históricas que `prisma validate` no ejecuta.
3. Probar también sobre el estado inmediatamente anterior a la nueva migración;
   una base vacía por sí sola no basta. En migraciones de datos crear fixtures
   con cero, uno y varios registros; `NULL`; relaciones ausentes; valores ya
   configurados que no se deban sobrescribir; y duplicados si afecta `UNIQUE`.
4. Para `UPDATE ... FROM`, `LATERAL`, subconsultas correlacionadas, CTE,
   `ON CONFLICT`, índices parciales/de expresión, JSONB, casts, ventanas,
   funciones o locks, ejecutar primero un caso mínimo reproducible en
   PostgreSQL. Algo válido en `SELECT` no se presume válido en `UPDATE` o
   `DELETE`: el incidente `42P10` es el antecedente.
5. Antes de aprobar una migración de varias sentencias, documentar qué objetos
   o datos podrían quedar aplicados tras cada paso, qué es reintentable, qué
   produciría `already exists` y qué rollback requiere. Usar `IF NOT EXISTS`
   solo si preserva la semántica y existe una razón explícita de recuperación.
6. Analizar si una migración compleja requiere transacción PostgreSQL. No añadir
   `BEGIN/COMMIT` automáticamente: justificar operaciones, duración, locks,
   tamaño de tablas e impacto de producción, especialmente en riesgo alto.
7. Nunca editar una migración aplicada correctamente en un entorno persistente:
   crear otra. Una migración recién fallida solo se corrige después de revisar
   `_prisma_migrations`, `finished_at`, `rolled_back_at`, `logs` y el esquema
   físico; nunca a ciegas.

### Pruebas de transformaciones y clasificación de riesgo

Una migración con selección de primario, relaciones, backfill, deduplicación,
claves, índices `UNIQUE`, ownership/scope o datos multi-tenant requiere
aserciones de resultado. Para `branch_operation_scope`: una sede activa,
varias activas, `primary_location_id` ya establecido y ninguna sede activa.

| Riesgo | Ejemplos | Requisito mínimo |
| --- | --- | --- |
| Bajo | índice no `UNIQUE`, columna nullable sin backfill, adición simple | cadena completa en PostgreSQL y validaciones relacionadas |
| Medio | `UPDATE`/backfill, foreign key, índice parcial, default o relación | pruebas PostgreSQL específicas sobre estado anterior y fixtures |
| Alto | `UNIQUE` con datos, `DROP`, `NOT NULL`, relación masiva, caja/pagos/suscripciones, multi-tenant o locks importantes | requisitos de medio, rollback documentado y revisión explícita antes de producción |

Para MEDIO y ALTO se exigen pruebas PostgreSQL específicas. Para ALTO, además,
estrategia de rollback y revisión explícita antes de producción.

### Manejo de P3018, P1002, Neon y secretos

Ante `P3018`, detener el despliegue. No reintentar `migrate deploy`, aplicar
migraciones posteriores, hacer `DROP` arbitrarios ni modificar manualmente
`_prisma_migrations`. Primero obtener evidencia:

```sql
SELECT migration_name, started_at, finished_at, rolled_back_at,
       applied_steps_count, logs
FROM "_prisma_migrations"
ORDER BY started_at DESC;
```

Después inspeccionar los objetos físicos y datos afectados. Solo entonces se
define, ensaya en una base aislada y aprueba la recuperación. `migrate resolve`
es una acción de recuperación, no un atajo: se usa únicamente tras inspección
del estado físico e historial y con procedimiento aprobado.

Ante `P1002` por advisory lock, no repetir `migrate deploy` indefinidamente.
Ejecutar `pnpm db:status`, confirmar pendientes, inspeccionar locks y sesiones,
comprobar pooled/PgBouncer y verificar que no exista una migración legítima en
curso. Solo liberar una sesión con evidencia de que retiene el lock de Prisma y
está abandonada/idle; nunca terminar sesiones indiscriminadamente.

`packages/database/prisma.config.ts` usa solo `DATABASE_URL`. No agregar
`DIRECT_URL` ni cambiar arquitectura sin decisión previa. Una conexión directa
de Neon puede ser necesaria temporalmente para una recuperación administrativa,
pero no se imprime URL, usuario, contraseña, token ni secreto. Separar de forma
permanente runtime pooled y administración directa es una mejora recomendada
pendiente de análisis arquitectónico, no una implementación autorizada.

Se mantiene la regla: nunca ejecutar `source /etc/nava/api.env` ni
`. /etc/nava/api.env`; los valores pueden tener caracteres especiales y deben
leerse puntualmente sin imprimirlos.

### Gate antes de producción y evidencia de entrega

Antes de migrar en VPS: confirmar commit exacto y `git status` limpio; hacer
backup proporcional al riesgo; ejecutar `pnpm db:status`; revisar SQL y
evidencia PostgreSQL previa de cada pendiente; aplicar solo las pendientes;
repetir `pnpm db:status`; verificar objetos críticos; y solo después continuar
con las **REGLAS DE DESPLIEGUE — NO REGRESIONAR**: `pnpm
env:check:production`, `pnpm build:production`, reinicios, healthchecks,
puertos, HTTP y `nginx -t`.

Los comandos reales disponibles para el gate local son:

```bash
pnpm db:validate
pnpm db:migrate:deploy
pnpm db:status
pnpm --filter @barber-saas/database test
pnpm --filter @barber-saas/database typecheck
```

La entrega de Codex para una migración debe incluir: nombre; tablas, columnas e
índices afectados; motivo; riesgo; datos modificados; tratamiento de existentes,
`NULL` y reintentos; posibilidad de aplicación parcial; rollback; pruebas
PostgreSQL y cadena completa; `prisma migrate status`; tests ejecutados; y
confirmación de que no se tocó producción. Sin evidencia crítica, no está lista
para producción ni se entregan comandos de VPS.

### Checklist reutilizable para Codex

```text
[ ] Revisé schema.prisma y migraciones relacionadas.
[ ] No estoy editando una migración aplicada exitosamente.
[ ] Ejecuté SQL contra PostgreSQL real y sobre el estado inmediatamente anterior.
[ ] Probé la cadena completa desde una BD vacía.
[ ] Probé fixtures, casos límite, NULL y no sobrescritura.
[ ] Revisé aplicación parcial, reintento y rollback.
[ ] Ejecuté prisma validate, tests y typecheck relacionados.
[ ] Confirmé prisma migrate status.
[ ] No usé producción para probar ni expuse DATABASE_URL o secretos.
```

Una migración no se marca lista para producción mientras una casilla crítica
permanezca pendiente.

> Corte de auditoría: **19 de agosto de 2026**
>
> Rama revisada: `main` (`5a8332c`)
>
> Alcance: código, esquema Prisma, 71 migraciones, configuración, aplicaciones,
> pruebas, builds, documentación y estado de Git.
>
> Estado global: **MVP funcional para piloto controlado, todavía no listo para
> declararse producción estable**.

> Actualización del panel Admin: **26 de agosto de 2026**. El panel está
> publicado en `https://admin.navacloud.app` desde el 21 de agosto de 2026,
> con `nava-admin.service`, HTTPS y el commit `0ead479` verificados entonces.
> El `HEAD` local actual (`457cb26`) es posterior a aquel despliegue e incluye
> avances de Administración de Usuarios y Memberships que todavía requieren
> validación y publicación controlada; no se deben asumir en producción.

> Actualización de políticas y suscripciones: **23 de agosto de 2026**. Esta
> actualización complementa el corte histórico: las reglas vigentes de negocio
> se definen en `Politicas_y_terminos_Nava.md` cuando exista contradicción.

> Corte de implementación de políticas (23 de agosto de 2026): trial de 10
> días, gracia de 3 días exclusiva de planes pagados, recordatorio de renovación
> a 5 días, código fundador, consentimiento de privacidad, opt-in de marketing,
> exportación de cierre CSV/ZIP y control de cookies están implementados
> localmente y requieren desplegar sus migraciones y configuración productiva
> antes de declararlos operativos.

> Actualización de privacidad de clientes: **26 de agosto de 2026**. El commit
> `8c0eeec` implementa y valida la restricción de datos de clientes por rol en
> API y Mobile. No requiere migración de base de datos; sí requiere desplegar
> API y Mobile conjuntamente para que los controles de servidor y la interfaz
> correspondan al mismo modelo de acceso.

> Actualización de asignaciones y ciclo de vida de sucursales: **27 de agosto
> de 2026**. La integración quedó completa en código con el commit `5504e7e`:
> API, Mobile y Web pública aplican las asignaciones por sucursal, el archivo
> reversible de sucursales y el selector público de sucursal. No requiere una
> migración nueva, pero API, Mobile y Web deben desplegarse conjuntamente antes
> de considerarla operativa en producción.

### Cierre de PayPhone Botón WEB en suscripciones (25 de agosto de 2026)

- [x] La web comercial está publicada en `https://navacloud.app`, con TLS
      válido. El flujo de planes conserva la selección tras registro/login,
      crea el negocio inicial y dirige al checkout autenticado.
- [x] API Link dejó de ser el mecanismo de suscripciones. El checkout prepara
      el pago con `POST /api/button/Prepare` y el retorno activa el flujo de
      confirmación servidor-a-servidor con `POST /api/button/V2/Confirm`.
- [x] El redirect, parámetros de URL y `POST /v1/webhooks/payphone/platform`
      no pueden activar una suscripción. El webhook solo registra un evento
      auxiliar de auditoría; Confirm autenticado valida la transacción y aplica
      el entitlement idempotentemente.
- [x] Se creó y aprovisionó una aplicación PayPhone Developer de tipo **WEB** para
      `https://navacloud.app`, con respuesta
      `https://navacloud.app/checkout/payphone/confirm`. Su Token y StoreId
      WEB quedaron cifrados con `payphone:platform:configure`; la configuración
      anterior de tipo API sigue separada y no se reutiliza.
- [x] Se completó y validó la compra sandbox: `Prepare`, redirección, `Confirm`,
      factura `PAID`, intento `APPLIED`, suscripción `ACTIVE` e idempotencia de
      refresh. La allowlist `PLATFORM_PAYPHONE_WEBHOOK_ALLOWED_IPS` sigue como
      control opcional de auditoría, no como autoridad de pago.
- [ ] Producción exige credenciales WEB propias, validación controlada y
      autorización operativa independientes; no se infiere de la prueba sandbox.

### Validación del corte de políticas (23 de agosto de 2026)

- [x] `pnpm typecheck`: 17 tareas correctas en 12 paquetes.
- [x] `pnpm --filter @barber-saas/validation test`: 25 pruebas aprobadas.
- [x] `pnpm --filter @barber-saas/web build`: incluye la ruta estática
      `/tratamiento-de-datos`.
- [x] `pnpm test:e2e`: 6/6 escenarios aprobados en Chromium móvil y escritorio,
      incluidos banner de cookies y página pública de privacidad.
- [x] En la VPS (24 de agosto) se aplicaron `20260823150000_privacy_consent` y
      las migraciones de suscripciones pendientes. Los valores
      `PLATFORM_PRIVACY_POLICY_VERSION`, `PLATFORM_MARKETING_POLICY_VERSION` y,
      si se usa analítica, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, requieren revisión
      operativa antes de declararlos públicos.
- [~] El módulo propio de facturación SRI está desplegado en TEST con migraciones
  y validación XSD local. Siguen pendientes la comprobación del certificado
  `.p12` como usuario de servicio, los datos fiscales definitivos, la
  homologación SRI y la prueba SMTP real. PayPhone productivo, backups 30/90
  y ensayo de restauración tampoco se pueden certificar desde el repositorio.

### Actualización de despliegue SRI TEST (24 de agosto de 2026)

- [x] Se desplegó `main` en la VPS (`/opt/nava/app`) y se aplicaron las nueve
      migraciones pendientes, incluidas `20260823180000_sri_electronic_invoicing`
      y `20260824100000_sri_issuer_snapshots_and_xsd_validation`. `pnpm db:status`
      confirmó el esquema actualizado.
- [x] `pnpm build` completó para API, Web y Admin. El primer fallo ocurrió porque
      `prisma generate` se ejecutó antes de actualizar el repositorio; al
      regenerar el cliente después del pull, el build fue correcto.
- [x] `nava-api.service` quedó activo y
      `curl http://127.0.0.1:4000/health` respondió `{"status":"ok"}`.
- [x] El certificado `.p12` se instaló fuera del repositorio en
      `/etc/nava/secrets/sri/`, con directorio `0750 root:nava` y archivo
      `0640 root:nava`.
- [x] El error de arranque posterior se diagnosticó como un valor no numérico en
      `SRI_TAX_BASIS_POINTS`. Se retiró el placeholder y la API volvió a iniciar.
      Hasta confirmar los datos tributarios, la emisión debe seguir en
      `SRI_EMISSION_ENABLED=false`, `SRI_ENV=test` y
      `SRI_PRODUCTION_ENABLED=false`.
- [ ] Falta comprobar el `.p12` con el proceso `nava`, confirmar la configuración
      fiscal, probar SMTP y emitir una única factura controlada contra SRI TEST.
      No hay autorización para producción.

Este documento es la fuente de verdad del estado vigente. Sustituye la antigua
bitácora cronológica: una función se considera terminada solo cuando existe en
el código actual y tiene evidencia proporcional a su riesgo.

## Cómo leer el estado

- **Completo:** implementado y con evidencia automatizada suficiente para su
  alcance actual.
- **Funcional:** implementado, pero requiere más integración, E2E o aceptación
  manual antes de producción.
- **Parcial:** existe una parte utilizable, pero faltan requisitos relevantes.
- **Pendiente:** no existe una implementación operativa.
- La evidencia externa histórica (VPS, Google Play, FCM o Google Cloud) se
  identifica como tal cuando no pudo revalidarse desde este repositorio.

## Resumen ejecutivo

| Área                         | Estado                | Situación actual                                                                                                                                                                                                                          |
| ---------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquitectura y monorepo      | Completo              | pnpm/Turborepo, TypeScript estricto, CI, cuatro aplicaciones y paquetes compartidos.                                                                                                                                                      |
| Autenticación y multi-tenant | Funcional             | Registro y OTP, sesiones opacas, recuperación, onboarding, roles y aislamiento por organización implementados. Las integraciones PostgreSQL no se ejecutaron en este corte.                                                               |
| Operación de barbería        | Funcional             | Equipo, servicios, horarios, agenda, Caja, comisiones, inventario, reportes y notificaciones tienen API y UI móvil. Las asignaciones de equipo por sucursal y el archivo/restauración reversible de sucursales están completos en código. Clientes aplica acceso mínimo por rol: ficha completa solo para owner/manager; teléfono enmascarado para recepción/barbero. |
| Reserva pública              | Funcional             | Catálogo, disponibilidad, OTP, política, idempotencia, gestión por token, reseñas y recordatorios implementados. La entrada de organizaciones con varias sucursales activas permite elegir sucursal; las archivadas no aceptan reservas. |
| Comercio de productos        | Parcial               | Catálogo, carrito, pedidos, reserva de stock, PayPhone y gestión operativa existen; faltan endurecimiento público y pruebas específicas.                                                                                                  |
| Planes y suscripciones       | Funcional en TEST     | Trial, plan Free, límites, feature flags y checkout WEB Prepare/Confirm están validados en sandbox. Producción requiere credenciales WEB y aceptación separadas.                                                                          |
| Panel interno                | Funcional, desplegado | Admin está publicado con login/OTP, servicio y HTTPS. El árbol actual añade navegación Usuario↔Organización y administración de Memberships posteriores al commit desplegado; faltan validación autenticada y despliegue de esos avances. |
| Calidad                      | Bloqueada             | Esquema, tipos, pruebas, E2E básico y builds pasan; lint y formato global fallan. Se omitieron 28 pruebas PostgreSQL.                                                                                                                     |
| Producción                   | Piloto                | Hay evidencia histórica de API/Web en VPS, Neon, TLS, FCM y Maps. No se revalidaron hoy servicios, migraciones productivas ni recorrido completo.                                                                                         |
| Android                      | Preparado             | `0.1.12` / code `34` está compilado y archivado; falta registrar su publicación y comprobar la versión recibida desde Play.                                                                                                               |

## Estado del repositorio auditado

- Monorepo privado con Node.js 24, pnpm 11 y Turborepo 2.
- Aproximadamente 200 archivos fuente, migraciones y pruebas versionados, con
  unas 64.500 líneas en `apps`, `packages` y `tests`.
- Cuatro aplicaciones:
  - `apps/api`: Fastify 5, Prisma 7.8 y PostgreSQL.
  - `apps/mobile`: Expo 57, React Native 0.86 y Expo Router.
  - `apps/web`: Next.js 16 para reservas, gestión pública y catálogo.
  - `apps/admin`: Next.js 16 para operación interna de Nava.
- Paquetes compartidos para base de datos, validación, permisos, cliente HTTP,
  configuración, dominio, tokens de diseño y utilidades de prueba.
- El corte histórico de 19 de agosto contenía cambios locales sin commit en el
  panel administrativo. Al 26 de agosto el árbol local está limpio; aun así,
  sus cambios posteriores a `0ead479` no se deben asumir desplegados hasta
  publicar el commit revisado y ejecutar la aceptación funcional.

## Arquitectura vigente

```text
Mobile / Web pública / Admin
             |
             v
       API Node + Fastify
             |
             v
      PostgreSQL + Prisma
```

- La API propia es la única frontera de datos para Mobile, Web y Admin.
- El tenant se deriva de la sesión y de la membresía activa; no se confía en un
  `organizationId` arbitrario enviado por el cliente.
- PostgreSQL usa restricciones, transacciones y bloqueos para las invariantes
  críticas: doble reserva, Caja abierta, comisiones, stock y pedidos.
- El cliente Prisma se genera desde `packages/database/prisma/schema.prisma`.
- El repositorio contiene **71 migraciones**; la fuente operativa para conocer
  si deben aplicarse es `pnpm db:status`, no el listado histórico de archivos.
- Supabase Auth, RLS, Storage, RPC y Realtime no forman parte de la arquitectura
  actual. La carpeta `supabase` no es la autoridad de ejecución.
- La sincronización de agenda entre dispositivos usa eventos persistentes y
  polling incremental; no usa Realtime.

## Estado por fase del MVP

### Fase 0 — Base técnica: funcional

- [x] Workspaces pnpm, Turborepo, TypeScript estricto, ESLint, Prettier y CI.
- [x] Aplicaciones API, Mobile, Web y Admin, más paquetes compartidos.
- [x] PostgreSQL local y de pruebas definidos en `compose.yaml`.
- [x] Variables documentadas en `.env.example`, sin secretos de servidor.
- [x] Pipeline CI con calidad, build, Playwright y PostgreSQL aislado.
- [ ] Recuperar el gate local de lint y formato; hoy no cumple la Definition of
      Done aunque los comandos existan.
- [x] Actualizar `README.md`, `docs/product/mvp-scope.md` y
      `docs/testing/strategy.md` con el alcance y las pruebas vigentes.

### Fase 1 — Identidad, organización y onboarding: funcional

- [x] Registro temporal y verificación OTP por correo antes de crear la cuenta.
- [x] El registro exige aceptar la Política de Privacidad, guarda usuario,
      fecha y versión de esa aceptación, e integra en ella la declaración de
      mayoría de edad o capacidad legal. No existe checkbox separado de edad.
- [x] Página pública local `/tratamiento-de-datos` con contactos para derechos,
      eliminación, portabilidad, marketing y cookies; debe desplegarse en el
      dominio público antes de comunicarla como operativa.
- [x] Normalización y unicidad de correo y teléfono; disponibilidad previa al
      registro y límites de intentos/frecuencia.
- [x] Contraseñas derivadas con `scrypt`; tokens opacos almacenados como hash.
- [x] Login, logout, restauración, recuperación y cambio de contraseña.
- [x] Sesión con duración máxima e inactividad de siete días en backend.
- [x] Onboarding transaccional de cuenta, organización, sede, colaboradores y
      servicios; continuidad después de reiniciar la app.
- [x] Cierre/eliminación de cuenta con validaciones, anonimización, baja
      lógica y auditoría. Correo y teléfono se conservan únicamente como hashes
      irreversibles durante 90 días para impedir el re-registro inmediato; los
      hashes vencidos se purgan al validar un nuevo registro.
- [x] Sesión móvil persistida con Secure Store.
- [ ] Reejecutar la integración PostgreSQL aislada de autenticación,
      onboarding y multi-tenant en el corte de liberación.

### Fase 2 — Equipo, servicios y horarios: funcional

- [x] Roles base `owner`, `manager`, `receptionist` y `barber` aplicados por la
      API.
- [x] Invitaciones por correo con token, vencimiento, aceptación y auditoría.
- [x] Alta, edición y baja de equipo; perfiles reclamables antes de aceptar.
- [x] Categorías, servicios, precio, duración, imagen y asignación por
      profesional.
- [x] Horarios semanales del negocio y del profesional, bloqueos y sede.
- [x] Gestión móvil de servicios, equipo, roles base, ubicación y horarios.
- [ ] Los “permisos personalizados” no existen: la pantalla cambia perfiles
      base y `Membership` no almacena capacidades individuales.

#### Actualización: asignaciones de equipo y ciclo de vida de sucursales — completa en código (27 de agosto de 2026)

La integración del commit `5504e7e` usa `MemberLocation` como fuente de verdad
de las asignaciones y mantiene la validación en servidor; la interfaz es una
segunda barrera, no la autoridad de acceso.

- [x] La API consulta y reemplaza las sucursales asignadas de miembros activos
      de la misma organización, aplicando los entitlements efectivos y los
      límites de sucursales. Free y Esencial bloquean la edición; Trial, Local,
      Multi y los overrides efectivos la permiten dentro de sus límites.
- [x] Owner permanece protegido de edición. Manager conserva acceso a toda la
      organización: sus asignaciones se guardan y muestran solo como referencia.
      Receptionist y barber requieren una o más sucursales asignadas.
- [x] Receptionist queda restringido en servidor a agenda, clientes y eventos
      de sus sucursales asignadas.
- [x] Al asignar una sucursal a un barber se crean, sin duplicados, los
      servicios activos de la organización para esa combinación. No se copian
      horarios ni bloqueos; al retirar la sucursal se preservan servicios,
      horarios y bloqueos para una restauración posterior. El retiro se rechaza
      si existen citas futuras no canceladas.
- [x] Las sucursales se archivan y restauran con `Location.isActive`; no hay
      borrado físico. Solo owner puede hacerlo. El archivo exige otra sucursal
      activa y rechaza caja abierta o citas futuras; también revoca invitaciones
      pendientes. Restaurar respeta la capacidad del plan y conserva historial
      y configuraciones.
- [x] Mobile separa sucursales activas y archivadas, permite archivar/restaurar
      y muestra los bloqueos; la pantalla de colaboradores permite gestionar
      las asignaciones disponibles por rol y plan.
- [x] La reserva pública mantiene las URL de cada sucursal, rechaza las
      archivadas con `PUBLIC_LOCATION_NOT_FOUND` y valida en servidor la
      pertenencia del profesional, reservas online y servicios por sucursal.
      La URL de organización conserva la redirección con una sucursal activa y
      muestra un selector con dos o más.
- [x] Las mutaciones relacionadas son transaccionales y auditables. La cobertura
      de integración incluye recepción, manager, barber, restricciones de plan,
      archivo/restauración y el comportamiento público de sucursales archivadas.

Pendiente operativo: desplegar API, Mobile y Web pública como una misma
liberación y ejecutar la aceptación contra el entorno de destino; esta
documentación no constituye evidencia de despliegue productivo.

### Fase 3 — Agenda: funcional

- [x] Disponibilidad por sede, zona horaria, jornada, bloqueos, servicios y
      citas existentes.
- [x] Creación, reprogramación, cancelación y transición de estados.
- [x] Servicios de la cita conservados como snapshot de precio y duración.
- [x] Exclusión PostgreSQL contra solapamiento de citas del mismo profesional.
- [x] Eventos incrementales y refresco móvil entre dispositivos.
- [x] Flujos móviles de agenda diaria, nueva cita, detalle y reprogramación.
- [ ] Repetir pruebas de concurrencia con PostgreSQL real y validar Agenda en
      un Android distribuido por el track objetivo.

### Fase 4 — Reservas públicas: funcional

- [x] URL pública por organización/sede, catálogo, equipo, productos, reseñas
      visibles y disponibilidad en tiempo real.
- [x] Selección de varios servicios y profesional obligatorio.
- [x] Aceptación y versionado de política de reserva.
- [x] Idempotencia por cabecera y restricción única en PostgreSQL.
- [x] OTP de seis dígitos por correo, expiración, máximo de intentos y liberación
      automática del horario no verificado.
- [x] Token privado para consultar, confirmar asistencia, cancelar,
      reprogramar y reseñar.
- [x] Reconfirmación, plazo y acción por falta de respuesta configurables.
- [x] Valores predeterminados alineados con la política: recordatorio 24 h,
      reconfirmación con plazo de 6 h, conservación de la cita sin respuesta y
      cancelación/reprogramación hasta 2 h antes; cada negocio puede cambiarlos.
- [x] Proxy Web de mismo origen limitado a rutas públicas para evitar exponer
      la URL interna de la API.
- [x] Límites en memoria por IP para catálogo, disponibilidad, creación,
      verificación y gestión.
- [ ] No hay CAPTCHA, huella de dispositivo, reputación de cliente ni regla de
      una única reserva futura configurable.
- [ ] No existe el abono configurable por reserva/servicio ni saldo a favor por
      cancelación. `downPaymentPercentage` se captura durante onboarding, pero no
      hay un flujo transaccional completo que lo aplique a la reserva.
- [ ] Ejecutar el recorrido real Web → OTP → gestión → móvil contra el entorno
      que se vaya a liberar; el E2E actual solo cubre la página inicial.

### Fase 5 — Clientes e historial: parcial

- [x] Directorio, búsqueda, alta, edición, importación de contactos, etiquetas
      y eliminación lógica.
- [x] Historial de citas, notas y fotos privadas asociadas a notas.
- [x] Las notas operativas rechazan expresiones claras de salud, historial
      clínico y biometría. Es una salvaguarda de interfaz, no sustituye la
      prohibición contractual ni una revisión humana de contenido sensible.
- [x] Exportación y eliminación múltiple desde Mobile.

#### Actualización: protección de datos de clientes por rol — completa en código (26 de agosto de 2026)

La decisión aprobada distingue los roles operativos de una barbería del
`platform_admin` de Nava. El principio aplicado es **mínimo privilegio**: la
interfaz no ofrece una acción cuando el rol no la necesita, y la API vuelve a
validar permiso, organización y alcance antes de devolver o modificar datos.

| Rol | Alcance de clientes | Datos de contacto | Acciones permitidas |
| --- | --- | --- | --- |
| `owner` | Todos los clientes de su organización | Ficha completa, incluido teléfono | CRUD, etiquetas, notas, importación, comunicación y exportación CSV. |
| `manager` | Todos los clientes de su organización | Ficha completa, incluido teléfono | CRUD, etiquetas, notas, importación y comunicación. No exporta. |
| `receptionist` | Solo clientes con citas en sus sucursales asignadas | Teléfono enmascarado; correo, dirección, documento, fecha de nacimiento, notas y etiquetas no se entregan | Consulta limitada. No crea, edita, elimina, importa, exporta, etiqueta, comunica ni consulta/gestiona notas. |
| `barber` | Solo clientes de citas asignadas a su propia membresía | Teléfono enmascarado; el resto de PII sensible no se entrega | Consulta limitada y lectura/creación de sus propias notas. No puede editar ni eliminar notas de terceros, ni gestionar clientes, etiquetas, importaciones, comunicaciones o exportaciones. |
| `platform_admin` | Operación interna de plataforma; no es rol normal de una organización | PII enmascarada en el panel | No recibe acceso ordinario a fichas completas de clientes de las barberías. |

Controles implementados:

- [x] Catálogo compartido de permisos `client.*` en `@barber-saas/permissions`.
  Se separan consulta de directorio/ficha, contacto completo o enmascarado,
  PII, CRUD, notas, etiquetas, importación, exportación y comunicación.
- [x] Contexto de acceso de clientes calculado en API a partir de la sesión y
  membresía activa: organización, rol, membresía y sedes asignadas. No se
  acepta un `organizationId` o alcance arbitrario desde Mobile.
- [x] Filtro de datos en servidor para listado y detalle. Las respuestas de
  recepción y barbero no contienen el teléfono original ni PII no autorizada;
  el teléfono queda limitado a sus últimos cuatro dígitos.
- [x] Restricción de búsquedas: los roles con contacto enmascarado no pueden
  usar teléfono como criterio de búsqueda.
- [x] Alcance relacional en servidor: recepción queda limitada a citas de sus
  sedes y barbero a citas con su propia `membershipId`. La misma regla se
  aplica al seleccionar un cliente existente durante la creación de una cita.
- [x] Agenda endurecida con el alcance de sede/membresía y serialización de
  clientes sin contacto completo para roles restringidos. El flujo público de
  reservas conserva explícitamente la respuesta de gestión necesaria para su
  titular, sin convertirlo en acceso de colaboradores.
- [x] Notas protegidas en API: barbero solo puede leer y crear sus notas sobre
  clientes que le correspondan; owner y manager mantienen la gestión completa.
- [x] Exportación trasladada al endpoint autenticado
  `POST /v1/clients/export`. Solo `owner` puede exportar hasta 500 clientes;
  el CSV se construye en backend, protege contra inyección de fórmulas y deja
  el evento `client.export.created` sin valores PII en la auditoría.
- [x] Mobile adapta menú, acciones masivas, formularios, etiquetas, detalle,
  notas, alta rápida desde nueva cita y recordatorios de WhatsApp según la
  capacidad del rol. La exportación cliente-side fue eliminada.
- [x] La clave de caché de Mobile incluye el rol activo y el cambio de rol
  invalida las respuestas previas, evitando mostrar datos cargados con una
  capacidad superior.

Evidencia local del cambio `8c0eeec`:

| Validación | Resultado |
| --- | --- |
| Pruebas API | 59 aprobadas; 32 omitidas por no configurar `TEST_DATABASE_URL`. Incluye enmascaramiento, respuestas de agenda y alcance de recepción/barbero. |
| Pruebas Mobile | 28 suites y 84 pruebas aprobadas. |
| Pruebas de permisos | 6 aprobadas. |
| Cliente API | 2 pruebas aprobadas. |
| Typecheck | API, Mobile, permisos y cliente API aprobados. |
| Calidad específica | ESLint de los archivos modificados, build de API y `git diff --check` aprobados. |

Pendientes específicos antes de ampliar este módulo:

- [ ] Ejecutar las pruebas de integración de autorización contra una base
      PostgreSQL aislada en CI o en el corte de despliegue.
- [ ] Añadir paginación, límites de frecuencia y métricas de seguridad a las
      consultas y exportación de clientes si el volumen del piloto lo exige.
- [ ] Mantener cualquier acceso excepcional de soporte como flujo explícito,
      temporal y auditado; no conceder fichas completas a `platform_admin` por
      defecto.

- [x] Tras cerrar un negocio, la persona propietaria puede descargar durante
      30 días desde Ajustes un CSV de datos o un ZIP con datos e imágenes
      disponibles; el acceso no reactiva el negocio cerrado.
- [x] Reutilización de cliente por teléfono dentro del alcance implementado.
- [ ] No existe deduplicación asistida ni barbero preferido persistente.
- [ ] Las imágenes se guardan como `data:`/base64 en PostgreSQL; no existe
      almacenamiento de objetos con URLs firmadas como exigía el alcance inicial.
- [ ] Bloqueo de clientes, venta desde la ficha y acciones de notificación
      siguen marcadas “Próximamente” en la UI.

### Fase 6 — Caja y POS: funcional con alcance limitado

- [x] Apertura y una sola Caja abierta por alcance operativo.
- [x] Ventas de citas y manuales, productos, depósitos, otros ingresos, gastos,
      retiros y pagos de comisiones/anticipos.
- [x] Cierre con efectivo esperado, contado, diferencia, historial y auditoría.
- [x] El método de pago controla si un movimiento afecta efectivo.
- [x] Venta de producto y movimiento de stock unidos transaccionalmente.
- [x] Operación por sucursal reforzada el 27 de agosto de 2026: cada sesión de
      Caja queda ligada a una sucursal y solo existe una caja abierta por cada
      organización-sucursal. Owner y manager pueden elegir cualquier sucursal
      activa; receptionist y barber solo pueden operar las que tengan asignadas.
- [x] Al cambiar de sucursal en Caja Mobile se vuelven a consultar la sesión,
      los movimientos/resumen y el inventario de esa sucursal. Las consultas
      usan claves separadas por `locationId` y no reutilizan datos frescos de
      una selección anterior.
- [x] La confirmación manual de un pago PayPhone busca exclusivamente una Caja
      abierta de la sucursal de la cita. Una Caja abierta en otra sucursal no
      puede recibir ese movimiento.
- [x] Cobertura de regresión añadida para el cambio y retorno de sucursal en
      Caja Mobile y para una Caja abierta ajena durante la confirmación
      PayPhone. Verificación local: API 60 pruebas aprobadas (46 integraciones
      PostgreSQL omitidas), Mobile 92 pruebas aprobadas y typecheck de ambas
      aplicaciones correcto.
- [ ] Una cita exige cobro completo con un solo método; no hay pagos parciales,
      saldos ni división entre varios métodos.
- [ ] La UI anuncia crear ventas desde la ficha de cliente, pero esa entrada
      específica todavía no está conectada.

### Fase 7 — Comisiones y anticipos: funcional

- [x] Reglas porcentuales/fijas, cálculo backend, snapshots e idempotencia.
- [x] Comisión automática al cobrar citas y venta manual comisionable.
- [x] Reversión auditable sin borrar el asiento original.
- [x] Anticipos, liquidaciones, aprobación, cancelación y pago.
- [x] Visibilidad del profesional limitada a sus propios importes.
- [x] Productos excluidos de comisión por decisión vigente del MVP.
- [ ] Revalidar concurrencia y ciclo completo de liquidación con la suite
      PostgreSQL habilitada antes de usarlo para pagos reales.

### Fase 8 — Inventario y pedidos: parcial

- [x] Productos, costo/precio, SKU/código, imagen, stock por sede, mínimo,
      ajustes, movimientos y alertas.
- [x] La venta en Caja descuenta stock y deja movimiento auditable.
- [x] Catálogo público con carrito y checkout para tarjeta/PayPhone,
      transferencia o pago al retirar.
- [x] Pedidos persistentes con estados `PENDING_PAYMENT`, `RESERVED`, `PAID`,
      `READY_FOR_PICKUP`, `FULFILLED`, `EXPIRED` y `CANCELLED`.
- [x] Reserva transaccional de unidades, bloqueo de filas y liberación automática
      por cancelación, fallo de PayPhone o vencimiento.
- [x] Gestión de pedidos desde la pantalla móvil de Inventario.
- [ ] La creación pública de pedidos no tiene clave de idempotencia ni rate
      limiting propios y no tiene pruebas unitarias/integración dedicadas.
- [ ] No hay carga de comprobante para transferencia; el negocio confirma el
      pago de forma manual.
- [ ] Corregir textos residuales “Pedido de demostración” y “checkout real” en
      una interfaz que ya crea pedidos persistentes.

### Fase 9 — Notificaciones: funcional

- [x] Bandeja interna, estados leída/no leída y tokens por dispositivo.
- [x] Cola persistida en `AppNotification`, hasta cinco intentos y backoff.
- [x] Correo SMTP y FCM HTTP v1 directo; no se usa Expo Push.
- [x] Eventos de creación, cancelación y reprogramación pública, con navegación
      a la fecha de la cita.
- [x] Recordatorios y reconfirmación pública procesados cada minuto.
- [x] Existe evidencia histórica de una entrega FCM real desde la VPS.
- [ ] No hay WhatsApp real, por decisión de alcance.
- [ ] Falta observabilidad externa de la cola y alertas sobre fallos agotados.

### Fase 10 — Reportes: funcional

- [x] Resumen de negocio, control diario y movimientos.
- [x] Ventas, cobros por método, gastos, depósitos, productos, profesionales,
      comisiones y cierres.
- [x] Filtros por fecha/sede, zona horaria, paginación y exportación CSV/Share.
- [x] Reseñas e inventario bajo enlazados desde Reportes.
- [ ] “Préstamos a clientes” no está implementado y queda fuera del MVP; la UI
      todavía lo muestra como pendiente de definición y debe ocultarse o aclararse.

### Fase 11 — Planes y límites: funcional, pendiente de habilitación externa

- [x] Planes `free`, `essential`, `local` y `multi` con límites y feature flags.
- [x] Nava Esencial habilita inventario y reportes completos para operación
      individual, además de reservas y clientes ilimitados. Conserva el límite
      de un profesional y una sucursal; equipo, comisiones y múltiples sedes
      comienzan en Nava Local.
- [x] La migración `20260826160000_essential_inventory_full_reports` actualiza
      el catálogo persistido y las suscripciones Esencial existentes reciben
      los nuevos entitlements sin recompra ni modificación del período pagado.
- [x] Trial de 10 días; al finalizar pasa directamente a Nava Free. Los planes
      pagados tienen 3 días de gracia y, ante impago, bajan automáticamente a
      Nava Free sin eliminar datos.
- [x] Límites backend para profesionales, sedes, clientes y reservas móviles.
- [x] Nava Free limita a 25 reservas en los últimos 30 días. Al terminar Demo,
      trial o un plan pagado, conserva datos sin borrar: deja un profesional
      operativo y marca los demás como históricos; API y app móvil bloquean sus
      nuevas reservas, disponibilidad en línea, edición operativa y asignación
      de servicios, mientras la interfaz los mantiene visibles con opacidad.
      La pantalla Suscripción muestra el uso real, el límite de 25 reservas y
      la explicación de los datos históricos. Para evitar confundir Nava
      Esencial con Free, separa las inclusiones reales del plan adquirido
      (reservas/clientes ilimitados, agenda, servicios, historial, caja,
      inventario y reportes completos) de los módulos de equipo, comisiones y
      múltiples sedes que requieren Nava Local.
- [x] Refuerzo de degradación Free: Caja sólo permite seleccionar profesionales
      habilitados; inventario y ventas/comisiones premium quedan inactivos o
      redirigen a Suscripción. La importación y alta manual de clientes respetan
      el máximo de 100 también bajo solicitudes concurrentes, mediante un bloqueo
      transaccional por organización.
- [x] Migración `20260823170000_free_booking_limit_25` actualiza el límite del
      plan existente sin modificar reservas, profesionales ni historial.
- [x] Panel interno para cambiar plan, suspender, reactivar y conceder soporte.
- [x] La app Android solo consume el estado y no enlaza un checkout externo.
- [x] Checkout Web autenticado para suscripciones Nava con PayPhone Botón WEB,
      Prepare/Confirm, idempotencia, validación verificable y auditoría;
      validado de punta a punta en sandbox. Producción sigue pendiente de su
      configuración y autorización separadas.
- [x] Promoción de fundador para Nava Local: el checkout en
      `navacloud.app/suscripciones` acepta un código configurable sólo en el
      servidor (`PLATFORM_FOUNDER_PROMOTION_CODE`), aplica USD 19,93 como valor
      final, registra la factura y conserva el beneficio mientras haya
      continuidad mensual. El vencimiento del período de gracia lo revoca de
      forma irreversible.
- [x] Migraciones `20260823110000_subscription_policy_10_day_trial` y
      `20260823120000_founder_promotion_code` actualizan trials vigentes y
      persisten el historial de la promoción.
- [ ] Falta habilitar credenciales PayPhone WEB de producción, configurar el
      código fundador en producción y realizar su validación controlada.
- [x] Aviso de vencimiento cinco días antes: proceso horario por correo SMTP,
      con registro persistente para no duplicar envíos y texto que aclara la
      renovación manual.
- [ ] Facturación electrónica por correo: existe una base propia para facturar
      exclusivamente Nava → negocio suscriptor: perfil y snapshot de comprador,
      secuencial transaccional, clave de acceso, XML de factura 2.1.0,
      firma XAdES_BES, recepción/autorización SOAP, RIDE, cola persistente e
      intento de envío SMTP. No se considera operativa ni completa hasta validar
      XML contra los XSD oficiales en ejecución, instalar un `.p12`, confirmar
      régimen/impuestos/forma de pago con contador y lograr homologación SRI +
      correo real. No factura Caja, productos ni servicios de las barberías.
- [x] Marketing Nava con opt-in explícito: desmarcado por defecto en el
      registro, consentimiento versionado y fechado, y baja posterior desde
      Ajustes. Los avisos operativos permanecen fuera de esta preferencia.
- [x] Banner Web de cookies: Aceptar, Rechazar y Configurar ofrecen decisiones
      equivalentes; GA4 solo se inserta después del consentimiento y si existe
      `NEXT_PUBLIC_GA_MEASUREMENT_ID` en producción.
- [ ] El endpoint de simulación sigue siendo parte de la operación del MVP y no
      sustituye un sistema de cobro.

#### Facturación SRI propia — parcial, desplegada en TEST y pendiente de validación externa (24 de agosto de 2026)

- [x] Se reutiliza `SubscriptionInvoice` como snapshot comercial y
      `SubscriptionPaymentAttempt` como pago verificable. `SriInvoice` es el
      comprobante fiscal distinto, restringido de forma única a un pago de
      suscripción; evita facturas duplicadas cuando PayPhone o el worker se
      reintentan.
- [x] La migración `20260823180000_sri_electronic_invoicing` agrega perfil de
      facturación por organización, secuencias fiscales concurrentes y el
      comprobante con snapshots de comprador, plan, importes, impuestos, XML,
      RIDE, autorización, errores y entrega. Tiene `rollback.sql`.
- [x] La emisión queda desacoplada de activar el plan: un pago aplicado conserva
      la suscripción activa aunque SRI, red o SMTP fallen. El worker PostgreSQL
      retoma facturas pendientes sin Redis ni otro proveedor adicional.
- [x] La clave de acceso tiene 49 dígitos, usa el módulo 11 y el secuencial se
      reserva con una operación atómica por tipo/establecimiento/punto de
      emisión; no usa `MAX(secuencial) + 1`.
- [x] Se construye factura XML `2.1.0`, se firma en backend como XAdES_BES
      enveloped con certificado PKCS#12 y RSA-SHA1, y se usan los WS directos
      offline de recepción y autorización del SRI por ambiente `test` o
      `production`. No se integra un proveedor externo ni se fija el TLS del
      SRI en código.
- [x] Tras autorización se conserva XML autorizado, se genera un RIDE PDF
      mínimo y se entrega XML + RIDE por SMTP. El estado fiscal y la entrega de
      correo se persisten por separado; un reenvío no emite otro comprobante.
- [x] API de propietario: configurar datos de facturación, listar comprobantes,
      descargar XML/RIDE autorizado y solicitar reenvío. El perfil pertenece a
      la organización suscriptora y nunca a los clientes finales de barberías.
- [x] Configuración nueva: `SRI_ENV` (por defecto `test`),
      `SRI_EMISSION_ENABLED`, `SRI_PRODUCTION_ENABLED`, datos fiscales reales
      del emisor (Nava es la marca comercial), régimen, impuestos, forma de
      pago, ruta/contraseña del certificado y espera de autorización. Producción
      requiere la doble activación explícita.
- [x] Evidencia local: pruebas unitarias de módulo 11, clave de acceso,
      secuencial, montos y XML; pruebas API 37 aprobadas (30 omitidas por no
      disponer de `TEST_DATABASE_URL`); typecheck, build API, lint modificado y
      `prisma validate` correctos.
- [x] El XML se valida antes de firmar mediante el XSD oficial local de factura
      2.1.0; el esquema no se descarga durante la ejecución. La emisión conserva
      snapshots fiscales del emisor, limita reintentos y bloquea el procesamiento
      concurrente de una misma factura.
- [ ] No existe aún evidencia contra el certificado instalado ni contra el SRI
      de certificación; no declarar que el comprobante es aceptado hasta completar
      una factura controlada en TEST y la entrega por SMTP.
- [ ] Falta la pantalla Mobile/Web de "Mis facturas" y la vista global de
      diagnóstico/reintento para `platform_admin` en Nava Control Center. La
      API de propietario ya existe, pero no sustituye esas interfaces.
- [ ] Antes de habilitar emisión: confirmar con contador el régimen, IVA/códigos
      SRI y forma de pago; comprobar el `.p12` como usuario `nava`; probar
      recepción → autorización → RIDE → SMTP con una sola factura en
      `SRI_ENV=test`; solo después, en una tarea independiente, evaluar producción
      con `SRI_PRODUCTION_ENABLED=true`.

### Fase 12 — Panel interno: funcional, desplegado con avances pendientes

- [x] Acceso limitado por `PLATFORM_ADMIN_EMAILS`, login y segundo factor OTP.
- [x] El 21 de agosto de 2026 se desplegó `https://admin.navacloud.app` con
      `nava-admin.service` en el puerto local `3001`, Nginx/Certbot y el commit
      `0ead479`. La base registraba 58 migraciones aplicadas. Esta es evidencia
      histórica de despliegue, no una comprobación realizada el 26 de agosto.
- [~] Continuación Super Admin (código local al 26 de agosto de 2026): Usuarios
  Nava incluye listado global paginado,
  búsqueda/filtros en backend, PII enmascarada, ficha 360°, consulta de
  Memberships, suspensión/reactivación, revocación total de sesiones y
  solicitud segura de recuperación de contraseña. El árbol actual también
  incluye navegación Usuario↔Organización y administración de Memberships.
  La migración
  `20260823160000_platform_user_administration` agrega el estado de
  suspensión; confirmar su estado con `pnpm db:status` antes del despliegue.
  Falta validación contra PostgreSQL real y la aceptación de roles, PII y los
  flujos operativos antes de publicar esta continuación.
- [x] Métricas, organizaciones, plan, trial, uso, errores de notificación,
      auditoría y diagnóstico de soporte sin suplantación.
- [x] Acciones de cambio de plan, suspensión y reactivación auditadas.
- [x] Filtros por búsqueda, estado, plan y vencimiento de prueba.
- [~] Billing de plataforma (desplegado y validado operativamente el 26 de
  agosto de 2026): existe una sección global de Suscripciones exclusiva para
  Billing/Super Admin. Consulta datos reales en tiempo real de
  la suscripción, la última factura, el último intento de pago y los tres
  cambios más recientes, con filtros backend; no expone URLs, referencias ni
  secretos de PayPhone, y no simula cobros. La vista distingue el inicio y
  vencimiento del período activo; falta completar un historial transaccional
  íntegro por organización.
- [x] Rediseño responsive “Nava Control Center”, partículas con Anime.js y
      actualización manual de datos.
- [ ] Completar revisión visual autenticada en escritorio/móvil, Axe y los
      casos de aceptación de roles, PII, incidencias y auditoría.
- [ ] Desplegar de forma controlada el commit posterior a `0ead479` que contiene
      Usuarios Nava, navegación y Memberships, y registrar el commit,
      migraciones y aceptación resultantes.

### Fase 13 — Estabilización: pendiente

- [x] Typecheck y builds del monorepo.
- [x] E2E básico de home Web en móvil y escritorio, con comprobación Axe de
      infracciones críticas/serias.
- [x] Prueba de humo de rendimiento disponible en
      `tests/performance/api-smoke.mjs`.
- [ ] Corregir lint y formato.
- [ ] Ejecutar las 28 integraciones PostgreSQL omitidas.
- [ ] Añadir E2E de registro/OTP, agenda, reserva pública, Caja, inventario,
      pedidos, suscripción y panel interno.
- [ ] Hacer revisión de seguridad y autorización multi-tenant por todos los
      endpoints nuevos, no solo por el núcleo inicial.
- [ ] Ejecutar carga/concurrencia de agenda, Caja, comisiones y stock.
- [ ] Ensayar restauración de Neon, documentar RPO/RTO y verificar backups.
- [ ] Completar accesibilidad, errores de red, observabilidad y aceptación en
      dispositivos físicos.

## Evidencia de calidad del corte

Comandos ejecutados el 19 de agosto de 2026 sobre el árbol local actual:

| Comando                                 | Resultado              | Evidencia                                                                          |
| --------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| `pnpm db:validate`                      | Aprobado               | El esquema Prisma es válido.                                                       |
| `pnpm typecheck`                        | Aprobado               | 17 tareas correctas en 12 paquetes.                                                |
| `pnpm test`                             | Aprobado con omisiones | 60 pruebas aprobadas y 28 integraciones PostgreSQL omitidas.                       |
| `pnpm build`                            | Aprobado               | API, Web, Admin, paquetes y export Web de Mobile generados.                        |
| `pnpm test:e2e`                         | Aprobado               | 4/4 pruebas de home Web en Chromium móvil/escritorio.                              |
| `pnpm format:check`                     | Fallido                | El escaneo global reportó 297 archivos, incluidos artefactos locales no ignorados. |
| `pnpm lint`                             | Fallido                | Mezcla errores reales con `.tools`, `.eas-archive` y artefactos Android.           |
| ESLint de fuente sin archivos generados | Fallido                | 98 errores y 1 advertencia.                                                        |
| `pnpm test:performance`                 | No ejecutado           | Requiere una API objetivo levantada y datos controlados.                           |

Desglose de pruebas aprobadas:

- API: 22 aprobadas; 28 integraciones omitidas por no disponer de
  `TEST_DATABASE_URL` aislada en esta sesión.
- Mobile: 4 suites, 6 pruebas.
- Admin: 4 pruebas.
- Validación: 21 pruebas.
- Permisos: 5 pruebas.
- Cliente API: 2 pruebas.
- Playwright: 4 pruebas.

Concentración actual del lint de fuente:

| Archivo/área                                      |            Errores |
| ------------------------------------------------- | -----------------: |
| `apps/mobile/app/(onboarding)/dashboard.tsx`      |                 54 |
| `apps/mobile/src/components/BottomNavigation.tsx` |                 11 |
| `apps/mobile/app/(onboarding)/client-detail.tsx`  |                  8 |
| `apps/mobile/src/components/BookingLinkSheet.tsx` |                  7 |
| `apps/mobile/app/(onboarding)/cash-register.tsx`  |                  5 |
| Resto de Mobile                                   | 11 + 1 advertencia |
| API (`product-orders.ts`, `payphone-payments.ts`) |                  2 |

La mayor parte proviene de reglas del React Compiler sobre refs, pureza y
memoización, además de imports de tipo y variables sin uso. No debe ocultarse
con una marca histórica de “lint aprobado”.

## Seguridad y límites conocidos

- El aislamiento multi-tenant está implementado en backend y probado en la
  suite de integración, pero esa suite no corrió en este corte.
- El rate limiting de autenticación, Maps y reservas públicas vive en memoria.
  Es aceptable para una sola instancia piloto; antes de escalar horizontalmente
  debe trasladarse a un almacén compartido.
- `apps/api/src/index.ts` carga `../../.env` además del entorno del proceso. En
  producción, systemd debe seguir siendo la autoridad mediante
  `/etc/nava/api.env`; este es un archivo dotenv y nunca debe cargarse con
  `source` o `.` desde Bash. Conviene retirar la ruta relativa para evitar
  deriva.
- Las credenciales PayPhone se cifran con AES-256-GCM y AAD por organización.
  La confirmación de pagos de citas es manual e idempotente; no hay webhook de
  confirmación automática en el MVP.
- Las imágenes privadas se almacenan en PostgreSQL como base64. Esto evita un
  proveedor externo, pero aumenta tamaño de base, respuesta y backup.
- No se encontraron mecanismos de CAPTCHA, reputación, dispositivo o
  idempotencia para pedidos públicos.
- Ningún secreto de `.env`, claves de mapas, cuenta FCM, keystore o contraseñas
  debe copiarse a Git, logs o este documento.

## Estado operativo externo registrado

Estos puntos provienen de evidencia histórica del proyecto. **No fueron
revalidados por SSH, Google Cloud, Neon ni Play Console durante esta auditoría**.

- API, Web pública y Admin fueron desplegados en `/opt/nava/app` sobre una VPS,
  con `nava-api.service`, `nava-web.service` y `nava-admin.service`
  administrados por systemd. El Admin fue validado el 21 de agosto de 2026 en
  `https://admin.navacloud.app`; el commit confirmado fue `0ead479`.
- Nginx/TLS exponen `https://api.navacloud.app` y
  `https://reservas.navacloud.app`; PostgreSQL productivo está en Neon.
- Los secretos de la API viven en `/etc/nava/api.env`.
- La cuenta FCM real está en
  `/opt/nava/secrets/fcm-service-account.json`; el entorno de systemd debe
  apuntar a esa ruta. Existe registro de una notificación real exitosa.
- Google Maps Android quedó validado en desarrollo y en una instalación desde
  Google Play después de autorizar el paquete y la firma efectiva de Play.
- La evidencia del despliegue Admin del 21 de agosto registró 58 migraciones
  aplicadas. Como el código actual es posterior y contiene nuevas migraciones,
  hay que reconciliar `pnpm db:status` antes del próximo despliegue.
- El último despliegue de Admin explícitamente documentado fue `0ead479`; el
  `HEAD` local actual (`457cb26`) es posterior. No asumir que producción
  contiene los avances actuales de Usuarios Nava/Memberships ni sus
  migraciones hasta confirmar el despliegue.

### Runbook histórico — sustituido (no ejecutar)

> Este procedimiento corresponde a un corte anterior y queda reemplazado por
> **REGLAS DE DESPLIEGUE — NO REGRESIONAR** al inicio de este documento. No lo
> ejecute: no aplica la comprobación condicional de migraciones ni los comandos
> canónicos de entorno y build actualmente requeridos. Los comandos y
> restricciones de ese corte se retiraron para impedir su reutilización.

## Android y Google Play

### Estado actual

- Candidato local de publicación: `versionName` **0.1.13**, `versionCode`
  **35**. Se eligió el code 35 porque no hay evidencia concluyente de si el
  code 34 llegó a cargarse en Play Console; nunca se reutiliza un código que
  pudo haberse subido.
- `apps/mobile/app.json` y `apps/mobile/android/app/build.gradle` coinciden.
- El manifest fusionado del candidato fue regenerado desde limpio y verificado:
  `com.barbersaas.mobile`, `0.1.13`/`35`, `allowBackup=false`, sin permisos
  bloqueados y con `compileSdk`/`targetSdk` **36**. No existe todavía AAB
  firmado ni subida a Play para este candidato. El intento de `bundleRelease`
  se detuvo antes de compilar el artefacto porque la sesión local no tenía las
  cinco propiedades obligatorias `NAVA_UPLOAD_*`; el guard de Gradle impidió
  correctamente una firma incompleta o debug.
- Expo Router y módulos Expo permanecen; EAS Build y Expo Updates/OTA fueron
  retirados. No hay referencias activas a `expo-updates`, `runtimeVersion` o
  canal OTA en la configuración auditada.
- AAB archivado: `apps/mobile/releases/Nava-0.1.12-code34.aab`.
- Tamaño: 87.182.080 bytes.
- SHA-256:
  `AA05D6794DE3CA6662D96C754565F05267C53B73381982F919ADE72D306CC9F2`.
- El historial indica que code 33 fue cargado a Play. Para code 34 no consta
  subida/rollout ni comprobación en teléfono.
- La pantalla Android de suscripción queda en modo de consumo: muestra el
  acceso vigente y sus capacidades, pero no compara precios, no promociona
  planes, no enlaza ni indica cómo comprar fuera de Google Play. Esta medida no
  sustituye una decisión comercial/fiscal sobre Google Play Billing; evita que
  el binario dirija al usuario a un cobro externo de software SaaS.

### Google Play In-App Updates nativo (FLEXIBLE) — implementado localmente

- Android usa exclusivamente **Google Play In-App Updates / Play Core** como
  autoridad de disponibilidad: no hay API Nava, scraping de Play, comparación
  manual de versiones, OTA, Expo Updates ni CodePush. La dependencia añadida es
  `com.google.android.play:app-update:2.1.0` en
  `apps/mobile/android/app/build.gradle`.
- La integración conserva Expo SDK 57, React Native 0.86, Expo Router, la New
  Architecture y el proyecto Android nativo existente. Se registró el paquete
  manual `PlayInAppUpdatesPackage` desde `MainApplication`; no se ejecutó
  `expo prebuild` ni se modificaron permisos, Firebase, Maps, notificaciones o
  pagos.
- `PlayInAppUpdatesModule.kt` consulta `AppUpdateManager.appUpdateInfo` al
  entrar en foreground y al regresar desde segundo plano. Desduplica la
  colisión de arranque entre ciclo de vida nativo y JavaScript, evita consultas
  simultáneas y solo inicia una ventana de Play por sesión. Google Play sigue
  pudiendo informar de un estado descargado en cada reanudación.
- La política actual es únicamente `AppUpdateType.FLEXIBLE`. Si Google Play
  informa `UPDATE_AVAILABLE` y permite ese tipo, el módulo inicia el flujo
  oficial. La lectura de `updatePriority` y `clientVersionStalenessDays` queda
  encapsulada en el estado nativo para una futura política `IMMEDIATE`, sin
  aplicar reglas de prioridad todavía.
- El módulo registra un único `InstallStateUpdatedListener`, lo desregistra al
  invalidarse el contexto React Native y serializa sus cambios en la cola UI.
  Al recibir `DOWNLOADED`, `PlayInAppUpdatesBanner` muestra en Nava
  “Actualización lista” y el botón “Actualizar ahora” llama solamente a
  `appUpdateManager.completeUpdate()` a través del puente nativo. Al reabrir la
  app, el estado retornado por Play vuelve a mostrar el aviso si la descarga ya
  terminó.
- Los fallos de disponibilidad (incluidos APK/ADB, Expo Go, Play Store ausente
  o una cuenta que no posee la app) se registran de forma diagnóstica segura y
  no bloquean login, navegación ni el resto de Nava. El flujo real solo es
  válido para una instalación administrada por Google Play; una instalación
  manual no es una prueba válida ni se espera que ofrezca la actualización.
- Archivos de esta integración:
  `apps/mobile/android/app/build.gradle`,
  `apps/mobile/android/app/src/main/java/com/barbersaas/mobile/MainApplication.kt`,
  `PlayInAppUpdatesModule.kt`, `PlayInAppUpdatesPackage.kt`,
  `apps/mobile/src/lib/play-in-app-updates.ts`,
  `apps/mobile/src/components/PlayInAppUpdatesBanner.tsx`,
  `apps/mobile/src/lib/play-in-app-updates.test.ts` y
  `apps/mobile/app/_layout.tsx`.
- Verificaciones locales ejecutadas: `pnpm --filter @barber-saas/mobile
  typecheck` (correcto), `pnpm --filter @barber-saas/mobile test` (35 suites,
  103 pruebas correctas) y `:app:compileDebugKotlin` de Gradle (correcto). No
  se generó AAB de producción.

#### Validación posterior mediante un track de Google Play

1. Publicar la versión base de Nava en un track de pruebas y, desde Google
   Play, instalarla en el dispositivo con la misma cuenta que participa en ese
   track. Debe ser una versión que ya contiene esta integración.
2. Preparar un AAB posterior con el mismo `applicationId` y firma de carga, y
   con un `versionCode` estrictamente superior al instalado. Subirlo al mismo
   track y publicar/activar su disponibilidad para esa cuenta.
3. Esperar a que Google Play marque la nueva versión disponible para el
   dispositivo. No instalar manualmente el APK/AAB nuevo ni usar ADB como
   sustituto.
4. Abrir la versión anterior desde el lanzador. Nava consulta Play Core; si
   informa `UPDATE_AVAILABLE` y permite `FLEXIBLE`, aparece la interfaz oficial
   de Google Play. Aceptar la descarga y continuar usando Nava.
5. Al finalizar la descarga, confirmar que Nava muestra “Actualización lista”.
   Pulsar “Actualizar ahora”, verificar que Google Play instala la actualización
   y que Nava reinicia con el `versionCode` nuevo.
6. Repetir durante la descarga cerrando o llevando Nava a segundo plano; al
   regresar, si Play informa `DOWNLOADED`, el aviso de completar actualización
   debe reaparecer. Si no hay aviso, confirmar en Play Console elegibilidad de
   la cuenta, firma, `applicationId`, track y orden creciente de `versionCode`.

## Procedimiento obligatorio para AAB Android local

1. Revisar `git status` y no compilar desde cambios accidentales.
2. Incrementar conjuntamente:
   - `version` en `apps/mobile/app.json`;
   - `versionName` y el `versionCode` por defecto en
     `apps/mobile/android/app/build.gradle`.
3. Confirmar que el nuevo `versionCode` sea mayor que todos los usados en Play
   Console; un código cargado no se reutiliza, aunque la release quede borrador.
4. Ejecutar:

   ```powershell
   pnpm install --frozen-lockfile
   pnpm --filter @barber-saas/mobile typecheck
   Set-Location D:\Documentos\BarberiaSaas\apps\mobile\android
   .\gradlew.bat :app:signingReport --console=plain
   $env:NODE_ENV = 'production'
   .\gradlew.bat :app:bundleRelease --no-daemon --console=plain
   ```

5. La variante `release` debe usar la clave de carga Nava, nunca
   `debug.keystore`. Las propiedades `NAVA_UPLOAD_*` y el keystore viven fuera
   de Git.
6. Copiar el resultado de
   `android/app/build/outputs/bundle/release/app-release.aab` a
   `apps/mobile/releases/Nava-<version>-code<code>.aab` sin sobrescribir otro
   artefacto.
7. Verificar versión del manifest, firma con `jarsigner`, existencia de
   `base/assets/index.android.bundle`, ausencia de componentes OTA y SHA-256.
8. Subir solo el archivo archivado al track correcto, iniciar el rollout y
   comprobar desde Play que Ajustes muestre `<version> (build <code>)`.

### Gate de Play Console antes de enviar a revisión

1. Confirmar que la ficha, la categoría y las capturas describen una aplicación
   de gestión para barberías y no ofrecen compras, precios ni métodos de pago
   de la suscripción dentro de Android.
2. Completar o revisar Data safety con los flujos reales: cuenta y datos del
   negocio, contactos importados, fotos, ubicación al registrar la sede y
   token de notificaciones. Declarar el uso, la finalidad, cifrado en tránsito
   y la eliminación de cuenta conforme a la implementación; no copiar una
   declaración de una versión anterior.
3. Verificar desde Play Console que la URL de privacidad publicada sea
   `https://navacloud.app/tratamiento-de-datos`, que abra sin autenticación y
   que el formulario de acceso de revisores tenga credenciales de prueba o
   instrucciones válidas.
4. Confirmar en el track que el `versionCode` 35 no está usado y que el AAB
   recibido informa target API 36. Registrar track, porcentaje de rollout,
   SHA-256 y versión instalada tras la prueba física.

## Decisiones vigentes de alcance

- PostgreSQL + Prisma + API propia continúan como arquitectura oficial.
- Neon es el PostgreSQL administrado de producción.
- Android se compila localmente con Gradle; no se usa EAS Build ni OTA.
- Las suscripciones de Nava se activan fuera de la app Android. No añadir un
  enlace de pago externo dentro de la app sin revisar la política vigente de
  Google Play para el país y programa aplicables.
- PayPhone de citas genera enlaces y exige confirmación manual del negocio.
- Los productos pueden venderse públicamente, pero no generan comisión.
- Anticipos a colaboradores son anticipos de comisión, sin intereses ni cuotas.
- Préstamos a clientes y WhatsApp real están fuera del MVP.
- Idioma, moneda y zona horaria no son editables después del onboarding en el
  piloto.
- El piloto asume una sola instancia de API.

## Backlog vigente priorizado

### P0 — Antes de declarar producción estable

1. Corregir los 98 errores/1 advertencia de lint de fuente y ajustar ignores de
   `.tools`, `.eas-archive`, `.kotlin` y artefactos Android.
2. Recuperar `pnpm format:check` sin formatear artefactos generados.
3. Crear una base PostgreSQL exclusiva, aplicar las 71 migraciones y ejecutar
   las 28 integraciones omitidas.
4. Reconciliar y desplegar migraciones/código en VPS; validar salud, logs y
   recorrido real Web → OTP → gestión → Mobile.
5. Añadir pruebas de concurrencia, idempotencia y expiración para pedidos y
   endurecer su endpoint público con rate limiting/idempotencia.
6. Ejecutar E2E de los recorridos críticos: autenticación, agenda, reserva,
   Caja, comisiones, inventario/pedidos, suscripción y Admin.
7. Generar, firmar y completar aceptación física Android de `0.1.13`/35;
   registrar track,
   rollout y versión observada.
8. Ensayar restauración de Neon y documentar RPO/RTO.
9. Realizar revisión final de autorización multi-tenant, secretos, logs,
   cabeceras, CORS y rutas públicas.

### P1 — Cierre funcional del piloto

1. Implementar el abono real de reservas o retirar su configuración engañosa.
2. Definir textos legales definitivos y política comercial de cancelación,
   no-show y saldo a favor.
3. Mover fotos privadas a almacenamiento de objetos con acceso firmado o
   aceptar/documentar formalmente el costo de base64 en PostgreSQL.
4. Ocultar o terminar Lista de espera, préstamos, bloqueo/notificación/venta
   desde cliente y configuraciones “Próximamente”.
5. Decidir si pagos parciales/múltiples son requisito del piloto; hoy Caja solo
   admite cobro total por un método.
6. Registrar el commit y las migraciones exactos del despliegue posterior a
   `0ead479` del panel Admin (Usuarios Nava, navegación y Memberships), y
   conservar su aceptación como evidencia de regresión.
7. Añadir métricas, alertas y trazabilidad operativa de colas, pagos y errores.

### P2 — Después del piloto

- Checkout Web y webhooks para la suscripción Nava.
- Rate limiting distribuido y escalado horizontal.
- CAPTCHA, dispositivo, reputación y reglas antispam avanzadas.
- Permisos personalizados por colaborador y alcance por sede.
- Waitlist operativa, WhatsApp real, cuentas por cobrar, iOS y enlaces
  universales.

## Criterio de salida

Nava podrá pasar de “piloto controlado” a “producción estable” cuando todos los
P0 estén cerrados, el árbol esté limpio y reproducible, CI pase sin omisiones,
las migraciones productivas coincidan con el repositorio, exista restauración
probada y los recorridos críticos se hayan validado en Web y en el Android
realmente distribuido por Google Play.
