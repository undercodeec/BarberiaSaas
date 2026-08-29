# Política de notificaciones operativas

## Objetivo

Completar la matriz de notificaciones de Nava sin transformar cada evento en
interrupciones innecesarias. Cada evento debe conservarse en la bandeja de la
aplicación; el envío push se limita a destinatarios autorizados por organización,
sucursal, rol y preferencias individuales.

## Alcance

Esta fase consolida los cambios de trabajo existentes y añade:

- Recordatorio de cita próxima al profesional asignado.
- Alertas operativas de caja, inventario, equipo, reseñas y suscripción.
- Avisos de cambio de rol, sucursal o agenda al colaborador afectado y a los
  responsables pertinentes.
- Preferencias por usuario para silenciar categorías no críticas de push.
- Destinos móviles para cada tipo de notificación.

Quedan fuera los avisos de seguridad, cobros rechazados por un proveedor externo
y el correo transaccional de facturación. Esos flujos requieren eventos y canales
propios y no se resuelven inventando notificaciones locales.

## Destinatarios y categorías

El emisor nunca recibe su propio push. Los destinatarios se deduplican por
usuario y se restringen a membresías activas de la organización. Para eventos de
sucursal, los gerentes y recepcionistas deben estar asignados a esa sucursal; los
propietarios pueden recibir el evento de cualquiera de las sucursales.

| Categoría | Eventos | Destinatarios base |
| --- | --- | --- |
| Agenda | cita creada, cancelada, reprogramada, recordatorio | profesional asignado; propietarios, gerentes y recepción de la sucursal cuando corresponda |
| Cobros | confirmación de cobro pendiente | propietarios y gerentes de la sucursal |
| Caja | cierre normal, cierre con diferencia | propietarios y gerentes de la sucursal |
| Inventario | stock alcanza el mínimo | propietarios y gerentes de la sucursal |
| Equipo | invitación aceptada, rol/sucursal/agenda modificados | el miembro afectado; propietarios y gerentes pertinentes |
| Reseñas | calificación de 1 a 3 | propietarios y gerentes de la sucursal |
| Suscripción | renovación próxima | propietarios |

Los avisos críticos presentes y futuros de seguridad y facturación no pueden
silenciarse. El resto se podrá silenciar como categoría de push sin eliminar el
registro de la bandeja.

## Diseño de datos y entrega

Se incorporará una tabla de preferencias, con clave única `(userId, category)`,
un indicador `pushEnabled` y fechas de auditoría. La categoría será un enum
estable en Prisma, independiente de los `AppNotificationType`; así varios tipos
de una misma familia comparten una preferencia.

El servicio de notificación central resolverá el tipo a categoría, eliminará al
actor, deduplicará los usuarios y consultará sus preferencias antes de crear las
entregas. Para que la bandeja siga siendo completa, se creará siempre el
`AppNotification`; cuando el push esté silenciado, su estado de entrega quedará
como `skipped`, no como `pending`. Los tipos críticos ignoran una preferencia de
silencio.

La API ofrecerá un `GET` que devuelve las preferencias efectivas y un `PUT` para
actualizar las categorías permitidas del usuario autenticado. No permitirá que
un usuario cambie preferencias de otra persona ni escriba categorías críticas.

## Integraciones

`createQueuedAppointmentNotifier` pasa a ser el punto común para crear la
bandeja y encolar push. Las rutas de agenda, caja, inventario, reservas públicas,
operaciones de equipo y recordatorios de suscripción solo describen el evento y
sus destinatarios autorizados.

La actualización `PATCH /v1/team/members/:id` comparará rol, sucursales y datos
de agenda antes y después de la transacción. Emitirá una única notificación de
equipo si cambió alguno de esos elementos. Los cambios de agenda individual se
notificarán desde la ruta que reemplaza horarios, usando el propietario de la
agenda como afectado.

El programador de recordatorios buscará citas que aún no tengan una notificación
de tipo `APPOINTMENT_REMINDER`, no citas sin ninguna notificación. La creación
del recordatorio conserva además la comprobación de idempotencia por cita,
profesional y tipo.

La app móvil continuará confiando en el tipo y la ruta entregados por el API,
pero ampliará su lista autorizada y sus pruebas para caja, inventario, equipo,
reseñas, suscripción y recordatorios.

## Errores y consistencia

Una falla al persistir o enviar push no revierte la operación que la originó. La
cola existente reintentará entregas `pending`; las silenciadas no se reintentan.
Las consultas de preferencias fallan de manera abierta hacia los valores por
defecto: una preferencia ausente significa push habilitado para categorías no
críticas.

Las notificaciones se generan después de confirmar la transacción de negocio,
por lo que nunca anuncian una operación posteriormente revertida. Los filtros de
rol y sucursal ocurren antes de persistir las entregas.

## Pruebas y verificación

- Pruebas unitarias para mapear tipo a categoría, filtrar actor, deduplicar y
  aplicar preferencias.
- Pruebas de integración de API para baja de stock, diferencia de caja, reseña
  negativa, aceptación y actualización de equipo, recordatorio y suscripción.
- Pruebas de preferencias: valor por defecto, silencio de push conservando
  bandeja, rechazo de categorías críticas y aislamiento entre usuarios.
- Pruebas móviles de navegación para los nuevos tipos y de ruta no autorizada.
- Migración de Prisma, typecheck del API y suite de pruebas relevante.
