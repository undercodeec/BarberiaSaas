# Avance del plan de desarrollo integral de Nava

> Corte inicial: 20 de agosto de 2026
> Actualización operativa: 21 de agosto de 2026
> Plan base: `PLAN_DESARROLLO_INTEGRAL_NAVA_2026-08-20.md`
> Estado de cobro real: **deshabilitado**

## Resumen ejecutivo

Se recuperaron los gates locales de formato, lint y tipos, se activaron las
integraciones contra PostgreSQL aislado y se implementó el dominio aditivo de
facturación y pagos de suscripciones. También quedó preparada la API de checkout
autenticado y la aplicación transaccional e idempotente de un pago previamente
verificado.

No se habilitó ningún cobro real. La activación continúa bloqueada por las
credenciales sandbox de la cuenta de Nava, el despliegue del receptor verificable
y la prueba completa del flujo. La autorización de Notificación Externa fue
aprobada por PayPhone, pero se debe corregir la URL que quedó registrada.

El 21 de agosto se aplicaron y verificaron en Neon las cuatro migraciones que
estaban pendientes:
`20260820160000_member_location_online_booking`,
`20260820190000_platform_operations_center`,
`20260820203000_platform_admin_governance` y la nueva
`20260820220000_subscription_billing_domain`. `pnpm db:status` informó 57
migraciones y base actualizada.

La migración local posterior
`20260821100000_subscription_billing_period_days` **no está aplicada en Neon ni
VPS**: forma parte del próximo release controlado y no habilita pagos por sí
misma.

## Estado por fase

| Fase | Estado                  | Evidencia o pendiente principal                                                                                                                                                                                                                                                                                          |
| ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | Cerrada operativamente  | Release compilado, VPS y Neon reconciliados con 58 migraciones; API/Web/Admin y Nginx verificados. Un backup se restauró correctamente en una base temporal con 54 migraciones. El panel interno está publicado en `https://admin.navacloud.app`, protegido por contraseña scrypt y OTP.                                 |
| 1    | Parcial, bloqueante     | PayPhone aprobó Notificación Externa, pero se debe corregir la URL registrada; faltan credenciales sandbox por canal seguro y confirmar el mecanismo de autenticación, reintentos e IPs.                                                                                                                                 |
| 2    | Implementada localmente | Migración `20260820220000_subscription_billing_domain`; aislamiento e idempotencia probados en PostgreSQL.                                                                                                                                                                                                               |
| 3    | Sandbox web parcial     | Planes, sesión de compra, checkout owner, consulta de intento, expiración y aplicación verificada. La web `/checkout` tiene login con cookie HttpOnly, creación idempotente y espera por estado; sigue deshabilitada por configuración. No existe webhook que otorgue acceso porque su autenticación no está confirmada. |
| 4    | Pendiente               | Se conserva el flujo manual de reservas; no se automatizó sin contrato verificable del proveedor.                                                                                                                                                                                                                        |
| 5–7  | Parcial                 | Estados saneados y pruebas críticas del backend. Faltan checkout web completo, panel operativo, métricas/alertas, sandbox y E2E de salida.                                                                                                                                                                               |

## Cierre operativo de Fase 0 — 21 de agosto de 2026

- La VPS se actualizó inicialmente a `800736c`; el despliegue posterior del Admin actualizó el código a `0ead479`.
- `pnpm build` terminó correctamente para los 12 paquetes.
- Neon quedó reconciliado: 58 migraciones detectadas y `pnpm db:status` sin pendientes.
- Se creó un dump PostgreSQL con cliente 18 y se restauró en una base temporal
  de Neon usando conexión directa y rol propietario; la restauración conservó
  las 54 migraciones presentes en el origen del backup.
- `nava-api.service` y `nava-web.service` están activos; los healthchecks local
  y público de API devolvieron `{"status":"ok"}` y la web pública devolvió 200.
- Se configuraron `PLATFORM_ADMIN_EMAILS` y un
  `PLATFORM_ADMIN_PASSWORD_HASH` scrypt; el panel quedó publicado con OTP. No
  se habilitaron pagos de plataforma.

### Evidencia operativa pendiente de registrar

Antes del siguiente ensayo de contingencia, registrar fuera del repositorio el
checksum y retención del dump, responsable operativo, hora de inicio/fin de la
restauración y los objetivos RPO/RTO aprobados. Esta falta documental no
autoriza a reabrir pagos reales ni a eliminar backups.

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

### Checkout web de sandbox

- Se incorporó `apps/web/app/checkout`: solicita el login de Nava, conserva el
  token de sesión únicamente en una cookie `HttpOnly`, `Secure` en producción y
  `SameSite=Lax`, y no lo expone al JavaScript de la página.
- El proxy de mismo origen permite exclusivamente login/logout, planes, estado
  de suscripción, creación de checkout y consulta del intento; no es un proxy
  genérico hacia la API.
- La creación del enlace usa una clave de idempotencia por interacción, abre
  PayPhone fuera de un `iframe` y consulta el estado cada cinco segundos. El
  retorno del navegador no activa el plan.
- La UI muestra por qué no puede comprar una persona sin negocio, con varias
  organizaciones, que no es owner o mientras el piloto siga deshabilitado.

La ruta está preparada para sandbox, pero `PLATFORM_PAYMENTS_ENABLED` continúa
en `false`. No se ha registrado ni expuesto un webhook que aplique pagos: la
guía pública de PayPhone no documenta una autenticación criptográfica suficiente
para otorgar acceso y se requiere su confirmación formal antes de implementarlo.

### Notificación Externa de PayPhone

- PayPhone aprobó la funcionalidad para la aplicación sandbox de Nava.
- La URL enviada inicialmente no corresponde al receptor de plataforma. Antes
  de cualquier prueba se debe solicitar la corrección a
  `https://api.navacloud.app/v1/webhooks/payphone/platform`, siempre que ese
  hostname sea el que expone la API productiva con TLS válido.
- Aún se debe confirmar por escrito si PayPhone entrega firma, secreto,
  allowlist de IP, timestamp/replay window y política de reintentos. La
  aprobación de la funcionalidad no sustituye esa evidencia.

### Decisiones comerciales confirmadas para el piloto

- El trial se mantiene en **7 días** y, para usuarios primerizos, conserva los
  **3 días** de gracia ya implementados.
- El impuesto de plataforma se configurará en cero; el emisor indicado es
  Christopher Alexander Gallardo Campos y el dominio objetivo es
  `https://navacloud.app/checkout`.
- El período comercial es de **30 días exactos**. La migración
  `20260821100000_subscription_billing_period_days` guarda el snapshot
  `billingPeriodDays=30` en cada factura y el dominio lo aplica al renovar;
  `billingPeriodMonths=1` se conserva solo como compatibilidad histórica.

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

## Ensayo sandbox de suscripciones

**Objetivo:** ejecutar un pago simulado y comprobar que solo una confirmación
verificable activa o renueva el plan correcto. Esta sección no autoriza cobros
reales.

### Precondiciones

- La aplicación PayPhone de tipo `API` está en ambiente de pruebas y pertenece
  a Nava, no a una barbería tenant.
- PayPhone registró la URL de notificación correcta:
  `https://api.navacloud.app/v1/webhooks/payphone/platform`.
- El proveedor confirmó por canal seguro la autenticación del webhook, sus
  reintentos e IPs de origen si existen.
- La API y la web tienen HTTPS válido; `https://navacloud.app/checkout` carga
  el checkout autenticado.
- Existe una cuenta de prueba verificada, con una única organización y rol
  `owner`.
- El release contiene la migración
  `20260821100000_subscription_billing_period_days` y la base informa estado
  actualizado mediante `pnpm db:status`.

### Configuración segura

Los secretos se cargan directamente en el gestor de secretos del servidor. No
se escriben en Git, chat, tickets ni capturas.

- Token sandbox de PayPhone, cifrado con
  `PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY`.
- StoreID sandbox en `PlatformPaymentConfiguration`.
- `PLATFORM_SUBSCRIPTION_TAX_BASIS_POINTS=0`.
- Versión publicada de términos comerciales.
- `PLATFORM_PAYMENTS_ENABLED=true` únicamente en staging/sandbox y solo durante
  el ensayo.

La clave de cifrado de plataforma debe ser distinta de la empleada para
credenciales PayPhone de los tenants.

### Secuencia de ensayo

1. Registrar hora, persona que prueba, organización y plan; no registrar token,
   documento, tarjeta ni correo de PayPhone.
2. Iniciar sesión en `/checkout` como owner y crear un enlace para un plan de
   pago.
3. Completar el pago simulado en PayPhone. El navegador no debe conceder acceso
   por sí mismo.
4. Confirmar la recepción autenticada del webhook y su validación de referencia,
   importe, moneda y StoreID.
5. Confirmar que el intento queda `APPLIED`, la factura `PAID`, la suscripción
   `ACTIVE` y existe una sola auditoría de aplicación.
6. Reenviar el mismo evento y confirmar que no se extiende el período ni se crea
   otro movimiento.
7. Comparar el resultado con el historial sandbox de PayPhone y guardar solo la
   referencia interna, ID de transacción y resultado.
8. Desactivar la creación de enlaces al terminar el ensayo si no hay más pruebas
   programadas.

### Casos mínimos y pase a producción

Se deben aprobar: pago exacto, mismo evento dos veces, referencia/importe/moneda
o StoreID incorrectos, enlace expirado, rechazo o timeout, webhook inválido y
un intento de un `manager` o de otra organización.

No se pasa a producción hasta que estos resultados estén documentados, la
conciliación coincida, exista monitoreo de fallos y se apruebe un release con
backup verificable y migraciones reconciliadas.

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
