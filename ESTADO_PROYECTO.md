# Estado del proyecto

Seguimiento basado en `INSTRUCCIONES_CODEX_BARBER_SAAS.md` y en la decisión posterior documentada en `docs/adr/0003-postgresql-prisma-y-api-en-vps.md`. Se marca `[x]` solo cuando la tarea está implementada y cuenta con la verificación indicada; `[ ]` significa pendiente o aún no demostrada.

Última actualización: 2026-07-19

## Decisión de infraestructura vigente

- [x] PostgreSQL como base de datos inicial.
- [x] Prisma ORM 7 para esquema, cliente tipado y migraciones.
- [x] API Node/Fastify como única frontera de datos para los clientes.
- [x] Despliegue inicial preparado para una VPS.
- [x] Estrategia de migración futura a PostgreSQL administrado por Supabase sin acoplar el móvil a Supabase.
- [x] Supabase Auth, RPC, RLS, Storage y Realtime retirados de la implementación actual.
- [x] Snapshot PostgreSQL + Prisma incluido en el commit actual del repositorio.

## Resumen por fases

- [x] Fase 0 — Inicialización del repositorio
- [ ] Fase 1 — Autenticación, organización y onboarding _(implementada; integración PostgreSQL pendiente de ejecución)_
- [ ] Fase 2 — Equipo, servicios y horarios
- [ ] Fase 3 — Motor de agenda
- [ ] Fase 4 — Reservas públicas
- [ ] Fase 5 — Clientes e historial
- [ ] Fase 6 — Caja y POS básico
- [ ] Fase 7 — Comisiones
- [ ] Fase 8 — Inventario básico
- [ ] Fase 9 — Notificaciones
- [ ] Fase 10 — Reportes esenciales
- [ ] Fase 11 — Planes y límites
- [ ] Fase 12 — Panel interno del SaaS
- [ ] Fase 13 — Estabilización del MVP

## Fase 0 — Inicialización del repositorio

- [x] Monorepositorio con pnpm y Turborepo.
- [x] Aplicaciones `mobile`, `web` y `admin` ejecutables.
- [x] Paquetes compartidos iniciales.
- [x] TypeScript estricto, ESLint y Prettier.
- [x] Catálogo de variables de entorno sin secretos reales.
- [x] Vitest, Jest Expo y Playwright configurados.
- [x] GitHub Actions configurado.
- [x] README y ADR inicial creados.
- [x] PostgreSQL y Mailpit definidos para desarrollo en `compose.yaml`.
- [ ] Arranque de los contenedores locales verificado en esta máquina — Docker no está instalado.

## Fase 1 — Autenticación, organización y onboarding

### Base de datos

- [x] Esquema Prisma para usuarios, sesiones y recuperación de contraseña.
- [x] Esquema Prisma para organizaciones, sucursales, membresías y asignaciones.
- [x] Roles y estados modelados como enums.
- [x] Auditoría del onboarding modelada.
- [x] Migración inicial PostgreSQL creada.
- [x] Script de reversa documentado.
- [x] Cliente Prisma 7 generado correctamente.
- [x] Esquema Prisma validado estáticamente.
- [ ] Migración aplicada correctamente contra PostgreSQL local.

### API y seguridad

- [x] Registro por correo con normalización y contraseña derivada mediante `scrypt`.
- [x] Inicio y cierre de sesión.
- [x] Sesiones opacas: el cliente recibe el token y PostgreSQL guarda únicamente SHA-256.
- [x] Restauración y revocación de sesiones.
- [x] Recuperación y cambio de contraseña con tokens de un solo uso.
- [x] Envío de recuperación desacoplado mediante SMTP configurable.
- [x] Onboarding ejecutado en una única transacción Prisma.
- [x] La organización autorizada se deriva de la sesión y membresía del servidor.
- [x] La API no confía en `organizationId` enviado por el cliente.
- [x] Bundle ejecutable de la API generado para Node.js en VPS.
- [x] Bundle iniciado y endpoint `/health` verificado con HTTP 200.
- [ ] Flujo completo de correo probado contra SMTP real.

### Aplicación móvil

- [x] Pantalla de bienvenida.
- [x] Pantalla de inicio de sesión.
- [x] Pantalla de registro.
- [x] Pantalla de recuperación y cambio de contraseña.
- [x] Pantalla para crear barbería.
- [x] Pantalla para configurar sucursal.
- [x] Resumen y finalización del onboarding.
- [x] Sesión persistida con Expo Secure Store.
- [x] Cliente Supabase eliminado; Expo consume exclusivamente la API HTTP propia.
- [x] URL pública de la API validada mediante Zod.

### Pruebas y calidad

- [x] Pruebas unitarias de criptografía, validación, permisos, transporte y componente móvil creadas.
- [x] Prueba de integración para onboarding atómico creada.
- [x] Prueba de aislamiento entre dos organizaciones creada.
- [x] Tipos aprobados en base de datos, validación, cliente API, API y móvil.
- [x] Pruebas unitarias ejecutadas: 13 aprobadas.
- [x] Bundle de la API generado correctamente.
- [ ] Dos pruebas de integración PostgreSQL ejecutadas — requieren `TEST_DATABASE_URL` y un PostgreSQL disponible.
- [x] Formato, lint, tipos, pruebas unitarias y builds del monorepositorio aprobados después del cambio de arquitectura.

## Fases pendientes

### Fase 2 — Equipo, servicios y horarios

- [ ] Profesionales, invitaciones, servicios, categorías, horarios, bloqueos, permisos y auditoría.

### Fase 3 — Motor de agenda

- [ ] Citas, disponibilidad, transacciones críticas, doble reserva, tiempo real y concurrencia.

### Fase 4 — Reservas públicas

- [ ] Reserva web pública, idempotencia, tokens de gestión y rate limiting.

### Fase 5 — Clientes e historial

- [ ] Clientes, búsqueda, historial, notas, fotografías privadas y eliminación lógica.

### Fase 6 — Caja y POS básico

- [ ] Apertura, ventas, pagos, gastos, retiros, cierre y auditoría.

### Fase 7 — Comisiones

- [ ] Reglas, cálculo backend, snapshots, liquidaciones y reversión.

### Fase 8 — Inventario básico

- [ ] Productos, stock por sucursal, movimientos, ajustes y alertas.

### Fase 9 — Notificaciones

- [ ] Plantillas, cola, proveedores mock/console, reintentos y recordatorios.

### Fase 10 — Reportes esenciales

- [ ] Reportes diarios, filtros, permisos, zona horaria y CSV.

### Fase 11 — Planes y límites

- [ ] Trial, planes, límites backend, feature flags y suspensión simulada.

### Fase 12 — Panel interno del SaaS

- [ ] Operación de organizaciones, planes, uso, errores y soporte seguro.

### Fase 13 — Estabilización del MVP

- [ ] Seguridad, E2E, rendimiento, accesibilidad, backups y checklist de producción.

## Evidencia de la última verificación

- Commit base de Fase 0: `45080b7`.
- Prisma Client 7.8.0: generado correctamente.
- TypeScript en los 12 paquetes del monorepositorio: aprobado.
- Vitest: 12 pruebas aprobadas y 2 de integración omitidas sin PostgreSQL.
- Jest Expo: 1 prueba aprobada.
- API: bundle de Node.js generado correctamente.
- API: arranque del bundle y `GET /health` verificados con HTTP 200.
- Docker/PostgreSQL local: no disponible en esta máquina; CI queda configurado para aplicar la migración y ejecutar aislamiento.

## Siguiente tarea recomendada

- [ ] Ejecutar la migración y las pruebas de integración contra PostgreSQL, corregir cualquier diferencia real y cerrar la Fase 1 antes de iniciar la Fase 2.
