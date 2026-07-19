# Estrategia de pruebas

## Niveles

- Unitarias: validadores, permisos, cliente HTTP, criptografía y componentes.
- Integración: API + Prisma + PostgreSQL real.
- E2E: flujos web y, cuando exista infraestructura de dispositivos, móvil.

## Aislamiento multi-tenant

`apps/api/src/app.integration.test.ts` crea dos propietarios y dos organizaciones. Luego intenta influir en la consulta del primer usuario enviando el identificador de la segunda organización. La API debe devolver únicamente el tenant derivado de la primera sesión y no filtrar datos del segundo.

La suite destructiva de integración solo se habilita con `TEST_DATABASE_URL`, para evitar limpiar accidentalmente una base de desarrollo o producción. GitHub Actions levanta PostgreSQL, aplica las migraciones y ejecuta esa suite.

## Comandos

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Para integración local use una base exclusiva:

```bash
TEST_DATABASE_URL=postgresql://... pnpm --filter @barber-saas/api test
```

No use una base con datos reales como `TEST_DATABASE_URL`.
