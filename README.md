# Nava — SaaS para barberías

Monorepositorio del MVP cuyo estado vigente se documenta en [`ProyectoMD/ESTADO_PROYECTO.md`](./ProyectoMD/ESTADO_PROYECTO.md). La arquitectura actual es PostgreSQL + Prisma + API Node/Fastify propia desplegada en VPS; consulte [`ADR 0003`](./docs/adr/0003-postgresql-prisma-y-api-en-vps.md).

## Estado

El MVP ya cubre identidad y onboarding multi-tenant, equipo, agenda, reservas
públicas, clientes, Caja, comisiones, inventario, notificaciones, reportes,
planes con límites y un panel interno. Los pagos reales de suscripción Nava y la
verificación automática de PayPhone permanecen deshabilitados hasta disponer de
credenciales sandbox, contrato de notificaciones y decisiones comerciales.

El estado verificable y sus pendientes viven en
[`ProyectoMD/ESTADO_PROYECTO.md`](./ProyectoMD/ESTADO_PROYECTO.md). El avance
del plan de pagos está en
[`ProyectoMD/AVANCE_PLAN_DESARROLLO_INTEGRAL_2026-08-20.md`](./ProyectoMD/AVANCE_PLAN_DESARROLLO_INTEGRAL_2026-08-20.md).

Las invitaciones de equipo y la recuperación de contraseña usan SMTP. En local
puede utilizarse Mailpit; en producción debe configurarse un proveedor real.

Consulta el [procedimiento de despliegue de producción](./docs/deployment/production.md)
para configurar Web y Admin en la VPS sin guardar variables reales en Git.

## Requisitos

- Node.js 24 LTS.
- pnpm 11.
- PostgreSQL 18; opcionalmente Docker para el entorno local.
- Git.

## Inicio local

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate:deploy
pnpm dev:api
pnpm dev:mobile
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate:deploy
pnpm dev:api
```

Servicios locales:

- API: `http://127.0.0.1:4000`; salud en `/health`.
- PostgreSQL: `127.0.0.1:5432`.
- PostgreSQL exclusivo de pruebas: `127.0.0.1:5433`.
- Mailpit SMTP: `127.0.0.1:1025`; interfaz en `http://127.0.0.1:8025`.
- Web pública: `http://localhost:3000`.
- Panel interno: `http://localhost:3001`.

Para probar la aplicación en un dispositivo físico, cambie
`EXPO_PUBLIC_API_URL` por la IP LAN de la VPS o del equipo; `127.0.0.1` dentro
del teléfono apunta al propio teléfono.

## Release Android local

Los AAB de Google Play se generan localmente con Gradle, sin EAS Build ni
actualizaciones OTA. Antes de incrementar una versión, compilar o publicar,
siga el [procedimiento obligatorio para AAB Android local](./ProyectoMD/ESTADO_PROYECTO.md#procedimiento-obligatorio-para-aab-android-local).

## Verificación

```bash
pnpm db:validate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Las pruebas PostgreSQL usan exclusivamente `TEST_DATABASE_URL`, ya que limpian
sus tablas durante la ejecución. `compose.yaml` expone la base exclusiva
`barber_saas_test` en el puerto `5433`; nunca apunte esta variable a desarrollo o
producción. Antes de ejecutarlas aplique las migraciones usando temporalmente esa
URL como `DATABASE_URL`.

## Estructura

```text
apps/
  api/         API Fastify, autenticación y autorización multi-tenant
  mobile/      Aplicación React Native con Expo SDK para módulos locales
  web/         Sitio público y reserva web
  admin/       Panel interno del operador
packages/
  api-client/  Transporte y contratos HTTP compartidos
  database/    Prisma schema, migraciones y cliente PostgreSQL
  validation/  Esquemas Zod compartidos
  permissions/ Reglas de permisos
  domain/      Reglas de dominio sin UI
docs/          ADR, esquema, producto y estrategia de pruebas
```

## VPS y migración futura

En producción, configure variables mediante el gestor de secretos del servidor, ejecute `pnpm db:migrate:deploy` como paso controlado y luego inicie `apps/api/dist/index.js`. PostgreSQL debe usar TLS, copias de seguridad y un usuario con privilegios mínimos.

Si el proyecto escala, PostgreSQL puede alojarse en Supabase cambiando `DATABASE_URL`. Las aplicaciones continuarán usando la API propia; adoptar Auth, RLS, Storage o Realtime de Supabase requerirá una decisión y migración separadas.
