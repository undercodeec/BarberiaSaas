Necesito modificar la integración actual de PayPhone de Nava para simplificarla durante el primer MVP.

Antes de editar, revisa completamente:

* `ProyectoMD/ESTADO_PROYECTO.md`
* `ProyectoMD/PAYPHONE_PUESTA_EN_MARCHA.md`
* El esquema Prisma y las migraciones relacionadas con PayPhone.
* La implementación actual de configuración PayPhone.
* La creación de API Link.
* El webhook `POST /v1/payphone/NotificacionPago`.
* Los flujos actuales para cobrar una cita, registrar movimientos, calcular comisiones y actualizar `AppointmentPaymentStatus`.

## Objetivo del cambio

PayPhone funcionará solamente como generador de enlaces de cobro.

Cada propietario conectará su propia cuenta PayPhone Business ingresando:

* Token.
* StoreID.
* Ambiente: Pruebas o Producción.

Nava permitirá generar y abrir el enlace para que el cliente pague con tarjeta. Sin embargo, Nava no recibirá confirmación automática del resultado.

El propietario o un usuario autorizado deberá verificar el pago en PayPhone Business y pulsar manualmente un botón dentro de Nava para registrar el cobro.

Para este MVP no se utilizará:

* Notificación Externa.
* Webhook de PayPhone.
* Consulta automática o periódica de pagos.
* API Sale para confirmar automáticamente el resultado.
* Modelo de comercio aliado o token de terceros.
* Custodia o intermediación de fondos por Nava.

## Decisiones obligatorias

### 1. Conservar la conexión PayPhone existente

Mantener:

* Configuración independiente por negocio.
* Token y StoreID.
* Ambientes Pruebas y Producción.
* Cifrado AES-256-GCM del Token.
* `PAYPHONE_CREDENTIALS_ENCRYPTION_KEY`.
* Prueba de conexión.
* Activación, desactivación, rotación y desconexión.
* El Token nunca debe regresar al cliente ni aparecer en logs, auditorías o respuestas.
* Creación de API Link con monto expresado correctamente en centavos.
* Identificador interno único e idempotente.
* Expiración del enlace después de una hora.
* Registro de cada intento de pago.

No reutilizar estas credenciales para cobrar la suscripción de Nava.

### 2. Retirar la dependencia del webhook

El flujo no debe requerir autorización de Notificación Externa.

Retirar o desactivar de forma segura:

`POST /v1/payphone/NotificacionPago`

También deben retirarse del flujo operativo:

* Procesamiento automático de notificaciones.
* Validación automática mediante API Sale.
* Cambio automático de la cita a `PAID`.
* Instrucciones que indiquen que cada barbería debe solicitar Notificación Externa.
* Configuración del webhook `https://api.navacloud.app/v1/payphone/NotificacionPago`.

No eliminar migraciones ya aplicadas ni reescribir su historial. Si el webhook debe conservarse temporalmente por compatibilidad, déjalo deshabilitado mediante configuración y sin incluirlo en el flujo del MVP. Documenta claramente la decisión.

### 3. Flujo público de pago

Después de verificar la reserva, si PayPhone está activo para el negocio:

1. Mostrar el botón `Pagar ahora con PayPhone`.
2. Solicitar al backend un API Link único para esa reserva.
3. Abrir el enlace oficial de PayPhone.
4. Permitir que el cliente complete el pago con tarjeta.
5. No mostrar `Pago aprobado` al regresar o cerrar PayPhone.
6. Mostrar un mensaje claro:

   `El pago será verificado por el negocio. Conserva tu comprobante de PayPhone.`

Nava no debe marcar la cita como pagada basándose en:

* Que el enlace haya sido creado.
* Que el cliente haya abierto PayPhone.
* Que el navegador haya regresado.
* Una respuesta controlada por el cliente.
* Una captura o parámetro de URL.

Crear o abrir el enlace solo representa un intento pendiente de verificación.

### 4. Confirmación manual desde la aplicación

En el detalle de una cita con pago pendiente, mostrar a los usuarios autorizados:

`Registrar cobro PayPhone`

El botón debe estar disponible únicamente cuando:

* La cita pertenece a la organización del usuario autenticado.
* Existe una configuración PayPhone activa.
* La cita todavía está pendiente de pago.
* Existe al menos un intento de pago PayPhone para esa cita.
* El usuario tiene el permiso actualmente utilizado para cobrar o administrar citas.

No limitarlo exclusivamente al propietario si el sistema ya permite que administrador o recepción registren cobros. Respeta el modelo de permisos vigente.

Al pulsarlo, mostrar una confirmación explícita:

**Título:** `Confirmar cobro PayPhone`

**Mensaje:**

`Antes de continuar, verifica en PayPhone Business que el pago fue aprobado y que el monto recibido coincide con el total de la cita. Nava no puede comprobar este pago automáticamente.`

Mostrar como mínimo:

* Cliente.
* Fecha de la cita.
* Total esperado.
* Moneda.
* Fecha de generación del enlace.
* Referencia interna del intento.

Solicitar:

* Confirmación obligatoria mediante checkbox:

  `Confirmo que verifiqué el pago aprobado en PayPhone Business.`

* Referencia o número de transacción PayPhone, si está disponible. Preferiblemente debe ser obligatorio para mejorar la trazabilidad; si la estructura actual no permite exigirlo sin afectar el MVP, justificar y documentar que queda opcional.

* Nota opcional.

Acción final:

`Registrar como pagado`

### 5. Registro transaccional del cobro

Crear un endpoint autenticado específico o adaptar cuidadosamente el endpoint de cobro existente.

Ejemplo semántico:

`POST /v1/appointments/:appointmentId/payphone/manual-confirmation`

El servidor debe:

1. Resolver la organización y los permisos desde la sesión, nunca desde valores confiados al cliente.
2. Verificar que la cita pertenece a esa organización.
3. Verificar que continúa pendiente.
4. Verificar que existe un intento PayPhone relacionado.
5. Tomar el importe y la moneda desde la cita o su snapshot persistido, no desde el cuerpo enviado por el cliente.
6. Registrar que la fuente de confirmación fue manual.
7. Guardar usuario, fecha, referencia y nota.
8. Actualizar la cita a `PAID`.
9. Ejecutar la conciliación de comisiones existente cuando corresponda.
10. Registrar el movimiento financiero con método PayPhone o tarjeta, siguiendo el modelo contable actual.
11. No incrementar el efectivo esperado de la caja física.
12. Crear auditoría con actor, cita, intento relacionado, importe, referencia y origen manual.
13. Ejecutar todo en una sola transacción de base de datos.

El movimiento debe quedar identificado claramente como cobro externo mediante PayPhone. No presentarlo como confirmación validada automáticamente por el proveedor.

### 6. Idempotencia y concurrencia

La confirmación manual debe ser idempotente.

* Dos pulsaciones simultáneas no pueden crear dos pagos.
* No pueden duplicarse movimientos de Wallet.
* No pueden duplicarse comisiones.
* Si la cita ya está pagada por el mismo registro, devolver un resultado exitoso estable.
* Si ya fue pagada mediante otro método, responder con un conflicto claro y no modificar datos.
* Utilizar restricciones únicas y transacciones cuando corresponda.
* No confiar solamente en comprobaciones previas realizadas en TypeScript.

### 7. Estados y textos

Distinguir claramente:

* `Enlace generado`.
* `Pendiente de verificación`.
* `Confirmado manualmente`.
* `Enlace vencido`.
* `Cancelado`, si aplica.

No utilizar nombres como:

* `Verificado por PayPhone`.
* `Confirmado por el proveedor`.
* `Pago automático`.

En Wallet y en el detalle de la cita debe mostrarse:

`Confirmado manualmente por [usuario]`

También debe mostrarse la fecha y la referencia registrada.

El historial debe conservar intentos vencidos o anteriores sin duplicar ingresos.

### 8. Seguridad

* Solo la API puede descifrar el Token.
* No enviar el Token a la aplicación móvil ni a la web pública.
* No registrar el Token en logs.
* No permitir que un usuario confirme pagos de otra organización.
* No aceptar importe, moneda, StoreID u organización enviados por el cliente como fuente de verdad.
* Aplicar rate limiting razonable a la generación de enlaces.
* Mantener la protección contra enlaces duplicados.
* Sanitizar la referencia y la nota.
* No almacenar datos de tarjetas.
* Nava no recibe, retiene ni distribuye fondos.

### 9. Interfaz de configuración

Actualizar las instrucciones de PayPhone en Wallet para explicar:

1. Crear una cuenta PayPhone Business.
2. Crear una aplicación API.
3. Obtener Token y StoreID.
4. Pegarlos en Nava.
5. Probar la conexión.
6. Activar PayPhone.
7. Verificar los pagos desde PayPhone Business antes de registrarlos en Nava.

Eliminar cualquier indicación de que el negocio debe:

* Solicitar Notificación Externa.
* Registrar un webhook.
* Esperar una confirmación automática.

Incluir esta advertencia visible:

`Nava genera el enlace de cobro, pero PayPhone no comunica automáticamente el resultado. Verifica la transacción en PayPhone Business antes de registrarla como pagada.`

Agregar un acceso externo seguro a PayPhone Business cuando sea apropiado.

### 10. Migraciones

Revisar estas migraciones existentes:

* `20260811120000_payphone_configuration`
* `20260811150000_payphone_payment_attempts`

No borrarlas ni modificarlas si ya forman parte del historial.

Crear una nueva migración solo si hace falta persistir datos como:

* Tipo de confirmación.
* Usuario que confirmó.
* Fecha de confirmación.
* Referencia PayPhone.
* Nota.
* Relación con el intento utilizado.

Utilizar nombres compatibles con las convenciones actuales del esquema.

### 11. Pruebas obligatorias

Agregar o actualizar pruebas para comprobar:

* Guardado cifrado de Token y StoreID.
* El Token nunca se devuelve al cliente.
* Generación correcta del API Link.
* Importe correcto en centavos.
* Expiración de una hora.
* Idempotencia de generación.
* Rechazo cuando PayPhone está desactivado.
* Rechazo por permisos insuficientes.
* Aislamiento entre organizaciones.
* Confirmación manual correcta.
* El importe se obtiene del servidor.
* Creación de auditoría.
* Registro en Wallet sin aumentar el efectivo físico esperado.
* Conciliación de comisión cuando la cita está completada.
* Confirmación antes de completar y conciliación posterior.
* Doble confirmación secuencial.
* Doble confirmación concurrente.
* Conflicto si la cita fue cobrada con otro método.
* Un enlace vencido no se considera pago.
* El simple retorno desde PayPhone no marca la cita como `PAID`.
* La interfaz no promete confirmación automática.

Ejecutar:

* Prisma format y validate.
* Generación de Prisma Client.
* Typecheck de API, cliente compartido, móvil y web.
* ESLint de archivos modificados.
* Pruebas unitarias.
* Pruebas API/PostgreSQL.
* Build de API.
* Exportación o build de la web pública.
* Pruebas de componentes relacionadas con Wallet y citas.

No declarar aprobadas pruebas que no hayan sido ejecutadas.

### 12. Documentación

Actualizar:

* `ProyectoMD/PAYPHONE_PUESTA_EN_MARCHA.md`
* `ProyectoMD/ESTADO_PROYECTO.md`

La documentación debe dejar claro que:

* Para cobrar solo hacen falta una cuenta PayPhone Business activa, Token y StoreID.
* Notificación Externa no forma parte del MVP.
* Nava no confirma automáticamente el pago.
* El negocio debe verificarlo en PayPhone Business.
* La confirmación dentro de Nava es manual y administrativa.
* No debe registrarse un cobro sin comprobar previamente la transacción.
* El dinero llega directamente a la cuenta PayPhone del negocio.
* Nava no custodia fondos.
* Pueden existir comisiones normales de procesamiento cobradas por PayPhone.

Eliminar de la lista de despliegue la solicitud de autorización del webhook.

Mantener como pasos de despliegue:

* Aplicar las migraciones necesarias.
* Configurar `PAYPHONE_CREDENTIALS_ENCRYPTION_KEY`.
* Reiniciar API y Web.
* Configurar Token, StoreID y ambiente por negocio.
* Probar la creación de un enlace en Pruebas.
* Realizar un pago controlado.
* Verificarlo en PayPhone Business.
* Registrarlo manualmente en Nava.
* Confirmar que la cita, Wallet, auditoría y comisión quedaron correctas.

## Restricciones

* No implementar webhook.
* No implementar polling.
* No incorporar token de terceros.
* No implementar cobro de suscripciones de Nava.
* No cambiar funcionalidades ajenas.
* No eliminar cambios simultáneos existentes.
* No realizar commits sin revisar primero el estado del árbol de trabajo.
* No desplegar a producción sin autorización expresa.
* No asumir que una cita está pagada solo porque existe un enlace.

## Entrega esperada

Al terminar, informar:

1. Archivos modificados.
2. Migración creada, si aplica.
3. Endpoint y permisos utilizados.
4. Funcionamiento exacto de la confirmación manual.
5. Tratamiento contable en Wallet.
6. Cambios realizados al webhook existente.
7. Pruebas ejecutadas y resultados reales.
8. Riesgos o validaciones manuales pendientes.
9. Comandos exactos de migración y despliegue, sin ejecutarlos en producción.
