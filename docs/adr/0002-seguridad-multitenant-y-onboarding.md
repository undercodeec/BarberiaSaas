# ADR 0002: Seguridad multi-tenant y onboarding transaccional

- Estado: Reemplazada por ADR 0003
- Fecha: 2026-07-18

## Contexto

El cliente móvil necesita crear la primera barbería y sucursal sin recibir privilegios administrativos ni poder elegir la identidad del propietario. Las inserciones independientes pueden dejar organizaciones incompletas y confiar en `organization_id` del cliente permite acceso horizontal indebido.

## Decisión

- La pertenencia se representa mediante `memberships`; no se deduce desde parámetros del cliente.
- Las políticas RLS consultan funciones auxiliares que comparan membresías activas con `auth.uid()`.
- El onboarding usa una única RPC `security definer` que crea organización, sucursal, owner, asignación y auditoría dentro de la misma transacción.
- La RPC valida nuevamente nombres, slugs, teléfonos, país, moneda y zona horaria.
- El cliente usa la clave pública y conserva la sesión mediante Expo Secure Store. `service_role` no se incluye en móvil.
- El rol `platform_admin` permanece fuera de las membresías de barberías.

## Consecuencias

- Un fallo revierte todo el onboarding y no deja tenants parciales.
- Modificar el `organization_id` enviado en consultas no concede acceso porque RLS verifica la sesión.
- Las pruebas de aislamiento requieren PostgreSQL/Supabase real; los mocks unitarios no son evidencia suficiente.
- Invitaciones y administración avanzada del equipo se mantienen fuera de Fase 1.
