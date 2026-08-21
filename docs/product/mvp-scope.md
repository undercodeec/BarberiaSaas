# Alcance activo del MVP

La fuente de verdad del estado es
[`ProyectoMD/ESTADO_PROYECTO.md`](../../ProyectoMD/ESTADO_PROYECTO.md); el
alcance de pagos y su secuencia de activación está en
[`ProyectoMD/PLAN_DESARROLLO_INTEGRAL_NAVA_2026-08-20.md`](../../ProyectoMD/PLAN_DESARROLLO_INTEGRAL_NAVA_2026-08-20.md).

## Incluido

- Identidad, OTP, sesiones, recuperación de cuenta, organizaciones, roles y
  onboarding multi-tenant.
- Equipo, servicios, horarios, bloqueos, agenda y prevención de solapamientos
  con PostgreSQL.
- Reserva web pública: catálogo, disponibilidad, OTP, gestión por token,
  reprogramación, cancelación, reseñas y recordatorios.
- Clientes e historial, Caja, ventas, comisiones, inventario, pedidos, reportes
  y notificaciones por correo/FCM.
- Planes, trial, gracia y límites aplicados en backend; aplicación móvil en modo
  solo lectura del estado de suscripción.
- Panel interno de Nava para soporte y operación, deshabilitado en producción
  mientras no exista la configuración administrativa requerida.

## Parcial o deliberadamente deshabilitado

- Los cobros reales de suscripciones Nava están deshabilitados. Existe el modelo
  de facturas/intentos y la API de checkout preparada, pero no se publicará un
  webhook ni se activará el proveedor sin credenciales sandbox, autorización de
  PayPhone y decisiones comerciales, tributarias y de soporte.
- Los pagos PayPhone de reservas y pedidos siguen con confirmación manual como
  contingencia; no hay verificación automática proveedor-a-servidor.
- No hay pagos parciales, facturación electrónica, WhatsApp real, CAPTCHA ni
  almacenamiento de objetos para imágenes.
- La web actual cubre reserva pública; un checkout de suscripción autenticado
  requiere definir primero la sesión web segura y su experiencia de login.

La arquitectura vigente es PostgreSQL + Prisma + API Node/Fastify según ADR 0003. Las aplicaciones cliente no consumen Supabase directamente.
