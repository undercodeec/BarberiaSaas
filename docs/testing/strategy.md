# Estrategia de pruebas

## Niveles

- Unitarias: validadores, permisos, cliente HTTP, criptografía y componentes.
- Integración: API + Prisma + PostgreSQL real.
- E2E: flujos web y, cuando exista infraestructura de dispositivos, móvil.

## Aislamiento multi-tenant

`apps/api/src/app.integration.test.ts` crea dos propietarios y dos organizaciones. Luego intenta influir en la consulta del primer usuario enviando el identificador de la segunda organización. La API debe devolver únicamente el tenant derivado de la primera sesión y no filtrar datos del segundo.

La suite destructiva de integración solo se habilita con `TEST_DATABASE_URL`, para evitar limpiar accidentalmente una base de desarrollo o producción. GitHub Actions levanta PostgreSQL, aplica las migraciones y ejecuta esa suite.

También se verifica que una cuenta no pueda aceptar una segunda organización
mientras la aplicación no tenga selector explícito de contexto.

## Equipo, servicios y horarios

La integración cubre creación del perfil `INVITED`, entrega del enlace mediante
el contrato de correo, configuración previa a la aceptación, denegación de acceso
al invitado, aceptación, categorías, servicios, horarios, bloqueos, visibilidad
del barbero y registros de auditoría.

## Agenda

La integración comprueba disponibilidad, duración, bloqueos, límites de jornada,
reprogramación, cancelación, liberación del horario y eventos incrementales. Dos
solicitudes concurrentes para el mismo profesional y rango deben producir una sola
cita y una respuesta `409`.

El móvil consulta `/v1/appointment-events` cada dos segundos y vuelve a cargar
agenda y disponibilidad cuando recibe eventos nuevos. Esta estrategia sustituye
Realtime en la arquitectura vigente.

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

```powershell
$env:TEST_DATABASE_URL='postgresql://barber_saas:change-me-local-only@127.0.0.1:5433/barber_saas_test?schema=public'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
pnpm db:migrate:deploy
pnpm --filter @barber-saas/api test
```

No use una base con datos reales como `TEST_DATABASE_URL`.
