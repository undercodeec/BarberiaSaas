# Propuesta: trazabilidad por colaborador y restricción de caja para barberos

> Fecha: 29 de agosto de 2026  
> Estado: implementada localmente; migración pendiente de aplicar en cada entorno.  
> Alcance: aplicación móvil, API, base de datos y contratos compartidos.

## Decisión propuesta

Implementar un **detalle operativo-financiero por movimiento**, visible solo para
propietario y administrador del negocio (`owner` y `manager`), y retirar por
completo el acceso del rol `barber` a Caja. La atribución debe distinguir tres
personas, porque no siempre son la misma:

| Dato | Significado | Fuente actual / propuesta |
| --- | --- | --- |
| Profesional que realizó el servicio | Barbero asignado a la cita o a la venta manual de servicio. | Ya existe: `Appointment.professionalMembershipId` y `CashMovement.professionalMembershipId`. |
| Vendedor de producto | Colaborador al que el negocio asigna la venta de un producto. | Nuevo campo explícito en `CashMovement`; no inferir solo desde quien registró el cobro. |
| Registró / ejecutó el movimiento | Usuario autenticado que abrió, cobró, anuló o cerró la operación. | Ya existe: `createdByUserId`, `reversedByUserId`, `closedByUserId` y `AuditLog.actorUserId`. Se expondrá en la lectura. |

Esta separación evita atribuir erróneamente un corte a quien lo cobró o una
venta de producto a quien la digitó. Es compatible con reservas manuales y
reservas públicas: ambas citas ya conservan el profesional asignado.

## Hallazgos de la lógica actual

### Lo que ya permite construir el registro

- Una cita ya tiene `professionalMembershipId`, `createdByUserId`,
  `updatedByUserId`, servicios con precio congelado y eventos de agenda. Una
  reserva pública también guarda el profesional antes de llegar a la agenda.
- Al cobrar una cita, `cash-register.ts` la enlaza mediante
  `CashMovement.appointmentId`, marca la cita como `PAID` y reconcilia sus
  comisiones. No se debe reemplazar este flujo.
- Las ventas manuales de servicio ya almacenan `serviceId` y
  `professionalMembershipId`; las ventas de producto ya almacenan `productId`,
  cantidad, valor, medio de pago, usuario creador y movimiento de inventario.
- Las anulaciones de producto conservan `reversedAt`, `reversedByUserId` y
  motivo; las comisiones y los cierres de caja ya tienen auditoría. Es una base
  adecuada para una lectura trazable, sin crear un segundo cálculo de caja.

### Brecha funcional y de seguridad que debe corregirse primero

El menú inferior móvil muestra **Caja** a todos los roles y la pantalla carga
sus endpoints. Más importante: `apps/api/src/cash-register.ts` solo valida
membresía, sucursal y estado de caja; no exige un permiso financiero. Por ello
un `barber` con sesión y sucursal asignada puede hoy invocar directamente
`current`, `summary`, `open`, `movements`, `close`, `history` y el detalle de
sesión. Ocultar el botón por sí solo no sería suficiente.

Inventario, pedidos y comisiones sí restringen sus operaciones financieras a
`OWNER` y `MANAGER`. Caja debe adoptar el mismo criterio de servidor.

## Diseño compatible propuesto

### 1. Permisos y alcance

Definir permisos financieros explícitos en `packages/permissions` y aplicarlos
en la API. No reutilizar `appointment.manage`, ya que un barbero necesita
gestionar sus propias citas, pero no dinero.

| Acción | Owner | Manager (administrador de negocio) | Receptionist | Barber |
| --- | ---: | ---: | ---: | ---: |
| Ver registro financiero y detalle de caja | Sí | Sí, en sus sucursales | No en esta entrega | No |
| Abrir/cerrar caja, ingresos, egresos y anulaciones | Sí | Sí, en sus sucursales | No en esta entrega | No |
| Cobrar cita / vender producto | Sí | Sí, en sus sucursales | No en esta entrega | No |
| Ver y gestionar su propia agenda | Sí | Sí | Según permiso actual | Sí |

Notas de alcance:

- `manager` corresponde al administrador del negocio. El administrador de
  plataforma no debe recibir automáticamente acceso a los movimientos de cada
  tenant; su acceso sigue las políticas de soporte/auditoría de plataforma.
- La primera entrega bloquea Caja al `receptionist` también, porque la petición
  pide retirar Caja al barbero y el comportamiento actual no tiene un permiso
  financiero separado ni una regla de operación para recepción. Si el negocio
  necesita que recepción cobre después, se habilita con un permiso granular y
  una decisión explícita, no por herencia accidental.
- La API debe responder `403 FINANCIAL_ACCESS_FORBIDDEN` antes de consultar o
  modificar datos. La UI es una segunda barrera, no la autoridad.

### 2. Modelo de atribución y migración aditiva

Mantener `CashMovement` como la fuente monetaria única. Agregar columnas
opcionales, con una migración nueva y aditiva:

```text
cash_movements
  seller_membership_id          UUID NULL
  seller_name_snapshot          VARCHAR(120) NULL
  professional_name_snapshot    VARCHAR(120) NULL
  recorded_by_name_snapshot     VARCHAR(120) NULL
```

Las columnas de identificador se validan contra la misma organización y la
sucursal del movimiento. Las instantáneas de nombre no sustituyen la relación:
preservan la lectura histórica si una persona cambia su nombre, se desactiva o
sale del equipo. Los campos existentes `created_by_user_id`,
`professional_membership_id`, `appointment_id`, `service_id`, `product_id` y
las marcas de reversión se conservan intactos.

Reglas de escritura:

1. **Cobro de cita:** el profesional se toma exclusivamente de la cita; se
   guarda su instantánea. El registrador es el usuario autenticado. No se
   solicita un profesional manual ni se cambia la cita.
2. **Venta manual de servicio:** se mantiene el profesional seleccionado y se
   guarda su instantánea. Esto conserva la comisión vigente y la validación de
   asignación de servicio.
3. **Venta manual de producto:** agregar `sellerMembershipId` opcional pero
   recomendado en el formulario. Si se omite, se atribuye al miembro activo
   del usuario que registra, cuando exista; de otro modo queda `Sin asignar`
   de forma visible. No se inventa un vendedor.
4. **Pedido público / pickup:** el cobro conserva `Registrado por` (quien
   confirma el pedido) y queda `Vendedor: Venta online / sin colaborador`,
   salvo que en una fase posterior se asigne al entregar. No se debe adjudicar
   al cliente ni al dueño por defecto.
5. **Ingresos, depósitos, gastos, retiros, anticipos y liquidaciones:** no se
   etiquetan como venta ni como servicio. Muestran `Registrado por` y, cuando
   aplique, el profesional beneficiario existente en el dominio de comisiones.
6. **Anulación:** nunca se edita ni borra el movimiento original. Se muestra
   el estado, el motivo, fecha y usuario que anuló; los totales actuales ya
   excluyen correctamente movimientos revertidos.

Para los registros históricos no se deben modificar importes, comisiones ni
estado de citas. Se ofrecerá una lectura de mejor esfuerzo: profesional desde
la cita o relación existente; registrador desde `createdByUserId`; vendedor
como `No registrado (histórico)` si no hay atribución fiable. No se realizará
un backfill inferido que pueda falsificar la auditoría.

### 3. API de lectura: proyección, no nuevo libro contable

Extender las respuestas de:

- `GET /v1/cash-register/summary`
- `GET /v1/cash-register/sessions/:sessionId`
- `GET /v1/cash-register/history`

con un objeto `attribution` por movimiento. En paralelo, crear una consulta
paginada para auditoría diaria/multisesión:

```text
GET /v1/financial-records
  ?locationId=&date=YYYY-MM-DD&from=&to=
  &professionalMembershipId=&sellerMembershipId=
  &type=&paymentMethod=&status=&page=&pageSize=
```

Respuesta propuesta por fila:

```ts
{
  id, occurredAt, amountCents, type, paymentMethod, status,
  source: 'appointment' | 'manual_service' | 'product_sale' |
          'product_order' | 'cash_adjustment' | 'commission',
  description, appointment: { id, clientName, source } | null,
  services: [{ id, name, priceCents }],
  product: { id, name, quantity } | null,
  attribution: {
    professional: { membershipId, name, provenance } | null,
    seller: { membershipId, name, provenance } | null,
    recordedBy: { userId, name } | null,
    reversedBy: { userId, name } | null,
  },
  reversal: { at, reason } | null,
  cashRegisterSessionId
}
```

`provenance` aclara si el nombre viene de una instantánea, de la cita o de un
registro histórico. La consulta se construye con `CashMovement` y joins de
solo lectura a cita, servicios, producto, usuarios y membresías; no duplica
filas de `StockMovement`, `CommissionEntry` o `AuditLog`. Así el total de caja
continúa calculándose únicamente con `totalsFor` y no se generan dobles
ingresos en el arqueo.

El filtro por día debe usar la zona horaria de la sucursal, convertir el rango
local a UTC en la API y filtrar por `CashMovement.createdAt`. Para citas, el
registro contable debe aparecer el día del cobro, no el día en que se agendó.

### 4. UI móvil propuesta

La visualización principal debe estar donde el dueño ya revisa el arqueo:

1. En `cash-register-detail.tsx`, reemplazar la lista actual de movimientos
   por filas enriquecidas. Bajo el concepto, mostrar chips como
   `Servicio · Hecho por: Ana`, `Producto ×2 · Vendió: Luis` y
   `Registró: María`; al tocar una fila abrir un modal de detalle con cliente,
   servicios/producto, pagos, caja, atribución y reversión.
2. En `cash-register.tsx`, mantener solo el resumen breve de las tres últimas
   filas y añadir un enlace **“Ver registro del día”** hacia la nueva pantalla
   `financial-records.tsx`. Esta pantalla tendrá fecha, sucursal, filtros por
   profesional/vendedor/tipo/estado y totalizadores por medio de pago.
3. En `business-summary`, agregar una tarjeta **“Conciliación por
   colaborador”**: servicios realizados, ventas de producto atribuidas,
   ingresos cobrados y diferencias/reversiones. Esta tarjeta navega al mismo
   registro filtrado; no recalcula ni permite editar.
4. En el formulario de venta de producto de Caja, añadir el selector
   **“Vendedor”**. El selector solo aparece para roles financieros y lista
   miembros activos asignados a la sucursal. Para servicio se mantiene el
   selector de profesional existente, con etiqueta más clara: **“Profesional
   que realizó el servicio”**.
5. Para `barber`, eliminar la pestaña **Caja** de `BottomNavigation`, impedir
   rutas `/cash-register`, `/cash-register-detail`, `/cash-register-history`
   y `/financial-records` desde el layout, y no ejecutar sus consultas en
   Dashboard. El Dashboard del barbero conserva sus citas y no debe mostrar
   saldos ni totales financieros.

## Impacto y garantías de no interrupción

| Flujo existente | Tratamiento propuesto | Garantía requerida |
| --- | --- | --- |
| Agenda y reserva pública | Solo se lee su profesional al cobrar; el barbero continúa gestionando su agenda propia. | No cambia disponibilidad, estados, recordatorios ni reseñas. |
| Cobro de cita | Se conserva `appointmentId`, validación de total, `PAID` y conciliación de comisión. | Una cita no puede cobrarse dos veces. |
| Comisión por servicio | Se conserva `reconcileAppointmentCommissions` y la venta manual comisionable. | La atribución visual no modifica reglas ni montos de comisión. |
| Inventario y venta de producto | Se conserva transacción, bloqueo de stock y reversión. Se añade vendedor como metadato trazable. | Una venta sigue descontando una sola vez; revertir resta de caja y devuelve stock como hoy. |
| Pedidos de producto | Se conserva la creación de movimientos por ítem y el pago. | La consulta agrupa para visualización, pero no cambia importes ni pedidos. |
| Cierres y arqueo | Se conserva `totalsFor`, efectivo esperado y diferencia. | Los nuevos joins nunca alimentan totales. |
| Datos antiguos | Lectura con procedencia `histórico/no registrado`; sin atribuciones inventadas. | No hay backfill que altere historia financiera. |

## Plan de implementación recomendado

### Fase 0 — Corrección de acceso a Caja (prioridad alta)

- Crear `cash.read` y `cash.manage` en `packages/permissions`, o centralizar
  la regla financiera equivalente que ya usa Comisiones.
- Exigirla en **todos** los endpoints de Caja, incluido `current`, `summary`,
  historia y detalle; `open`, `movements` y `close` requieren `cash.manage`.
- Ocultar Caja y proteger rutas/cargas móviles para `barber` y `receptionist`.
- Añadir pruebas API de 403 para cada endpoint y prueba móvil de navegación.

### Fase 1 — Datos y contratos de atribución

- Añadir la migración aditiva e índices de consulta por vendedor/profesional y
  fecha de movimiento.
- Validar pertenencia a organización/sucursal al elegir vendedor; tomar y
  persistir las instantáneas en la misma transacción del movimiento.
- Actualizar `@barber-saas/api-client` con `attribution`, `source` y el nuevo
  contrato paginado; no romper las propiedades actuales de `CashMovementRecord`.
- Cubrir cita manual, reserva pública, servicio manual, producto, pedido,
  anulación y movimiento no comercial.

### Fase 2 — Registro y detalle UI

- Enriquecer detalle de caja y crear pantalla de Registro del día.
- Implementar filtros, paginación y estados de carga/error/vacío.
- Agregar selector de vendedor solo a venta manual de producto y aclarar el
  selector de profesional para servicios.

### Fase 3 — Conciliación por colaborador

- Incorporar el acceso desde resumen de negocio y exportación CSV si se
  aprueba como alcance adicional.
- Mostrar subtotales conciliables por medio de pago y colaborador, siempre
  excluyendo movimientos revertidos del total vigente y mostrando su rastro.

## Pruebas de aceptación mínimas

- Un barbero puede ver, crear, actualizar y completar únicamente sus citas;
  recibe 403 al intentar cualquiera de los endpoints de Caja y no tiene
  pestaña ni rutas financieras visibles.
- Owner y manager ven el mismo registro dentro de su alcance de sucursal;
  manager no puede consultar una sucursal no asignada.
- Una reserva pública cobrada muestra el profesional que la realiza, el
  registrador y sus servicios sin cambiar el enlace de pago, el estado ni la
  comisión.
- Una venta de producto muestra vendedor, registrador, producto y cantidad;
  una anulación conserva el vendedor original y muestra quién/la razón de la
  anulación. El stock y el total de caja cambian exactamente una vez.
- Una venta histórica sin vendedor no se atribuye a una persona; aparece como
  histórico/no registrado.
- La suma del detalle por estado vigente coincide con `expectedCash`, ventas
  por efectivo/tarjeta/transferencia y el cierre preexistente.
- Pruebas de autorización se ejecutan también con llamadas HTTP directas, no
  solo con pruebas de interfaz.

## Riesgos y decisiones pendientes

1. **Recepcionista:** se propone sin Caja en esta entrega. Confirmar después
   si debe obtener `cash.manage` o un permiso limitado para cobrar, sin abrir o
   cerrar caja.
2. **Vendedor de pedidos online:** inicialmente no se atribuye a una persona;
   si se requiere comisión de venta al entregar, debe definirse un evento de
   asignación de vendedor separado del pago.
3. **Servicios múltiples en una cita:** la cita tiene un único profesional.
   Si un servicio puede realizarlo más de un barbero, se necesitará un modelo
   nuevo por línea (`AppointmentService.performerMembershipId`), no debe
   sobrecargarse el movimiento de caja.
4. **Exportación y PII:** el detalle muestra cliente y movimiento financiero.
   La exportación necesita una política específica de datos personales y
   auditoría de descarga.

## Archivos de referencia inspeccionados

- `apps/api/src/cash-register.ts`: caja, cobros, ventas, totales y auditoría.
- `apps/api/src/agenda.ts`: alcance propio del barbero y profesional de cita.
- `apps/api/src/inventory.ts` y `apps/api/src/product-orders.ts`: stock,
  reversión y ventas provenientes de pedidos.
- `apps/api/src/commissions.ts`: regla financiera de owner/manager ya usada.
- `packages/database/prisma/schema.prisma`: entidades persistentes actuales.
- `packages/permissions/src/index.ts`: permisos organizacionales actuales.
- `apps/mobile/app/(onboarding)/cash-register*.tsx`, `dashboard.tsx` y
  `src/components/BottomNavigation.tsx`: puntos de visualización y navegación.
