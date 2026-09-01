Implementa ahora el diagnóstico mínimo y seguro para identificar por qué PayPhone rechaza el request real de Nava.

Ya fue confirmado mediante curl desde el mismo VPS que PayPhone funciona correctamente con el Token y StoreId productivos y devuelve correctamente:

paymentId
payWithPayPhone
payWithCard

Por tanto, NO modificar credenciales, StoreId, entorno, DATABASE_URL, Nginx ni cifrado.

## Objetivo

Cuando:

POST /v1/subscription/checkout

termine en:

PAYPHONE_PREPARE_REJECTED

quiero que el backend registre de forma estructurada y segura la respuesta real de PayPhone y el contexto NO sensible del request.

## Implementación

Revisa principalmente:

apps/api/src/payphone-web-button.ts
apps/api/src/subscription-payments.ts

Actualmente existe algo equivalente a:

const payload = await responseJson(response);

if (!response.ok)
throw new ApiError(
502,
'PAYPHONE_PREPARE_REJECTED',
'PayPhone rechazó la preparación del pago.',
);

El problema es que `payload` se pierde.

Modifica el diseño mínimamente para conservar información diagnóstica segura del rechazo de PayPhone.

Quiero poder registrar:

* HTTP status devuelto por PayPhone
* Code o errorCode
* Message o message
* errors de validación, si existen
* amount
* amountWithoutTax
* amountWithTax
* tax
* service
* tip
* currency
* clientTransactionId
* clientTransactionIdLength
* reference
* responseUrl
* cancellationUrl
* hostname de responseUrl
* hostname de cancellationUrl
* longitud del StoreId o StoreId parcialmente enmascarado

## Seguridad obligatoria

NUNCA registrar:

* Bearer Token
* token descifrado
* encryptedToken
* PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY
* Authorization header
* DATABASE_URL
* secretos completos

Preferiblemente tampoco registrar StoreId completo.

## Importante

El usuario final debe seguir recibiendo un error genérico y seguro.

Por ejemplo:

HTTP 502
PAYPHONE_PREPARE_REJECTED
"PayPhone rechazó la preparación del pago."

El detalle del proveedor solo debe aparecer en logs internos del backend.

## Payload

Además, quiero que el log permita comparar el request REAL enviado por Nava contra este request manual que YA FUNCIONÓ:

{
"amount": 200,
"amountWithoutTax": 200,
"clientTransactionId": "NAVA200428",
"currency": "USD",
"storeId": "...",
"reference": "Prueba Nava",
"responseUrl": "https://navacloud.app/checkout/payphone/confirm"
}

No modificar todavía los campos del request de Nava.

Primero necesitamos obtener evidencia del rechazo real.

## Tests obligatorios

Añade tests que validen:

1. PayPhone HTTP 400 +:
   {
   "Code": 1001,
   "Message": "Esta solicitud no cumple los parámetros necesarios"
   }

2. PayPhone HTTP 400 con:
   errorCode
   message
   errors[]

3. El diagnóstico conserva Code/Message/errors.

4. Nunca aparece el Bearer Token en logs ni errores.

5. Nunca aparece PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY.

6. El StoreId no aparece completo.

7. El endpoint público continúa devolviendo 502 genérico.

8. Un Prepare exitoso sigue devolviendo correctamente:
   paymentId
   payWithCard
   payWithPayPhone

## No hacer

* No eliminar campos de Prepare todavía.
* No cambiar clientTransactionId.
* No cambiar importes.
* No cambiar URLs.
* No cambiar token.
* No cambiar StoreId.
* No tocar base de datos.
* No crear migraciones.
* No modificar infraestructura.
* No hacer cambios móviles.

## Verificación

Ejecuta las pruebas relacionadas con:

payphone-web-button
subscription-payments

y cualquier test afectado.

Después explícame:

1. Archivos modificados.
2. Cómo se sanea la información.
3. Qué se registrará exactamente.
4. Qué secretos quedan explícitamente excluidos.
5. Tests ejecutados y resultado.
6. Comandos exactos que debo ejecutar en el VPS para desplegar únicamente este cambio y luego observar el próximo intento de pago.

El objetivo de este cambio es DIAGNÓSTICO, no intentar corregir todavía el rechazo de PayPhone.
