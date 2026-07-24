# Esquema de datos — Fases 1 a 3

La fuente de verdad es [`packages/database/prisma/schema.prisma`](../../packages/database/prisma/schema.prisma). PostgreSQL usa `snake_case`; Prisma expone propiedades `camelCase` a TypeScript.

## Identidad

- `users`: cuenta personal, correo normalizado, nombre y hash de contraseña. El
  hash puede ser nulo únicamente mientras una cuenta invitada no se haya reclamado.
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

La versión actual admite una sola organización activa por cuenta. El onboarding y
la aceptación de invitaciones rechazan una segunda membresía activa hasta que se
implemente un selector explícito de organización.

## Onboarding

`POST /v1/onboarding` valida la entrada con Zod y ejecuta una transacción Prisma que crea:

1. organización;
2. primera sucursal;
3. membresía `OWNER`;
4. asignación a la sucursal;
5. registro de auditoría.

Un fallo revierte la operación completa.

## Equipo, servicios y capacidad operativa

- `team_invitations`: invitaciones con token original no persistido, huella
  SHA-256, expiración y estado.
- `service_categories`: agrupación de servicios por organización.
- `services`: precio y duración base con restricciones PostgreSQL.
- `professional_services`: asignación por profesional y sucursal, con precio y
  duración personalizados opcionales.
- `weekly_schedules`: intervalos semanales por profesional y sucursal.
- `schedule_blocks`: ausencias y bloqueos temporales.

La API valida pertenencia de organización y sucursal. Los cambios de configuración
generan registros en `audit_logs`.

Crear una invitación también crea o reutiliza una membresía `INVITED`. El
propietario puede configurar al profesional desde ese momento, pero la persona
invitada solo obtiene permisos después de registrarse con el correo destinatario y
aceptar el enlace enviado por SMTP.

## Motor de agenda

- `appointments`: cita, profesional, sucursal, cliente básico, rango temporal,
  estado y señal `reserves_slot`.
- `appointment_services`: snapshot inmutable del nombre, precio y duración de cada
  servicio al crear la cita.
- `appointment_events`: secuencia durable de eventos para sincronización
  incremental entre dispositivos.

La duración se calcula en backend usando las asignaciones vigentes. La restricción
de exclusión PostgreSQL `appointments_no_professional_overlap`, basada en
`btree_gist`, impide rangos superpuestos para un profesional cuando ambos registros
reservan horario.

## Migraciones

- Migración inicial: `20260718190000_initial_identity_and_tenancy`.
- Equipo, servicios y horarios: `20260719170000_team_services_and_schedules`.
- Motor de agenda: `20260719210000_appointment_engine`.
- Perfiles reclamables: `20260723120000_claimable_team_members`.
- Reversa documentada: `prisma/rollbacks/20260718190000_initial_identity_and_tenancy.down.sql`.
- Desarrollo: `pnpm db:migrate:dev`.
- VPS/CI: `pnpm db:migrate:deploy`.

Una migración aplicada no se edita. Los cambios posteriores crean otra migración acumulativa.
