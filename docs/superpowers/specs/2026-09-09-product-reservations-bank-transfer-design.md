# Reservas de productos por transferencia y pago al retirar

## Estado

Diseño aprobado para revisión técnica. Esta especificación no autoriza por sí
sola cambios en esquema, API ni UI.

## Objetivo

Reemplazar el pago con tarjeta/PayPhone de las compras públicas de productos por
dos alternativas claras:

- transferencia bancaria con adelanto elegido por el cliente; y
- pago al retirar en la sucursal.

El owner o manager configura los datos bancarios de su organización y el
mínimo de reserva de cada producto. El cliente puede adelantar un importe
igual o mayor que la suma de esos mínimos, sin superar el total del pedido. La
transferencia se comprueba manualmente al retirar; no se suben comprobantes ni
se integra conciliación bancaria en esta etapa.

PayPhone permanece disponible para las suscripciones de Nava y para cualquier
flujo ajeno a los pedidos de productos. Solo se elimina del checkout de
productos y de su API pública.

## Decisiones de producto

| Tema | Decisión |
| --- | --- |
| Métodos de compra de producto | `transfer` y `pickup`; no se ofrece ni acepta `card`. |
| Mínimo de reserva | Se configura por producto en centavos, con mínimo de USD 1.00. |
| Pedido con varios productos | El mínimo exigible es la suma de `mínimo del producto × cantidad` de cada línea. |
| Adelanto | El cliente escoge el importe en transferencia; debe estar entre el mínimo agregado y el total del pedido. |
| Pago al retirar | No requiere adelanto; reserva stock por el plazo vigente de retiro. |
| Validación | Un owner o manager valida la transferencia y cobra cualquier saldo solamente al entregar el pedido. |
| Datos bancarios | Una cuenta activa por organización, editable por owner/manager. Se entrega solo tras crear un pedido por transferencia y en su correo. |
| Correo | Email obligatorio para pedidos públicos: se envía comprobante de reserva al crearla y recibo de pago al cobrar el total. |
| Comprobante | Los dos correos usan el lenguaje visual del recibo de suscripciones, pero se identifican como comprobantes comerciales del negocio; no son factura SRI. |

## Modelo de datos

### Configuración bancaria de la organización

Se agrega `OrganizationBankTransferSettings` con relación uno a uno con
`Organization`:

- `bankName`;
- `accountHolderName`;
- `accountType` (`checking`, `savings` u `other`);
- `accountNumber`;
- `holderIdentification`;
- `instructions` opcionales;
- `isEnabled`, fechas de creación/actualización y usuario que la actualizó.

Los números de cuenta no son secretos de procesamiento como las credenciales de
PayPhone, pero no se incluyen en el catálogo público. El servidor crea en cada
pedido por transferencia un snapshot de los datos que mostró al cliente para
conservar evidencia si la organización cambia su cuenta posteriormente.

### Productos y pedido

`Product` incorpora `minimumReservationCents`, obligatorio, entero y mayor o
igual a `100`. Los productos existentes se migran a `100`; el owner/manager
podrá aumentarlo o, si el negocio no desea adelanto para ese producto, dejarlo
en el mínimo de USD 1.00.

`ProductOrder` incorpora:

- `declaredReservationCents` nullable: importe que el cliente dice transferir;
- `bankTransferSnapshot` nullable: datos bancarios e instrucciones serializados;
- `reservationEmailSentAt` y `paymentReceiptEmailSentAt` para idempotencia de
  entregas;
- referencias de comprobante de reserva y de recibo final.

El precio, nombre y mínimo de cada producto se copian a `ProductOrderItem` al
crear el pedido. Por ello, editar un producto no cambia el compromiso mostrado
en un pedido ya creado.

La validación de cobro no debe asumir que el adelanto cubre todo el pedido. En
la entrega se recibe una lista de pagos que suma exactamente `totalCents`; por
ejemplo, USD 5 transferidos antes y USD 12 en efectivo al retirar. El servidor
crea los movimientos de caja y descuenta el stock en una única transacción. No
se persisten pagos parciales: el adelanto declarado es una intención hasta que
el personal lo valide en la entrega.

## Flujos

### Configuración del negocio

En móvil, owner y manager encuentran `Inventario → Cobros de productos`:

1. Sección **Cuenta para transferencias** con banco, titular, tipo, número,
   identificación, instrucciones y estado activo.
2. La acción de guardar valida campos requeridos y muestra una vista de lectura
   enmascarada fuera del formulario.
3. En crear/editar producto se añade **Mínimo para reservar por transferencia**
   en dólares; acepta dos decimales y nunca menos de USD 1.00.
4. La lista de pedidos muestra total, adelanto declarado, saldo pendiente y
   método elegido, sin presentar el adelanto como dinero confirmado.

La configuración no estará disponible para barber ni receptionist. La API debe
verificar rol; ocultar la sección no es autorización suficiente.

### Checkout público

El catálogo público incluye el mínimo de reserva de cada producto. El carrito:

1. Oculta por completo **Tarjeta / PayPhone**.
2. Ofrece **Transferencia** y **Pagar al retirar**.
3. Para transferencia, calcula y muestra el mínimo agregado, un campo de
   adelanto editable y el saldo estimado al retirar.
4. Exige email, nombre y teléfono antes de crear cualquier pedido.
5. Para `pickup`, no muestra campo de adelanto ni datos bancarios.

Al crear una transferencia, la respuesta contiene el código de pedido, la
fecha de expiración y el snapshot bancario. La confirmación web y el correo
indican que la transferencia será revisada al retiro y que el saldo debe
cancelarse entonces. Si la organización no tiene una cuenta activa, la opción
de transferencia no se muestra; `pickup` sigue disponible.

El pedido queda `RESERVED` y el stock se reserva, pero no queda pagado ni se
prepara como entregable. Se conserva el plazo actual de reserva de retiro para
ambos métodos; al expirar, el trabajo existente libera el stock. No se genera
movimiento de caja por un adelanto no validado.

### Entrega, validación y cobro

Desde `Inventario → Pedidos`, owner/manager abre un pedido reservado y pulsa
**Validar y cobrar al entregar**. El formulario propone el adelanto declarado
como transferencia y el saldo como efectivo, pero permite corregir importes y
métodos después de verificar el dinero.

El endpoint exige que:

- el pedido sea de la organización y de una sucursal accesible;
- la caja de esa sucursal esté abierta;
- cada importe sea positivo, use `cash` o `transfer`, y la suma sea igual al
  total del pedido;
- el pedido siga vigente y tenga stock reservado suficiente.

En una transacción se crean movimientos de caja por cada forma de pago, se
descuenta inventario, se elimina la reserva de stock, se registra auditoría y
el pedido pasa a `PAID`. El flujo existente de `READY_FOR_PICKUP` y
`FULFILLED` se conserva después del cobro. Una operación repetida no vuelve a
cobrar ni envía otro recibo.

## API y permisos

Las rutas exactas pueden ajustarse a las convenciones existentes, pero el
contrato queda así:

- `GET/PATCH /v1/product-payment-settings`: owner/manager; lectura y edición
  de la cuenta bancaria de la organización.
- Actualizaciones de producto: incluyen `minimumReservationCents`; validado
  entre `100` y el precio de venta del producto.
- `POST /v1/public/:organizationSlug/:locationSlug/orders`: acepta solo
  `transfer|pickup`; para transferencia requiere `reservationAmountCents` y
  email, verifica cuenta activa, mínimo agregado y máximo total. Responde el
  snapshot bancario solo a la creación exitosa de ese pedido.
- Catálogo público: expone `minimumReservationCents` y si la transferencia
  está habilitada para esa organización, pero nunca el número de cuenta.
- `POST /v1/product-orders/:orderId/confirm-payment`: reemplaza el único
  método por `payments: [{ amountCents, method, providerReference? }]` y exige
  suma exacta. `card` deja de ser válido para pedidos nuevos; permanece en
  tipos y datos históricos para lectura compatible.

Los registros de auditoría incluyen quién editó la cuenta, el snapshot usado,
el adelanto declarado y quién validó/cobró el pedido. Los datos bancarios no
se escriben en logs de error ni se incluyen en listados de pedidos generales.

## Correos y comprobantes

### Comprobante de reserva

Se envía inmediatamente tras crear el pedido, una sola vez, al email
obligatorio del cliente. Incluye código, productos, total, adelanto declarado,
saldo estimado, vencimiento, sucursal y, para transferencia, los datos
bancarios snapshot e instrucciones. El encabezado aclara **Reserva pendiente
de validación al retirar**; no declara que haya dinero recibido.

### Recibo final de pago

Se envía una sola vez cuando la operación de entrega registra el total. Incluye
productos, desglose por método/importe, total, fecha, sucursal y código de
pedido. Se adjunta un PDF con el mismo lenguaje visual del recibo temporal de
suscripciones, adaptado a productos y con el aviso de que no es factura
electrónica ni comprobante autorizado por el SRI.

Ambos correos se encolan de manera idempotente y con reintentos. Un fallo de
envío nunca revierte la reserva ni el cobro; se registra para reintento.

## Compatibilidad y migración

1. Crear tablas/campos nuevos nullable cuando corresponda y poblar mínimos de
   productos existentes con `100` centavos.
2. Conservar `CARD`, `paymentUrl` y referencias de PayPhone para pedidos
   históricos; no borrar ni reinterpretar cobros existentes.
3. Publicar primero las validaciones de API que rechazan `card` en pedidos
   nuevos, luego ocultar tarjeta en la web. Así una UI antigua tampoco podrá
   crear enlaces PayPhone.
4. No cambiar el checkout de suscripciones ni las rutas de PayPhone de Nava.
5. Ejecutar una migración reversible y validar que el trabajo de expiración
   solo libere stock de pedidos sin pago registrado, como ahora.

## Pruebas de aceptación

1. Owner/manager configura una cuenta; barber/receptionist no pueden leerla ni
   modificarla por URL directa.
2. Un producto con mínimo USD 3 y cantidad 2 exige al menos USD 6 de adelanto;
   USD 5.99 y un importe mayor al total son rechazados.
3. El checkout público no muestra tarjeta/PayPhone y su API rechaza `card`
   aunque un cliente antiguo lo envíe.
4. Transferencia sin cuenta activa se oculta en la web y se rechaza en servidor;
   pago al retirar aún crea una reserva válida.
5. La respuesta y el correo de transferencia contienen el snapshot correcto;
   cambiar la cuenta después no altera el pedido anterior.
6. Crear una reserva envía exactamente un comprobante y no registra ingreso de
   caja ni descuento de stock definitivo.
7. Al entregar, USD 5 por transferencia y USD 12 en efectivo que completan el
   total crean dos movimientos de caja, descuentan el stock una vez y envían un
   único recibo final.
8. Confirmar de nuevo, cobrar una suma distinta del total, usar una caja cerrada
   o procesar un pedido vencido falla sin cambiar stock ni caja.
9. Pedidos históricos con tarjeta se siguen mostrando, pero no reciben los
   nuevos flujos ni son modificados por la migración.
