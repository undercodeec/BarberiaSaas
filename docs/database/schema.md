# Esquema de datos — Fase 1

La fuente de verdad es [`packages/database/prisma/schema.prisma`](../../packages/database/prisma/schema.prisma). PostgreSQL usa `snake_case`; Prisma expone propiedades `camelCase` a TypeScript.

## Identidad

- `users`: cuenta personal, correo normalizado, nombre y hash de contraseña.
- `sessions`: sesiones opacas con hash SHA-256, expiración y revocación.
- `password_reset_tokens`: tokens de un solo uso con expiración de 30 minutos.

Nunca se persisten contraseñas ni tokens originales. Restablecer una contraseña revoca todas las sesiones activas del usuario.

## Multi-tenant

- `organizations`: tenant y configuración predeterminada.
- `locations`: sucursales pertenecientes a una organización.
- `memberships`: relación usuario-organización con rol y estado.
- `member_locations`: sucursales accesibles para una membresía.
- `audit_logs`: evidencia inmutable de operaciones críticas.

El cliente no elige la organización que autoriza una operación. La API obtiene el usuario desde la sesión y resuelve una membresía activa. El endpoint de organización actual ignora cualquier `organizationId` externo.

## Onboarding

`POST /v1/onboarding` valida la entrada con Zod y ejecuta una transacción Prisma que crea:

1. organización;
2. primera sucursal;
3. membresía `OWNER`;
4. asignación a la sucursal;
5. registro de auditoría.

Un fallo revierte la operación completa.

## Migraciones

- Migración inicial: `20260718190000_initial_identity_and_tenancy`.
- Reversa documentada: `prisma/rollbacks/20260718190000_initial_identity_and_tenancy.down.sql`.
- Desarrollo: `pnpm db:migrate:dev`.
- VPS/CI: `pnpm db:migrate:deploy`.

Una migración aplicada no se edita. Los cambios posteriores crean otra migración acumulativa.
