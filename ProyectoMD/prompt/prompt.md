# Objetivo

Modificar exclusivamente el flujo de **pagos de suscripciones de la plataforma NAVA** para utilizar **PayPhone Botón de Pago WEB con Prepare + Confirm**, haciendo que la confirmación autenticada servidor-a-servidor contra PayPhone sea la única autoridad que pueda activar o renovar una suscripción.

No reconstruyas desde cero el dominio de suscripciones existente.

Antes de modificar código, inspecciona completamente la implementación actual y reutiliza todo lo que sea compatible.

---

# Contexto actual

NAVA ya tiene implementado:

* Dominio de suscripciones.
* `SubscriptionInvoice`.
* `SubscriptionPaymentAttempt`.
* `PaymentProviderEvent`.
* `SubscriptionChange`.
* `PlatformPaymentConfiguration`.
* Credenciales PayPhone cifradas mediante AES-256-GCM.
* `PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY`.
* Checkout autenticado en `/checkout`.
* Sesión almacenada mediante cookie `HttpOnly`.
* Idempotencia en creación de checkout.
* Validaciones de organización y rol `OWNER`.
* Precio obtenido siempre desde backend.
* Estados de factura, intento y suscripción.
* Aplicación transaccional e idempotente de pagos.
* Webhook actual:

`POST /v1/webhooks/payphone/platform`

* Interruptor global:

`PLATFORM_PAYMENTS_ENABLED`

Actualmente las suscripciones utilizan o están preparadas alrededor de **API Link + Notificación Externa**.

Quiero cambiar solamente el mecanismo de pago de suscripciones de NAVA.

Las integraciones PayPhone particulares de cada barbería/tenant NO deben modificarse.

---

# Nueva arquitectura

Implementar:

```text
Usuario
   ↓
navacloud.app/checkout
   ↓
Backend NAVA
   ↓
PayPhone Button/Prepare
   ↓
URL segura entregada por PayPhone
   ↓
Usuario paga con tarjeta
   ↓
PayPhone redirige a NAVA
   ↓
NAVA recibe:
- id
- clientTransactionId
   ↓
Backend NAVA
   ↓
PayPhone Button/V2/Confirm
   ↓
PayPhone devuelve estado real
   ↓
NAVA valida
   ↓
SubscriptionInvoice = PAID
SubscriptionPaymentAttempt = APPLIED
Subscription = ACTIVE
```

La confirmación de la transacción debe realizarse **exclusivamente desde el backend**.

Nunca llamar a `Confirm` directamente desde JavaScript del navegador porque el Bearer Token jamás debe exponerse al frontend.

---

# Endpoints oficiales PayPhone

Utilizar la API oficial del Botón de Pago.

Preparación:

```text
POST /api/button/Prepare
```

Confirmación:

```text
POST /api/button/V2/Confirm
```

Ambos contra el host oficial de pagos de PayPhone.

Autenticación:

```text
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

No hardcodear Token ni StoreID.

Obtenerlos de la configuración cifrada de plataforma.

---

# IMPORTANTE: aplicación PayPhone tipo WEB

El Botón de Pago PayPhone requiere una aplicación de PayPhone Developer de tipo:

```text
WEB
```

No asumir que las credenciales actuales de la aplicación tipo `API` sirven automáticamente para Botón de Pago.

Revisa cómo está diseñado `PlatformPaymentConfiguration`.

Si es necesario diferenciar credenciales, realiza el cambio mínimo y limpio para soportar una configuración de plataforma destinada al:

```text
PAYPHONE_WEB_BUTTON
```

o mecanismo equivalente consistente con la arquitectura existente.

Debe seguir almacenándose el Token cifrado.

Nunca mostrar el Token:

* en logs;
* en respuestas API;
* en frontend;
* en errores;
* en commits.

Si todavía no existen credenciales WEB, deja la implementación preparada y al final indícame exactamente qué Token y StoreID debo cargar manualmente.

No bloquees el desarrollo por no tener aún esas credenciales.

---

# 1. Preparación de pago

Cuando el OWNER seleccione un plan de pago:

1. Validar sesión.
2. Validar organización.
3. Validar rol `OWNER`.
4. Validar plan.
5. Obtener precio exclusivamente del backend.
6. Crear/reutilizar `SubscriptionInvoice`.
7. Crear/reutilizar `SubscriptionPaymentAttempt`.
8. Generar `clientTransactionId` único.
9. Mantener la idempotencia existente.
10. Ejecutar PayPhone `Button/Prepare`.

Para NAVA actualmente:

```text
currency = USD
PLATFORM_SUBSCRIPTION_TAX_BASIS_POINTS=0
```

Todos los montos enviados a PayPhone deben estar expresados en centavos.

Validar siempre:

```text
amount =
amountWithoutTax +
amountWithTax +
tax +
service +
tip
```

Para una suscripción sin impuesto usar la representación mínima compatible con la documentación oficial, por ejemplo conceptualmente:

```text
amount = precio_en_centavos
amountWithoutTax = precio_en_centavos
currency = USD
clientTransactionId = referencia_unica
storeId = StoreID de NAVA
reference = nombre/referencia de suscripción
responseUrl = callback de NAVA
```

No enviar valores tributarios inventados.

---

# 2. URL de respuesta

Implementar una URL específica para el retorno de PayPhone.

Puede ser, si encaja con la arquitectura existente:

```text
https://navacloud.app/checkout/payphone/confirm
```

o una ruta equivalente.

Debe recibir los parámetros retornados por PayPhone:

```text
id
clientTransactionId
```

IMPORTANTE:

La presencia de estos parámetros NO significa que el pago esté aprobado.

Nunca activar una suscripción simplemente porque el usuario regresó desde PayPhone.

---

# 3. Confirmación servidor-a-servidor

Al recibir:

```text
id
clientTransactionId
```

el backend debe localizar exclusivamente el `SubscriptionPaymentAttempt` correspondiente.

Después ejecutar:

```text
POST /api/button/V2/Confirm
```

con:

```json
{
  "id": "<PayPhone transaction id>",
  "clientTxId": "<clientTransactionId>"
}
```

utilizando el Bearer Token cifrado de NAVA.

Esta llamada debe ejecutarse desde el servidor.

---

# 4. Regla de autoridad

A partir de esta implementación:

## ÚNICA AUTORIDAD PARA ACTIVAR SUSCRIPCIÓN

Respuesta autenticada obtenida directamente desde:

```text
PayPhone Button/V2/Confirm
```

Un:

* redirect;
* query parameter;
* webhook;
* callback del navegador;

por sí solo NO puede activar una suscripción.

---

# 5. Validaciones obligatorias

Antes de aplicar el pago comprobar como mínimo:

```text
transactionStatus === "Approved"
statusCode === 3
```

Además validar contra los datos almacenados previamente:

* `clientTransactionId`;
* monto esperado;
* moneda `USD`;
* factura asociada;
* intento asociado;
* organización;
* plan;
* configuración PayPhone usada;
* que el intento no haya sido aplicado anteriormente.

No confiar en valores enviados por el navegador para:

* monto;
* plan;
* organización;
* precio;
* duración;
* impuestos.

El backend continúa siendo la fuente de verdad.

Si la respuesta oficial de `Confirm` no devuelve alguno de estos campos, no inventar una validación imposible. Validar todos los campos disponibles y documentar cuáles no pueden contrastarse directamente.

---

# 6. Aplicación transaccional

Reutilizar la lógica transaccional existente.

Una confirmación válida debe producir exactamente una vez:

```text
SubscriptionPaymentAttempt -> APPLIED
SubscriptionInvoice -> PAID
Subscription -> ACTIVE
SubscriptionChange -> auditoría
```

Mantener el período comercial actual:

```text
billingPeriodDays = 30
```

Un reintento, refresh del navegador o segunda llamada a confirmación NO puede sumar otros 30 días.

La operación debe continuar siendo idempotente.

---

# 7. Regla crítica de PayPhone: 5 minutos

PayPhone establece que la fase `Confirm` debe ejecutarse dentro de los primeros **5 minutos posteriores al pago**.

Si no se confirma dentro de ese período, PayPhone puede realizar un reverso automático.

Por tanto:

* ejecutar `Confirm` inmediatamente al regresar de PayPhone;
* no utilizar colas lentas para esta operación;
* manejar correctamente timeout de red;
* permitir retry controlado e idempotente;
* nunca asumir `PAID` ante timeout;
* dejar el intento en estado conciliable cuando el resultado sea incierto.

No crear una segunda compra automáticamente ante un timeout.

---

# 8. Webhook existente

NO eliminar inmediatamente:

```text
POST /v1/webhooks/payphone/platform
```

Pero cambiar su responsabilidad.

La Notificación Externa NO debe tener autoridad para:

```text
Subscription = ACTIVE
```

El webhook puede conservarse para:

* auditoría;
* observabilidad;
* conciliación;
* detección de eventos;
* registro de `PaymentProviderEvent`;
* diagnóstico.

Si actualmente `processWebhook()` o una función equivalente aplica directamente entitlement, refactorizar esa dependencia.

Debe quedar claramente separado:

```text
Webhook recibido
!=
Pago confirmado
```

y:

```text
Confirm autenticado contra PayPhone
=
puede aplicar pago
```

---

# 9. Allowlist de IPs

Al utilizar `Button/V2/Confirm` como autoridad de pago, la activación de suscripciones NO debe depender de:

```text
PLATFORM_PAYPHONE_WEBHOOK_ALLOWED_IPS
```

Antes de eliminar cualquier variable, busca todas sus referencias.

Si solamente existe para autenticar el webhook de suscripciones, conviértela en control opcional del webhook o retírala de forma segura.

No elimines mecanismos utilizados en otras partes del sistema.

De igual manera, no modifiques globalmente:

```text
API_TRUST_PROXY
```

sin revisar previamente todas sus dependencias.

No cambies configuración Nginx únicamente para poder confiar en la IP del webhook.

---

# 10. Frontend

Actualizar `/checkout` manteniendo el diseño actual.

Flujo esperado:

```text
Seleccionar plan
↓
Pagar con PayPhone
↓
backend prepara transacción
↓
redirigir al formulario PayPhone
↓
usuario paga
↓
PayPhone vuelve a NAVA
↓
NAVA confirma backend-to-backend
↓
mostrar resultado
```

Estados mínimos:

```text
Preparando pago...
Redirigiendo a PayPhone...
Confirmando pago...
Pago aprobado
Pago rechazado
Pago cancelado
No pudimos confirmar el pago
```

Nunca mostrar al usuario:

* Token;
* StoreID innecesariamente;
* payload completo de PayPhone;
* datos internos;
* stack traces.

---

# 11. Cancelación

Configurar `cancellationUrl` hacia una ruta adecuada de NAVA.

Una cancelación:

* no activa plan;
* no marca factura como pagada;
* no crea una segunda factura;
* permite al usuario regresar al checkout.

---

# 12. Datos sensibles

Mantener la política actual de minimización.

Aunque `Confirm` pueda devolver información como:

* email;
* documento;
* BIN;
* últimos dígitos;
* teléfono;

NO persistir esos datos salvo que exista una necesidad funcional explícita.

Guardar solamente lo indispensable para:

* conciliación;
* identificación de transacción;
* auditoría;
* estado;
* importe;
* moneda;
* referencia PayPhone.

No almacenar datos de tarjeta.

---

# 13. Pruebas

Agregar pruebas automatizadas como mínimo para:

### Pago aprobado

```text
Prepare OK
Confirm statusCode=3
transactionStatus=Approved
```

Resultado:

```text
invoice=PAID
attempt=APPLIED
subscription=ACTIVE
```

### Confirm repetido

Ejecutar dos veces la misma confirmación.

Resultado:

```text
solo una aplicación
solo un período agregado
```

### clientTransactionId incorrecto

Resultado:

```text
rechazado
sin entitlement
```

### monto incorrecto

Resultado:

```text
rechazado
sin entitlement
```

### moneda incorrecta

Resultado:

```text
rechazado
sin entitlement
```

### pago rechazado

Resultado:

```text
sin entitlement
```

### cancelación

Resultado:

```text
sin entitlement
```

### timeout de PayPhone

Resultado:

```text
sin marcar PAID
sin entitlement
estado conciliable
```

### callback falso

Simular manualmente:

```text
?id=123&clientTransactionId=...
```

sin que PayPhone confirme la transacción.

Resultado:

```text
NO activar suscripción
```

### refresh

Refrescar página después de una aprobación.

Resultado:

```text
NO extender nuevamente la suscripción
```

### webhook falso

Enviar POST manual al webhook.

Resultado:

```text
puede quedar auditado/rechazado según implementación
NO activar suscripción
```

---

# 14. Sandbox primero

No habilitar producción automáticamente.

Mantener:

```text
PLATFORM_PAYMENTS_ENABLED=false
```

hasta terminar la implementación.

Después de compilar, migrar y probar, indicarme exactamente qué debo hacer manualmente para realizar el primer ensayo sandbox.

No ejecutar compras reales.

---

# 15. Migraciones

Antes de crear una migración nueva:

1. inspeccionar el esquema actual;
2. determinar si realmente hace falta modificar tablas;
3. reutilizar columnas existentes cuando semánticamente correspondan.

No crear tablas duplicadas.

No modificar migraciones antiguas ya aplicadas.

Si hace falta una migración, debe ser:

* aditiva;
* segura;
* compatible con rollback lógico;
* sin borrar historial financiero.

---

# 16. No modificar integraciones de barberías

Existen integraciones PayPhone correspondientes a los tenants/barberías.

Este cambio corresponde EXCLUSIVAMENTE al cobro que **NAVA realiza por sus propias suscripciones**.

No tocar:

```text
PayphoneConfiguration
```

o mecanismos de cobro de reservas de las barberías salvo que el análisis demuestre que comparten código genérico y sea imprescindible hacer un cambio compatible.

Las credenciales PayPhone de NAVA deben continuar completamente separadas de las de los tenants.

---

# 17. Verificación técnica

Ejecuta los gates disponibles en el repositorio:

* format;
* lint;
* typecheck;
* tests;
* build;
* migraciones/status de BD cuando corresponda.

No declares terminada la implementación si alguno falla.

---

# 18. Documentación

Actualizar:

```text
ESTADO_PROYECTO.md
```

y el documento de avance correspondiente.

Debe quedar registrado que:

```text
API Link dejó de ser el flujo principal de suscripciones
```

y que ahora:

```text
PayPhone Botón de Pago WEB
Prepare
+
Button/V2/Confirm
```

es el flujo principal.

Registrar además que:

```text
Notificación Externa = mecanismo auxiliar
Confirm API = autoridad de pago
```

---

# 19. Resultado que debes entregarme

Cuando termines, no me des solamente un resumen genérico.

Quiero:

## A. Auditoría inicial

Qué encontraste actualmente y qué decidiste reutilizar.

## B. Archivos modificados

Lista exacta.

## C. Migraciones

Indicar si fueron necesarias.

## D. Flujo final

Explícalo brevemente.

## E. Seguridad

Confirma que ningún redirect o webhook puede activar una suscripción sin verificación PayPhone.

## F. Variables

Dime exactamente cuáles:

* permanecen;
* se agregan;
* dejan de utilizarse.

Sin mostrar secretos.

## G. Configuración manual PayPhone

Indícame qué tengo que crear/configurar en PayPhone Developer para la aplicación tipo WEB:

* dominio;
* URL de respuesta;
* Token;
* StoreID.

## H. VPS

Dame los comandos exactos necesarios para desplegar los cambios en mi VPS, pero NO los ejecutes por tu cuenta.

## I. Sandbox

Dame el procedimiento exacto para hacer una sola compra de prueba y comprobar:

```text
Prepare
→ pago
→ redirect
→ Confirm
→ Invoice PAID
→ Attempt APPLIED
→ Subscription ACTIVE
```

## J. Gate final

No habilites pagos reales.

Al final dime explícitamente:

```text
LISTO PARA SANDBOX
```

o:

```text
NO LISTO PARA SANDBOX
```

y enumera cualquier bloqueo restante.
