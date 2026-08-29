# Confirmacion de cobro por servicio

> Estado: implementado localmente. Requiere aplicar la migracion de base de datos.

## Regla operativa

Completar una cita y cobrarla son eventos distintos.

1. El barbero marca la cita como `completed` desde su agenda.
2. Si el negocio tiene activa la confirmacion de cobro, la cita sigue `PENDING`
   en pago, se guarda quien la completo y se genera una notificacion para los
   owner y manager con acceso a esa sucursal.
3. Owner o manager abre **Caja > Cobros por confirmar**, revisa cliente,
   profesional, servicios e importe, elige el medio de pago y confirma.
4. Solo la confirmacion crea el movimiento real en Caja, marca la cita `PAID`
   y permite la conciliacion de comisiones existente.

Por tanto, un servicio terminado no aumenta Caja por si solo, y el arqueo del
dia solo toma cobros aprobados por el rol financiero.

## Configuracion por negocio

La opcion **Confirmar cobro al terminar el servicio** se encuentra en
Configuracion avanzada > Politica de reservas. Su valor inicial es activado.

- Activada: al completar, crea una solicitud de confirmacion.
- Desactivada: no crea la solicitud automatica; el cobro continua siendo una
  accion manual de owner/manager desde Caja.

El endpoint admite clientes antiguos que no envien la nueva opcion y conserva
el valor previamente configurado, para evitar cortes durante la actualizacion
de la aplicacion movil.

## Seguridad y trazabilidad

- Barbero no puede consultar ni modificar Caja, ni ver cobros pendientes.
- Owner y manager solo ven solicitudes de sus sucursales autorizadas.
- La solicitud conserva fecha, usuario que completo la cita, profesional,
  cliente y lineas de servicio.
- El movimiento de Caja conserva la atribucion del profesional y el usuario
  que registro el cobro, sin duplicar ingresos.

## Persistencia

La migracion `20260829130000_service_payment_confirmation` agrega la
configuracion a `organizations`, el estado de solicitud a `appointments` y el
tipo de notificacion correspondiente.
