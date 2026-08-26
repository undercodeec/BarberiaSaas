Encontramos la causa exacta del HTTP 502 en el nuevo flujo PayPhone Web Button.

NO hagas cambios arquitectónicos ni modificaciones fuera de este bug.

Contexto comprobado directamente contra PayPhone TEST:

POST:
https://pay.payphonetodoesposible.com/api/button/Prepare

responde HTTP 200 con este formato real:

{
  "paymentId": "oFkxo6mcEkKkniovVofxBw",
  "payWithPayPhone": "https://pay.payphonetodoesposible.com/PayPhone/Index?paymentId=oFkxo6mcEkKkniovVofxBw",
  "payWithCard": "https://pay.payphonetodoesposible.com/Anonymous/Index?paymentId=oFkxo6mcEkKkniovVofxBw"
}

El problema está en:

apps/api/src/payphone-web-button.ts

Actualmente prepareResponseSchema tiene:

paymentId: z.coerce.number().int().positive().optional()

Esto es incorrecto porque PayPhone devuelve paymentId como identificador alfanumérico string.

CORREGIR:

1. paymentId debe admitir el formato real de PayPhone como string no vacío.

Preferiblemente implementar de forma compatible:

paymentId: z
  .union([
    z.string().trim().min(1),
    z.number().int().positive()
  ])
  .transform(String)
  .optional()

o una solución equivalente que siempre normalice paymentId a string.

2. No convertir paymentId a Number.

3. Mantener paymentId dentro de providerPayload como string.

4. NO confundir paymentId de Prepare con el id/transactionId utilizado posteriormente por Button/V2/Confirm.

5. Mantener sin cambios:
   - payWithCard
   - payWithPayPhone
   - Token cifrado
   - StoreId
   - Prepare
   - Confirm
   - flujo de suscripciones
   - webhook auxiliar
   - idempotencia

6. Agregar/actualizar pruebas para cubrir explícitamente:

Prepare HTTP 200 con:

paymentId: "oFkxo6mcEkKkniovVofxBw"

y verificar que:
- el schema lo acepta;
- paymentUrl usa payWithCard;
- providerPayload.paymentId conserva exactamente el string recibido;
- no genera PAYPHONE_PREPARE_INVALID_RESPONSE.

Agregar también prueba con otro paymentId alfanumérico para evitar regresión.

7. Ejecutar:
- tests específicos PayPhone Web Button
- typecheck API
- build API

8. No realizar migraciones de base de datos porque no deberían ser necesarias para este cambio.

Al finalizar dime:
- archivo modificado;
- pruebas ejecutadas;
- resultado;
- comandos exactos para commit/push;
- comandos exactos para desplegar solo esta corrección en VPS.

No habilites ni deshabilites PLATFORM_PAYMENTS_ENABLED automáticamente.