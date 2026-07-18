# Esquema de base de datos

## Estado de Fase 0

No existen tablas de negocio ni migraciones en esta fase. Supabase local está configurado y el directorio `supabase/migrations` está preparado.

La Fase 1 introducirá perfiles, organizaciones, sucursales, membresías, roles, RLS y pruebas de aislamiento multi-tenant. Las fechas se almacenarán en UTC y los datos operativos incluirán `organization_id` y `location_id` cuando corresponda.
