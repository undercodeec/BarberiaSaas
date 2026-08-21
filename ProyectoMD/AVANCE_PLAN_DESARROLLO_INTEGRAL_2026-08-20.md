# Avance del plan de desarrollo integral de Nava

> Corte: 20 de agosto de 2026
> Plan base: `PLAN_DESARROLLO_INTEGRAL_NAVA_2026-08-20.md`
> Estado de cobro real: **deshabilitado**

## Resumen ejecutivo

Se recuperaron los gates locales de formato, lint y tipos, se activaron las
integraciones contra PostgreSQL aislado y se implementó el dominio aditivo de
facturación y pagos de suscripciones. También quedó preparada la API de checkout
autenticado y la aplicación transaccional e idempotente de un pago previamente
verificado.

No se habilitó ningún cobro real. La activación continúa bloqueada por las
decisiones comerciales y tributarias, las credenciales sandbox de la cuenta de
Nava y la autorización de Notificación Externa de PayPhone.

La consulta de solo lectura a Neon reporta cuatro migraciones pendientes:
`20260820160000_member_location_online_booking`,
`20260820190000_platform_operations_center`,
`20260820203000_platform_admin_governance` y la nueva
`20260820220000_subscription_billing_domain`. No se aplicó ninguna en Neon.

## Estado por fase

| Fase | Estado                  | Evidencia o pendiente principal                                                                                                                                             |
| ---- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Parcial                 | `format:check`, `lint`, tipos y 58 pruebas API pasan. La base aislada se reconstruyó desde las 57 migraciones. Faltan SSH/VPS, reconciliación Neon, restauración y RPO/RTO. |
| 1    | Parcial, bloqueante     | Se revisó la documentación oficial vigente. Faltan credenciales, autorización PayPhone y decisiones comerciales/tributarias firmes.                                         |
| 2    | Implementada localmente | Migración `20260820220000_subscription_billing_domain`; aislamiento e idempotencia probados en PostgreSQL.                                                                  |
| 3    | Backend parcial         | Planes, sesión de compra, checkout owner, consulta de intento, expiración y aplicación verificada. No existe webhook productivo porque su autenticación no está confirmada. |
| 4    | Pendiente               | Se conserva el flujo manual de reservas; no se automatizó sin contrato verificable del proveedor.                                                                           |
| 5–7  | Parcial                 | Estados saneados y pruebas críticas del backend. Faltan checkout web completo, panel operativo, métricas/alertas, sandbox y E2E de salida.                                  |

## Contrato PayPhone confirmado públicamente

La documentación oficial consultada el 20 de agosto de 2026 establece:

- API Link crea enlaces con `POST https://pay.payphonetodoesposible.com/api/Links`.
- Los montos se expresan en centavos; `clientTransactionId` es único y tiene
  máximo 15 caracteres; existe límite de 30 solicitudes POST por minuto.
- El enlace debe abrirse directamente en navegador, no en `iframe`, y no existe
  retorno de sistema después del pago del API Link.
- La Notificación Externa informa solo transacciones aprobadas, requiere HTTPS,
  autorización previa de PayPhone y una respuesta JSON `Response/ErrorCode`.
- La guía pública de Notificación Externa no publica firma, secreto, timestamp o
  autenticación criptográfica del emisor. Por ello un payload recibido no puede
  activar una suscripción hasta verificarlo mediante un contrato acordado con el
  proveedor.

Fuentes oficiales:

- <https://docs.payphone.app/api-link>
- <https://docs.payphone.app/notificacion-externa>
- <https://docs.payphone.app/configuracion-de-ambiente-y-credenciales>

## Implementación local realizada

### Datos y auditoría

La migración nueva agrega, sin reutilizar `PaymentAttempt` de citas:

- `PlatformPaymentConfiguration`, con credencial cifrada y cuenta de Nava
  separada de las credenciales de tenants.
- `SubscriptionInvoice`, con snapshot de plan, beneficios, límites, precio,
  impuesto, período y versión de términos comerciales.
- `SubscriptionPaymentAttempt`, con referencia PayPhone de 15 caracteres,
  idempotencia por organización, estados, importes y payload minimizado.
- `PaymentProviderEvent`, con huella única, validación y procesamiento.
- `SubscriptionChange`, con antes/después de plan, estado y período.

La migración incluye restricciones de montos, moneda, tasa tributaria, índices y
claves foráneas. Los registros financieros usan `RESTRICT` o `SET NULL` para no
desaparecer por cascadas de usuario u organización.

La comparación Prisma de la base reconstruida no detecta diferencias en las
tablas nuevas. Sí conserva diferencias históricas anteriores en inventario,
productos, `PaymentAttempt`, `PayphoneConfiguration`, registros de onboarding e
índices de operaciones de plataforma; deben reconciliarse antes de un despliegue
productivo y no se corrigieron de forma retrospectiva en esta migración.

### API preparada

- `GET /v1/subscription/plans`
- `GET /v1/subscription/session`
- `POST /v1/subscription/checkout`
- `GET /v1/subscription/payments/:id`

El checkout exige sesión vigente, una sola membresía activa, rol `OWNER`,
`Idempotency-Key`, plan público con precio backend y configuración PayPhone de
plataforma lista. Rechaza cambios entre planes activos mientras no exista una
política comercial aprobada.

`PLATFORM_PAYMENTS_ENABLED=false` es el valor seguro. Para habilitarlo se exige
además una clave de cifrado exclusiva, una tasa tributaria explícita y una
versión de términos comerciales. La clave no puede ser igual a la de PayPhone
de tenants.

### Invariantes probadas

- mismo checkout repetido: una factura y un intento;
- lectura cruzada entre tenants: denegada;
- monto, moneda o Store ID distintos: no aplican;
- evento repetido: no extiende dos veces;
- aprobación exacta: factura pagada, intento aplicado, suscripción activa y
  auditoría dentro de una transacción;
- rechazo: no cambia el entitlement;
- vencimiento: marca intento y factura expirados;
- payload persistido: excluye correo, documento y otros datos sensibles.

## Rollback lógico

La migración es aditiva. Antes de desplegarla, el rollback operativo consiste en:

1. mantener `PLATFORM_PAYMENTS_ENABLED=false`;
2. desplegar el código anterior, que ignora las tablas nuevas;
3. conservar facturas, intentos, eventos y auditoría para conciliación;
4. no ejecutar `DROP TABLE`, no editar migraciones ya aplicadas y no revertir
   una suscripción pagada mediante SQL manual.

Si un release posterior falla después de aceptar pagos, se detiene únicamente la
creación de enlaces. Los intentos existentes se conservan y se concilian antes
de cualquier corrección de dominio.

## Bloqueos que requieren negocio o proveedor

1. Aprobar precios finales, tasa/impuestos, mensualidad, prueba, gracia,
   cancelación, devolución y política de cambio entre planes activos.
2. Entregar por canal seguro credenciales sandbox de la cuenta PayPhone de Nava.
3. Solicitar y obtener autorización de Notificación Externa, incluido el método
   verificable de autenticación, reintentos e IPs si aplican.
4. Definir dominio definitivo, URL registrada, emisor de comprobantes y piloto.
5. Autorizar acceso operativo a VPS/Neon para migraciones, backup, restauración y
   evidencia de RPO/RTO.

Hasta cerrar estos puntos no debe configurarse `PLATFORM_PAYMENTS_ENABLED=true`
en producción ni publicarse un webhook que otorgue acceso.
