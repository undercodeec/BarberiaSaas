# SaaS móvil para barberías

Base técnica del MVP descrito en `INSTRUCCIONES_CODEX_BARBER_SAAS.md`. El nombre del repositorio es únicamente un nombre de trabajo y no una marca comercial.

## Estado

La **Fase 0 — Inicialización del repositorio** está implementada. No existen todavía autenticación, tablas de negocio, agenda, reservas, caja ni comisiones.

## Requisitos

- Node.js 24 LTS.
- pnpm 11.
- Docker Desktop o un motor compatible con Docker, para Supabase local.
- Git.

## Inicio rápido

```bash
pnpm install
cp .env.example .env.local
pnpm supabase:start
pnpm dev
```

En Windows PowerShell, copie el entorno con:

```powershell
Copy-Item .env.example .env.local
```

Servicios locales:

- Web pública: `http://localhost:3000`.
- Panel interno: `http://localhost:3001`.
- Expo: dirección mostrada por `pnpm dev:mobile`.
- API de Supabase: `http://127.0.0.1:54321`.
- Supabase Studio: `http://127.0.0.1:54323`.

Para ejecutar una sola aplicación:

```bash
pnpm dev:web
pnpm dev:admin
pnpm dev:mobile
```

## Verificación

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Playwright necesita sus navegadores una vez por máquina:

```bash
pnpm exec playwright install chromium
```

## Estructura

```text
apps/
  admin/       Panel interno mínimo del operador
  mobile/      Aplicación Expo para el equipo de la barbería
  web/         Sitio público y futura reserva web
packages/
  api-client/  Transporte compartido hacia el backend
  config/      Constantes de configuración comunes
  database/    Punto de entrada para tipos generados de Supabase
  design-tokens/ Tokens visuales compartidos
  domain/      Primitivas de dominio sin dependencias de UI
  permissions/ Decisiones de autorización compartidas
  test-utils/  Utilidades deterministas de prueba
  validation/  Esquemas Zod compartidos
supabase/      Configuración, migraciones, seed y Edge Functions
docs/          Decisiones, producto, base de datos y pruebas
```

## Variables de entorno y seguridad

Use `.env.example` como catálogo. Los archivos `.env*` reales están ignorados. `SUPABASE_SERVICE_ROLE_KEY` es exclusivamente de servidor y nunca debe aparecer en componentes móviles, navegador ni variables con prefijo público.

No se debe confiar en identificadores de organización enviados por clientes. El aislamiento multi-tenant, las políticas RLS y sus pruebas se implementarán en la Fase 1 antes de introducir datos operativos.

## Flujo de desarrollo

Cada cambio debe pasar formato, lint, tipos, pruebas y build. Las decisiones relevantes se documentan en `docs/adr`; las migraciones nuevas son acumulativas, reversibles y no se editan después de aplicarse.
