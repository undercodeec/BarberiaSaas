# Ciclo de suscripciones y auditoría temporal

## Propósito

Garantizar que el pago, el acceso, el vencimiento y la degradación de una
suscripción se calculen con instantes reales e invariables, aun cuando el
negocio y el equipo de plataforma estén en zonas horarias distintas. El
producto conserva tres días de gracia y después degrada automáticamente al
plan Free cuando no existe un pago válido.

## Decisiones

- Los instantes comerciales y técnicos se almacenan en UTC como
  `timestamptz`; la zona horaria nunca participa en la comparación de acceso.
- La fuente de visualización y comunicaciones es la zona IANA de la
  organización, por ejemplo `America/Guayaquil` o `Europe/Madrid`; no es la
  zona del navegador de una persona administradora.
- El ciclo publicado es de 30 días exactos (720 horas) desde el inicio del
  período. Los tres días de gracia son 72 horas exactas. Esto conserva el
  contrato actual incluso cuando una zona cambia por horario de verano.
- Toda factura conserva un snapshot de `billingTimezone`. Los eventos de
  cambio de estado conservan el mismo snapshot. Las auditorías históricas no
  cambian si luego se modifica la zona de la organización.
- Se distinguen la hora de pago del proveedor y la hora en que Nava lo
  verificó. Nunca se inventa una hora de proveedor: si PayPhone no la expone,
  se muestra y audita `verifiedAt` como tal.

## Modelo temporal

| Dato | Semántica | Fuente |
| --- | --- | --- |
| `providerPaidAt` | Instante informado por PayPhone para el pago aprobado. Opcional. | Respuesta de confirmación verificada del proveedor. |
| `approvedAt` / `appliedAt` | Instante UTC de verificación y aplicación por Nava. | Servidor Nava. |
| `receivedAt` | Instante UTC de recepción del webhook. | Servidor Nava. |
| `periodStartsAt`, `periodEndsAt` | Inicio y fin del período facturado. | Cálculo UTC de Nava. |
| `graceEndsAt` | Fin de la gracia de tres días. | `periodEndsAt + 72h`. |
| `billingTimezone` | Zona IANA contractual de esa factura/evento. | Snapshot de la organización. |

`SubscriptionInvoice` incorporará `billing_timezone` y
`provider_paid_at`. `SubscriptionChange` incorporará `billing_timezone`.
Los intentos de pago obtienen su zona por su factura; no se duplica un dato
que puede divergir.

## Alta y configuración de zona horaria

1. En la creación de cuenta se obtiene como propuesta
   `Intl.DateTimeFormat().resolvedOptions().timeZone` del dispositivo.
2. La persona confirma o cambia la zona en una lista de identificadores IANA
   válidos; el país no se usa como sustituto porque un país puede tener varias
   zonas.
3. La API valida la zona mediante `Intl.DateTimeFormat` y la guarda como
   `Organization.defaultTimezone`.
4. En el perfil del negocio se podrá editar la zona para períodos futuros.
   Cambiarla no reinterpreta facturas ni eventos existentes.
5. Una migración retroactiva llena los snapshots nulos con la zona actual de
   cada organización (o `America/Guayaquil` solo si el dato histórico falta).
   El backfill se identifica en auditoría como inferido, no como zona original
   confirmada.

## Pago y período

1. Se crea una factura con `billingTimezone` y un intento de pago.
2. La respuesta de retorno del navegador y el webhook son señales, no prueba
   suficiente. Nava confirma la transacción con PayPhone antes de aplicar
   cambios.
3. La respuesta verificada aporta `providerPaidAt` si PayPhone lo documenta;
   si no, queda `null` y `approvedAt`/`appliedAt` son el instante auditable de
   Nava.
4. Para una primera compra o reactivación, el período inicia en `appliedAt`.
   Para una renovación antes del vencimiento, inicia en el `currentPeriodEnd`
   existente y preserva el acceso no consumido.
5. El fin se calcula con `start + billingPeriodDays * 24h`. Se persisten ambos
   extremos UTC junto con el snapshot de zona.

## Ciclo de vida automático

Un proceso idempotente se ejecuta al iniciar la API y cada minuto. En una
transacción por organización:

```text
TRIAL al vencer            -> FREE
ACTIVE al vencer           -> PAST_DUE, graceEndsAt = periodEndsAt + 72h
PAST_DUE al vencer gracia  -> FREE
pago verificado            -> ACTIVE y nuevo/extendido período
```

Las transiciones automáticas crean un `SubscriptionChange` con `reason`,
límites de período, snapshot de zona e instante UTC. El update condiciona el
estado esperado para ser seguro con varias réplicas de API. La tarea también
ejecuta una conciliación inicial al arrancar, por lo que una caída del proceso
no deja suscripciones vencidas en estado activo.

## Administración y avisos

El endpoint de plataforma entrega los instantes ISO UTC, el `billingTimezone`
de la factura/evento y, cuando exista, `providerPaidAt`. El panel muestra:

- **Pago proveedor**: `providerPaidAt` en la zona snapshot, o “No informado
  por PayPhone”.
- **Verificado por Nava**: `appliedAt` en la zona snapshot.
- **Vencimiento y gracia**: `periodEndsAt` y `graceEndsAt` en la zona
  snapshot.
- **Auditoría**: cada cambio con su zona y su hora UTC accesible en el detalle.

La lista y las notificaciones no utilizan la zona local del navegador. Los
correos indican fecha, hora y abreviatura/identificador de la zona aplicable.

## Pruebas y aceptación

- Validación de zonas IANA y rechazo de valores inválidos.
- Creación en `America/Guayaquil`, `America/Lima`, `Europe/Madrid` y una zona
  con horario de verano (`America/New_York`).
- Período de 30 días y gracia de 72 horas calculados desde instantes UTC.
- Renovación anticipada que conserva el inicio y extiende el vencimiento.
- Degradación exacta de `ACTIVE` a `PAST_DUE` y, tras tres días sin pago, a
  `FREE`, con eventos de auditoría idempotentes.
- Webhook o retorno no confirmado no activa el plan; una confirmación válida
  sí lo hace y conserva `providerPaidAt` solo cuando el proveedor lo entrega.
- Panel admin muestra factura, intento, historial, pago y vencimiento usando
  el snapshot, no la zona del navegador.

## Compatibilidad y despliegue

La migración añade columnas anulables y backfill. Durante el despliegue, los
lectores usan el snapshot cuando existe y la zona actual de organización como
fallback. Primero se despliega la migración y la API compatible; después el
panel admin. Se monitorean conciliaciones por minuto, transiciones a
`PAST_DUE`/`FREE`, y pagos aprobados que aún no se aplican.
