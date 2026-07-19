# ADR 0003: PostgreSQL, Prisma y API propia en VPS

- Estado: Aceptada
- Fecha: 2026-07-18

## Contexto

La arquitectura original proponía consumir Supabase directamente. El proyecto se desplegará inicialmente en una VPS y se requiere controlar la API, la autenticación y las migraciones sin depender de servicios administrados. A futuro debe ser posible mover PostgreSQL a Supabase sin reescribir las aplicaciones cliente.

## Decisión

- PostgreSQL es la base de datos y Prisma ORM gestiona el esquema, el cliente tipado y las migraciones.
- `apps/api` es la única frontera de acceso a datos para móvil, web y admin.
- La API usa Fastify y obtiene el usuario desde una sesión opaca. El token original solo se entrega al cliente; PostgreSQL conserva su huella SHA-256.
- Las contraseñas se derivan con `scrypt`, sal aleatoria y comparación en tiempo constante.
- El móvil guarda únicamente el token de sesión en Expo Secure Store.
- El aislamiento multi-tenant se aplica en servicios de backend: la organización se resuelve desde la membresía del usuario autenticado y no desde un `organizationId` aportado por el cliente.
- El onboarding crea organización, primera sucursal, membresía owner, asignación y auditoría dentro de una única transacción Prisma.
- Las migraciones se ejecutan con `prisma migrate deploy` en un paso controlado del despliegue.
- La recuperación de contraseña usa SMTP configurable. Solo en entorno `local`, si SMTP no está configurado, la API puede devolver el token de desarrollo para permitir pruebas manuales.

## Migración futura a Supabase

Supabase puede adoptarse posteriormente como alojamiento administrado de PostgreSQL. La aplicación seguirá consumiendo la API propia y Prisma cambiará únicamente su cadena de conexión. Supabase Auth, RLS, Realtime y Storage no forman parte de la arquitectura actual; si alguno se incorpora deberá contar con un ADR y una migración específica.

## Consecuencias

- La VPS necesita operar Node.js, PostgreSQL, TLS, copias de seguridad y monitoreo.
- La autorización no puede depender de filtros de UI ni de identificadores recibidos del cliente.
- Las pruebas de aislamiento deben ejecutarse contra PostgreSQL real en CI.
- Los ADR 0001 y 0002 siguen explicando decisiones de producto y monorepositorio, pero sus decisiones específicas de Supabase, Auth, RPC y RLS quedan reemplazadas.
