# Plan de desarrollo integral de Nava

> Fecha: 20 de agosto de 2026
> Base: `ESTADO_PROYECTO.md`, código y esquema Prisma revisados en la rama local.
> Propósito: llevar el MVP desde piloto controlado a una operación estable, con
> pagos PayPhone reales y suscripciones Nava activadas de forma segura.

## 1. Punto de partida

Nava ya cubre el núcleo operativo de una barbería: identidad multi-tenant,
onboarding, equipo, servicios, agenda, reservas públicas, clientes, Caja,
inventario, reportes, notificaciones y planes con límites en backend.

Hay dos capacidades de pago con estados muy distintos:

| Dominio                                | Estado actual                                                                                                            | Brecha para pago real                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Cobro de una cita del negocio          | Se crea un enlace PayPhone por negocio y un responsable lo confirma manualmente. El intento está ligado a `Appointment`. | Verificación automática, webhook/polling validado con el proveedor, conciliación y pruebas de fallos. |
| Suscripción que el negocio paga a Nava | Planes, trial, gracia, límites y acciones internas existen.                                                              | No hay checkout, intento de pago, factura, renovación ni webhook.                                     |

Esta separación es obligatoria: las credenciales PayPhone de una barbería solo
sirven para cobrar a sus clientes; el cobro de una suscripción debe usar una
cuenta PayPhone Business **propiedad de Nava**. No se deben reutilizar ni
exponer credenciales de un tenant para el otro flujo.

## 2. Objetivo de producto

Al terminar este plan, un negocio podrá:

1. Contratar o renovar un plan Nava desde un checkout web seguro.
2. Activar sus funcionalidades solo después de una confirmación verificable del
   proveedor, nunca por una redirección del navegador.
3. Cobrar reservas con su propia cuenta PayPhone y ver el resultado conciliado
   en la cita, Caja y auditoría.
4. Mantener el acceso controlado durante vencimientos, gracia, rechazo o
   suspensión, sin perder datos ni mezclar información entre organizaciones.

La app Android seguirá mostrando el estado de la suscripción; cualquier enlace
externo de pago se publicará únicamente cuando se valide la política de Google
Play aplicable. El checkout inicial debe ser web.

## 3. Principios que no se negocian

- El `organizationId` se deriva de la sesión, membresía o token público válido;
  nunca se acepta como autoridad desde el cliente.
- El importe, moneda, plan, período y beneficiario se calculan en backend. El
  navegador o app solo solicita una intención de pago.
- Crear un enlace, abrirlo o volver de PayPhone no equivale a pago aprobado.
- Todo evento externo es verificable, idempotente, auditable y conserva una
  referencia interna única.
- Los secretos viven solo en la configuración del servidor. Nunca en Git,
  navegador, app móvil, logs, capturas ni documentación.
- Cada mutación de dinero, plan o acceso usa transacción de base de datos y
  deja una auditoría.
- Los cambios de esquema se hacen con una nueva migración Prisma revisada y en
  producción exclusivamente con `pnpm db:migrate:deploy`.
- Ningún cobro real se habilita hasta completar pruebas de entorno de prueba,
  fallos, repetición de eventos y conciliación manual.

## 4. Arquitectura objetivo de pagos

```text
Cliente final ──> PayPhone del negocio ──> webhook/verificación ──> Cita + Caja

Negocio (owner) ──> Checkout web ──> PayPhone de Nava ──> webhook/verificación
                                                          └──> Suscripción + límites
```

Los dos carriles comparten patrones técnicos (intentos, idempotencia,
auditoría y monitoreo), pero no comparten credenciales, registros de pago ni
permisos.

### Máquina de estados propuesta

```text
CREATED -> LINK_CREATED -> PENDING_PROVIDER -> APPROVED -> APPLIED
                    |              |                |
                    v              v                v
                 EXPIRED        REJECTED         REFUNDED / REVERSED

Un webhook repetido o una consulta repetida de APPROVED debe terminar en APPLIED
una sola vez.
```

`APPLIED` significa que la transacción local ya efectuó el efecto de negocio:
marcar la cita pagada y crear el movimiento no efectivo, o extender/activar la
suscripción. No se puede llegar a ese estado desde el cliente.

## 5. Fases y entregables

### Fase 0 — Estabilizar la línea de salida

**Objetivo:** tener una base reproducible antes de introducir dinero real.

- Inventariar los cambios locales actuales y separar los cambios de Admin,
  agenda, Caja, disponibilidad y operaciones de plataforma en commits
  verificables.
- Corregir los errores reales de lint y excluir de forma precisa artefactos
  generados; recuperar `pnpm lint` y `pnpm format:check` como gates.
- Crear una base PostgreSQL aislada y ejecutar las integraciones hoy omitidas.
- Reconciliar migraciones entre repositorio, Neon y VPS con
  `pnpm db:status`; no desplegar si hay deriva.
- Validar por SSH el estado histórico de `nava-api.service`,
  `nava-web.service`, Nginx/TLS, variables requeridas y healthcheck.
- Ensayar restauración de Neon, definir RPO/RTO, responsable y evidencia del
  backup/restauración.

**Criterio de aceptación:** árbol limpio para el release, CI sin omisiones
críticas, migraciones reconciliadas y restauración documentada y probada.

### Fase 1 — Definir el contrato comercial y de proveedor

**Objetivo:** no codificar supuestos sobre PayPhone ni sobre la venta de planes.

- Obtener las credenciales de prueba y producción de la cuenta **de Nava** y la
  documentación técnica vigente de creación de link, consulta/confirmación,
  notificación externa, firma/autenticación, reintentos y reversos.
- Confirmar con PayPhone el endpoint y formato de eventos aplicable a Ecuador,
  además de IPs/firma que debe aceptar Nava.
- Definir catálogo comercial inmutable por período: planes vendibles, precio en
  centavos USD, impuestos si aplican, duración, prueba, gracia, cancelación,
  reembolso y responsable de soporte.
- Decidir renovación: inicialmente mensual manual mediante nuevo checkout; la
  renovación automática solo se implementará si PayPhone y la política comercial
  la soportan y se aprueba explícitamente.
- Definir textos de checkout: precio, período, no renovación automática (si es
  el caso), privacidad, comprobante, soporte, cancelación y facturación.

**Dependencia bloqueante:** no activar webhooks ni escribir la integración final
sin especificación técnica oficial y credenciales de pruebas. No se deben pegar
secretos en tickets, chat ni repositorio.

### Fase 2 — Modelo de suscripción cobrable

**Objetivo:** crear un dominio de pagos de plataforma independiente de citas.

Crear una migración nueva, sin modificar retrospectivamente `PaymentAttempt`.
Como mínimo:

| Entidad propuesta                         | Responsabilidad                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `PlatformPaymentConfiguration`            | Referencia a Store ID de Nava, ambiente y estado operativo; token cifrado con clave de servidor separada. |
| `SubscriptionInvoice`                     | Snapshot inmutable del plan, precio, moneda, período, impuestos, organización y vencimiento.              |
| `SubscriptionPaymentAttempt`              | Link, referencia interna, identificador del proveedor, estado, importe, payload saneado y fechas.         |
| `PaymentProviderEvent`                    | Evento recibido/consultado, hash de deduplicación, resultado de validación y fecha de procesamiento.      |
| `SubscriptionChange` o auditoría ampliada | Cambio de plan, período, acceso, actor y razón.                                                           |

Reglas de datos:

- Una factura conserva el precio y beneficios contratados aunque el plan cambie
  posteriormente.
- La referencia local es única y no revela datos personales ni IDs previsibles.
- La respuesta/payload del proveedor se almacena minimizada y sin token ni datos
  de tarjeta.
- Índices: referencia interna, ID de proveedor único cuando exista, organización
  - estado + vencimiento, y hash único del evento.
- El estado vigente de `Subscription` solo cambia desde una operación de dominio
  transaccional, no desde un endpoint de UI ni un script manual ad hoc.

**Criterio de aceptación:** migración validada, rollback lógico documentado,
aislamiento multi-tenant probado y cambios de plan auditados.

### Fase 3 — Checkout web y activación de suscripción

**Objetivo:** cobrar un plan y otorgar acceso de manera confiable.

#### Identidad obligatoria antes del checkout

El checkout de suscripción no será anónimo. Antes de crear un enlace de pago,
la persona deberá identificarse con la misma cuenta Nava que usa en la app:

1. Si ya tiene cuenta, inicia sesión en la web con sus credenciales Nava y se
   valida su sesión vigente.
2. Si no tiene cuenta, completa el registro y verificación OTP de Nava; no se
   crea una suscripción ni un link de pago solo con correo, teléfono o datos
   escritos en PayPhone.
3. Si la cuenta aún no posee organización, debe terminar el onboarding y crear
   su negocio/sede antes de contratar. El owner de esa organización queda como
   responsable inicial de la suscripción.
4. Si pertenece a una organización existente, solo un `owner` puede contratar,
   renovar, cambiar plan o consultar comprobantes. Un `manager`, `barber` o
   `receptionist` no puede pagar ni modificar el plan salvo que se apruebe una
   política de delegación explícita en el futuro.
5. La API deriva la organización desde la sesión y membresía `owner` activa; la
   factura, el intento, la referencia PayPhone y la auditoría guardan el
   `organizationId` y el `userId` autenticado como evidencia de quién inició el
   cobro. El pago aprobado se aplica a esa organización, no al correo que el
   usuario pueda usar en PayPhone.

6. El owner autenticado abre `Suscripción` en la web, compara planes públicos y
   selecciona uno permitido.
7. La API recalcula el precio/moneda, crea factura e intento idempotente y pide
   a PayPhone un enlace con una única referencia.
8. La web abre el enlace del proveedor y muestra un estado de espera; el retorno
   visual no activa nada.
9. El webhook autenticado y/o consulta server-to-server verifica el resultado.
10. Una transacción bloquea la factura/intento, deduplica el evento y, si es
    aprobado, marca pago aplicado, renueva el período y configura el plan.
11. La web consulta el estado y muestra comprobante, período vigente y siguiente
    acción. La app móvil recibe el nuevo entitlement en su refresco normal.

Endpoints tentativos, sujetos al contrato final de PayPhone:

- `GET /v1/subscription/plans`: planes públicos y precios de presentación.
- `POST /v1/subscription/checkout`: owner; crea o reutiliza intención idempotente.
- `GET /v1/subscription/payments/:id`: owner; estado saneado del intento.
- `GET /v1/subscription/session`: sesión, organización elegida y permiso de
  compra; la web redirige a login/onboarding cuando no cumpla las condiciones.
- `POST /v1/webhooks/payphone/platform`: público, autenticado y limitado; no
  depende de sesión de usuario.
- `POST /v1/internal/subscription/payments/:id/reconcile`: solo plataforma,
  exige evidencia y auditoría para contingencias.

El endpoint actual de simulación deberá quedar limitado a pruebas locales o ser
retirado del flujo operativo antes de producción.

**Criterio de aceptación:** un pago aprobado de prueba activa/extiende un plan
una vez; rechazo, vencimiento, evento duplicado, retorno manipulado y webhook
inválido no otorgan acceso.

### Fase 4 — Pago real de reservas con PayPhone

**Objetivo:** sustituir la confirmación manual como camino principal sin romper
el flujo actual de Caja.

- Conservar `PayphoneConfiguration` por organización y el cifrado AAD actual;
  cada comercio continúa siendo receptor directo de sus fondos.
- Extender `PaymentAttempt` solo para eventos de citas/productos que realmente
  correspondan a ese tenant. No usarlo para la suscripción Nava.
- Implementar un receptor de notificación por negocio o una estrategia de
  correlación segura, según la capacidad oficial de PayPhone. Verificar siempre
  con la API del proveedor antes de aplicar el pago.
- Al aprobar: bloquear el intento, comprobar importe/moneda/store/referencia,
  marcar la cita `PAID`, crear el movimiento de Caja con tarjeta y auditoría.
- Definir explícitamente el tratamiento de enlaces expirados, pago tardío,
  cancelación de cita, devolución y discrepancia de importe.
- Mantener confirmación manual solo como contingencia con permiso restringido,
  razón obligatoria y protección contra doble aplicación.

**Criterio de aceptación:** el mismo cobro no puede crear dos movimientos,
alterar efectivo esperado ni afectar otra organización; Caja, cita, auditoría y
vista de Wallet quedan consistentes.

### Fase 5 — UX y comunicación

**Objetivo:** que el usuario comprenda el estado y no pueda realizar acciones
inconsistentes.

- Web de suscripción: estado del plan, uso/límites, plan seleccionado, precio,
  botón de pago con doble prevención de clic, espera, error recuperable y
  comprobante.
- Mobile: estado de suscripción de solo lectura y enlace a la web solo cuando
  sea permitido; no prometer activación inmediata antes de verificar el pago.
- Reserva pública: distinguir “enlace creado”, “pago pendiente”, “pago
  verificado”, “vencido” y “requiere revisión”; no mostrar `PAID` por retorno
  del proveedor.
- Panel Admin: búsqueda de factura/intento, historial de eventos, conciliación
  controlada y vista de fallos sin secretos ni payloads sensibles.
- Accesibilidad: contraste, lectores de pantalla, foco tras retorno del checkout,
  mensajes cortos y alternativa si el navegador externo no regresa a la app.

**Criterio de aceptación:** los estados expuestos en UI corresponden al estado
servidor; botones inválidos permanecen deshabilitados y las acciones dejan
trazabilidad.

### Fase 6 — Seguridad, observabilidad y operación

**Objetivo:** que el sistema se pueda operar y auditar después del lanzamiento.

- Separar variables de PayPhone de plataforma y de cada tenant; rotación,
  procedimiento de pérdida de clave y prueba de descifrado controlada.
- Autenticar webhook con firma/secret oficial, timestamp, replay window,
  allowlist si corresponde y rate limit específico. Responder rápido y procesar
  de forma durable cuando el proveedor lo requiera.
- Registrar métricas: links creados, aprobados, rechazados, expirados, eventos
  duplicados, discrepancias, tiempo hasta aplicación y fallos de proveedor.
- Alertas: webhook inválido, acumulación de pendientes, diferencia de importe,
  error de descifrado, fallo de migración, cola caída y pago aplicado fallido.
- Revisar CORS, cabeceras, logs, autorización de cada endpoint y datos enviados
  a analytics; redactar campos sensibles.
- Sustituir rate limiting en memoria por almacenamiento compartido antes de más
  de una instancia de API.
- Documentar runbook de incidentes: proveedor caído, evento perdido, pago sin
  retorno, devolución, credencial rotada y conciliación diaria.

**Criterio de aceptación:** existe dashboard/alerta mínima, procedimiento de
reconciliación y ejercicios de incidente sin exponer secretos.

### Fase 7 — Calidad y salida a producción

**Objetivo:** evidenciar el comportamiento, especialmente las invariantes de
dinero y aislamiento.

| Nivel                  | Casos mínimos                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Unidad                 | Cálculo de período/precio, transiciones de estado, firma, expiración, deduplicación e idempotencia.            |
| Integración PostgreSQL | Dos tenants, bloqueo concurrente, mismo evento dos veces, misma referencia, rollback y auditoría.              |
| Contrato proveedor     | Link, consulta, webhook aprobado/rechazado, payload incompleto, timeout y firma inválida usando sandbox/mocks. |
| E2E Web/Mobile         | Trial, checkout, espera, renovación, gracia, acceso limitado, cita pagada y pago fallido.                      |
| Manual de negocio      | Conciliación en PayPhone Business, Caja, informes, devolución y soporte.                                       |
| Seguridad              | Roles owner/manager/barber, endpoints públicos, replay de webhook, secretos y logs.                            |

La carga/concurrencia debe incluir reservas simultáneas, creación de enlaces y
procesamiento duplicado de eventos. Se publicará primero en pruebas, luego con
una organización piloto voluntaria, límites de importe y monitoreo reforzado,
antes de habilitarlo de forma general.

## 6. Orden recomendado de ejecución

1. Cerrar Fase 0 y comprobar el entorno productivo real.
2. Conseguir contrato/documentación y credenciales de sandbox de PayPhone
   (Fase 1).
3. Construir y probar el cobro de suscripción de Nava (Fases 2 y 3).
4. Activar una organización piloto y documentar conciliación.
5. Automatizar pago de reservas (Fase 4) usando el mismo patrón ya validado.
6. Completar UX, observabilidad y pruebas de salida (Fases 5 a 7).

No se recomienda invertir este orden: cobrar a Nava primero permite validar la
integración con una sola cuenta de plataforma y un dominio de datos aislado,
antes de operar múltiples credenciales de comercios.

## 7. Despliegue y controles por release

Para cada release con migración:

1. Revisar diff, pruebas, variables requeridas y compatibilidad hacia atrás.
2. Hacer backup verificable y confirmar `pnpm db:status` en la VPS.
3. Aplicar solo `pnpm db:migrate:deploy`, generar Prisma, compilar y reiniciar
   servicios según el runbook vigente.
4. Ejecutar healthcheck, prueba controlada del webhook y una lectura de estado
   sin usar dinero real antes del canary.
5. Monitorear logs, métricas y conciliación; tener un feature flag para detener
   la creación de nuevos links sin borrar la evidencia de pagos existentes.

El panel Admin requiere su propio servicio/despliegue antes de usarlo como
herramienta operativa de pagos; actualmente no hay constancia de que esté
publicado en la VPS.

## 8. Decisiones que debe tomar negocio antes de implementar el checkout final

1. Confirmar que PayPhone será el proveedor inicial y entregar acceso sandbox y
   documentación técnica oficial al equipo de desarrollo por un canal seguro.
2. Aprobar precios, moneda, impuestos, duración mensual, trial, días de gracia,
   cancelación, reembolso y si existirá renovación automática.
3. Definir quién emite comprobante/factura y cómo se atienden cobros duplicados
   o reclamos.
4. Confirmar dominio público definitivo del checkout y la URL de webhook que
   PayPhone debe registrar.
5. Elegir la primera organización piloto y un responsable que concilie pagos.
6. Revisar la política de Google Play antes de enlazar pago de suscripción desde
   Android.

## 9. Definition of Done para pagos reales

Un flujo de pago se considera terminado solo si:

- tiene modelo de datos y migración versionada;
- calcula valores en backend y valida identidad/tenant/rol;
- verifica el resultado con el proveedor y es idempotente;
- conserva auditoría y permite conciliación sin secretos;
- cubre aprobado, rechazo, expiración, duplicado, timeout y reverso;
- muestra estados claros en UI y evita acciones inválidas;
- pasa pruebas automatizadas y una prueba controlada de extremo a extremo;
- cuenta con métricas, alertas, feature flag y runbook de incidente;
- se despliega con migraciones reconciliadas y validación posterior.

## 10. Backlog posterior al piloto

- Pagos parciales y múltiples métodos por cita, si negocio los aprueba.
- Facturación electrónica/tributaria según el modelo legal aplicable.
- Renovación automática solo después de soporte técnico, autorización y pruebas.
- Almacenamiento de archivos privados fuera de PostgreSQL cuando el volumen lo
  justifique.
- Rate limit distribuido, CAPTCHA/reputación para rutas públicas, escalamiento
  horizontal, iOS y canales de mensajería reales.
