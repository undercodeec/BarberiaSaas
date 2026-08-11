# Puesta en marcha de PayPhone para el MVP

PayPhone se usa solo para generar enlaces de cobro de las reservas de cada
negocio. El dinero llega directamente a la cuenta PayPhone Business del
negocio. Nava no recibe, retiene ni distribuye fondos ni datos de tarjetas.

## 1. Desplegar Nava

```bash
cd /opt/nava/app
sudo -u nava pnpm install --frozen-lockfile
sudo -u nava pnpm --filter @barber-saas/database db:generate
sudo -u nava pnpm --filter @barber-saas/database db:migrate:deploy
sudo systemctl restart nava-api.service
sudo systemctl restart nava-web.service
curl -fsS https://api.navacloud.app/health
```

Las migraciones requeridas son:

- `20260811120000_payphone_configuration`
- `20260811150000_payphone_payment_attempts`
- `20260811170000_payphone_manual_confirmation`

## 2. Proteger las credenciales

Genere una clave una sola vez en la VPS y guárdela exclusivamente en
`/etc/nava/api.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
sudoedit /etc/nava/api.env
```

```dotenv
PAYPHONE_CREDENTIALS_ENCRYPTION_KEY=valor_base64_generado
```

No guarde esta clave ni los Token de los negocios en Git, EAS, la app móvil ni
el navegador. Si se pierde la clave, cada negocio deberá guardar de nuevo sus
credenciales.

## 3. Configurar PayPhone por negocio

1. Cree o ingrese a una cuenta PayPhone Business activa.
2. Cree un usuario Desarrollador asociado a la tienda y cree una aplicación de
   tipo API, inicialmente en ambiente Pruebas.
3. En Credenciales copie solamente `Token` y `StoreID`.
4. En Nava abra `Ajustes > Nava Wallet > Configuración > PayPhone`; seleccione
   Pruebas o Producción, pegue los campos y guarde.
5. Pulse `Probar conexión`. La prueba crea un API Link de USD 0.01 que vence en
   una hora; crear el enlace no cobra por sí mismo.
6. Cuando el estado sea Conectado, active PayPhone.

El video de apoyo disponible en Wallet requiere solamente el tramo de 1:00 a
4:00 para obtener Token y StoreID.

## 4. Flujo de una reserva

1. El cliente verifica la reserva y puede pulsar `Pagar ahora con PayPhone`.
2. Nava crea un API Link único con el importe de la cita en centavos, una
   referencia interna y vencimiento de una hora.
3. El cliente completa el pago directamente en PayPhone. Nava muestra:
   `El pago será verificado por el negocio. Conserva tu comprobante de PayPhone.`
4. Un usuario con permiso para administrar citas entra a la cita, verifica en
   PayPhone Business el cobro y pulsa `Registrar cobro PayPhone`.
5. Debe indicar la referencia de PayPhone, confirmar expresamente la
   verificación y puede registrar una nota.
6. Nava registra la cita como pagada, el movimiento como venta con tarjeta y la
   auditoría. El efectivo esperado de Caja no aumenta; la conciliación de
   comisiones se ejecuta cuando la cita está completada.

La confirmación es manual y administrativa. No registre un cobro sin comprobar
antes la transacción y el importe en PayPhone Business. PayPhone puede cobrar
sus comisiones normales de procesamiento.

## 5. Alcance y prueba

Notificación Externa, webhook, polling y API Sale no forman parte de este MVP.
Nava no confirma pagos automáticamente ni supone que un enlace creado, abierto
o cerrado equivale a un pago.

Pruebe en Pruebas:

1. Cree y abra un enlace de una reserva.
2. Realice un pago controlado en PayPhone.
3. Verifique el movimiento en PayPhone Business.
4. Abra una Caja en Nava, registre manualmente el cobro con la referencia.
5. Confirme que la cita queda `PAID`, Wallet lo muestra como tarjeta, el
   efectivo esperado no cambia, la auditoría existe y no se duplican cobros al
   repetir la acción.

No configure webhooks de PayPhone para este flujo.
