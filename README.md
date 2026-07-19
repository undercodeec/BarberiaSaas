# SaaS móvil para barberías

Monorepositorio del MVP descrito en `INSTRUCCIONES_CODEX_BARBER_SAAS.md`. La decisión vigente es PostgreSQL + Prisma + API Node propia desplegada en VPS; consulte [`ADR 0003`](./docs/adr/0003-postgresql-prisma-y-api-en-vps.md).

## Estado

La Fase 0 está completada. La Fase 1 contiene autenticación, sesiones, organizaciones, sucursales y onboarding; su verificación de integración con PostgreSQL está preparada para CI y pendiente de ejecutarse en esta máquina. El detalle verificable vive en [`ESTADO_PROYECTO.md`](./ESTADO_PROYECTO.md).

Todavía no existen profesionales, servicios, agenda, reservas, caja ni comisiones.

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
- Mailpit SMTP: `127.0.0.1:1025`; interfaz en `http://127.0.0.1:8025`.
- Web pública: `http://localhost:3000`.
- Panel interno: `http://localhost:3001`.

Para probar Expo en un dispositivo físico, cambie `EXPO_PUBLIC_API_URL` por la IP LAN de la VPS o del equipo; `127.0.0.1` dentro del teléfono apunta al propio teléfono.

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

Las pruebas PostgreSQL usan exclusivamente `TEST_DATABASE_URL`, ya que limpian sus tablas durante la ejecución.

## Estructura

```text
apps/
  api/         API Fastify, autenticación y autorización multi-tenant
  mobile/      Aplicación Expo para el equipo de la barbería
  web/         Sitio público y futura reserva web
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
