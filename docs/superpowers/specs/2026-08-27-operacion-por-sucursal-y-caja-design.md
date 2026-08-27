# Operación por sucursal: horario único, catálogo y caja

## Estado

Propuesta para análisis. No autoriza cambios de esquema, API ni UI por sí
misma.

Esta especificación **reemplaza** en
`2026-08-27-branch-assignment-lifecycle-design.md` la configuración de
horarios por profesional: desde esta decisión no habrá horario ni bloqueos
operativos por barbero. El resto de las reglas de asignación y conservación de
historial se mantiene, salvo donde este documento indique otra cosa.

## Objetivo

Hacer que la sucursal sea el contexto operativo inequívoco de la aplicación:

- las reservas usan exclusivamente el horario de su sucursal;
- los servicios se administran desde un catálogo común y se habilitan por
  sucursal;
- colaboradores con alcance limitado solo operan en sus sucursales asignadas;
- cada sucursal tiene su propia caja, movimientos, stock, citas y reportes;
- el propietario y, según permiso, el administrador pueden consultar y filtrar
  todas las sucursales sin mezclar resultados.

La extensión debe conservar citas, movimientos, cajas, inventario y auditoría
existentes. Nunca se debe inferir, mover ni borrar información histórica de
otra sucursal.

## Decisiones de producto

| Tema | Decisión |
| --- | --- |
| Horario de atención | Solo `BusinessWeeklySchedule` por sucursal y día. |
| Horario de barbero | Se deja de consultar, editar y crear. Los datos heredados se conservan inicialmente, pero no afectan disponibilidad. |
| Bloqueos de barbero | Se retiran del flujo de reservas junto con el horario profesional. No se borran los registros históricos. |
| Catálogo | Los datos maestros del servicio siguen siendo de organización: nombre, precio base, duración, categoría, imagen y reserva online. |
| Habilitación del servicio | Se administra por sucursal. Una reserva requiere que el servicio esté habilitado en su sucursal. |
| Profesional | Se asigna a una o varias sucursales; su presencia ya no restringe horas. Sirve para agenda, comisión, responsabilidad y filtro. |
| Caja | Una caja abierta por sucursal, no una sola caja abierta por organización. |
| Sucursal principal | Es la plantilla de configuración para crear nuevas sucursales. No es un filtro ni reemplaza el alcance asignado de un colaborador. |

## Modelo funcional

### Sucursal principal y creación de sucursales

La organización tendrá una `primaryLocationId` explícita. Durante la
migración, si no existe, se asignará la sucursal activa más antigua. Solo el
owner puede cambiarla desde la administración de sucursales.

Al crear una sucursal se ejecuta una única transacción que:

1. Crea la sucursal y asigna al owner.
2. Copia los siete días del horario de la sucursal principal. Si la principal
   todavía no tiene horario, usa 09:00–18:00 como valor inicial documentado.
3. Copia el estado de habilitación de servicios de la principal.
4. Crea existencias de inventario en cero para los productos activos. No copia
   cantidades ni movimientos: el stock físico no se puede duplicar.
5. No copia caja abierta, movimientos de caja, citas, clientes, pagos,
   bloqueos ni reportes acumulados.
6. Asigna al owner los servicios habilitados de la nueva sucursal cuando siga
   siendo profesional reservable. Los demás colaboradores no se asignan
   automáticamente a la nueva sucursal: el owner debe confirmar su lugar de
   trabajo.

Después de crearla, la sucursal queda independiente. Cambiar horario o
servicios en la principal **no propaga** cambios a sucursales ya creadas; la UI
puede ofrecer una acción explícita y confirmada de “copiar configuración de la
sucursal principal”, pero nunca una sincronización silenciosa.

### Horario y disponibilidad

El horario válido de una cita se obtiene únicamente así:

```text
sucursal activa
  + día abierto y hora dentro del BusinessWeeklySchedule de la sucursal
  + servicio habilitado en la sucursal
  + profesional asignado a la sucursal (si la cita lleva profesional)
  + sin solapamiento de una cita reservable del mismo profesional
```

No se consulta `WeeklySchedule` ni `ScheduleBlock` para generar slots o crear,
reprogramar o validar una cita. El horario de la sucursal no debe ser superado
ni siquiera por owner/manager al crear una reserva manual.

La eliminación del horario del barbero no convierte automáticamente una cita
en “sin profesional”: se conservan `professionalMembershipId`, comisiones y
relaciones de cada cita existente.

### Servicios por sucursal

El modelo actual `ProfessionalService(membershipId, serviceId, locationId)`
mezcla dos preguntas: “¿este servicio se ofrece aquí?” y “¿este profesional lo
realiza?”. Para la primera etapa se recomienda conservarlo para compatibilidad,
pero definir un servicio habilitado en sucursal como:

```text
existe al menos una asignación activa de ProfessionalService
para serviceId + locationId.
```

La UI deberá editar el conjunto de servicios de la sucursal y el backend
aplicará la asignación a los profesionales asignados a esa sucursal. Si después
se necesita distinguir capacidades individuales, se crea una tabla explícita
`LocationService` y `ProfessionalService` queda como capacidad opcional; no se
debe cambiar ambos significados en la misma entrega.

Reglas:

- Deshabilitar un servicio en una sucursal impide nuevas reservas y ventas
  manuales allí, pero conserva citas y movimientos pasados.
- Editar precio, duración o reserva online en el catálogo sigue siendo global.
  Una futura necesidad de precio/duración por sucursal se diseñará como
  `LocationService` con overrides; no debe reutilizarse de forma implícita el
  override por profesional.
- Al asignar un barbero a una sucursal se le habilitan por defecto los servicios
  de esa sucursal, sujetos a edición posterior por owner/manager autorizado.

## Roles, sucursal activa y permisos

Cada sesión tendrá una `activeLocationId` validada por API; no basta con
recordarla en caché móvil. La UI siempre mostrará la sucursal activa en agenda,
caja, inventario, servicios, reportes y encabezados de detalle.

| Rol | Alcance de sucursal | Puede cambiar sucursal | Operación esperada |
| --- | --- | --- | --- |
| Owner | Todas las activas | Sí | Ve datos por sucursal y consolidado; configura principal, horarios, catálogo/habilitaciones, equipo y caja. |
| Manager | Organización, sujeto a permisos actuales | Sí | Consulta y opera según sus permisos. Las asignaciones pueden mostrarse como informativas mientras el permiso sea organizacional. |
| Receptionist | Solo `MemberLocation` | Solo entre asignadas | Citas, clientes permitidos y caja de su sucursal activa. Sin acceso a otra por URL o payload. |
| Barber | Solo `MemberLocation` y sus propias citas | Solo entre asignadas | Ve su agenda; cualquier venta/cobro permitido se registra en su sucursal activa. |

Una acción con `locationId` debe validar en servidor que:

1. la sucursal es activa y pertenece a la organización;
2. owner/manager puede acceder por su permiso;
3. receptionist/barber tiene `MemberLocation` para esa sucursal;
4. las entidades referenciadas (cita, caja, producto, servicio, profesional)
   pertenecen a la misma sucursal cuando corresponda.

El `locationId` del cliente es una selección, no una autorización. Para evitar
errores de interfaz, el backend debe responder `403 LOCATION_FORBIDDEN` y no
usar “la primera sucursal de la membresía” como fallback en mutaciones.

## Caja por sucursal

### Regla central

Una sesión de caja pertenece obligatoriamente a una sucursal. Puede existir una
caja abierta en A y otra en B al mismo tiempo, pero como máximo una abierta por
sucursal. La restricción de unicidad propuesta es un índice parcial para
`(organization_id, location_id)` con estado `OPEN`.

La caja contiene:

- `locationId` obligatorio;
- quién la abrió (`ownerUserId`) y responsable operativo;
- apertura, cierre, efectivo esperado y diferencia;
- movimientos inmutables, incluido quién los creó;
- auditoría siempre con el mismo `locationId`.

### Operación por rol

- Al abrir caja, el colaborador solo puede abrir la caja de su sucursal activa.
  Owner/manager pueden abrir o consultar la de una sucursal seleccionada.
- Al registrar un movimiento, el backend toma la caja abierta de la sucursal
  activa/solicitada y verifica acceso antes de crear el movimiento.
- Un cobro de cita exige que cita y caja tengan el mismo `locationId`.
- Una venta de producto descuenta únicamente `LocationInventory` de la
  sucursal de la caja.
- Un servicio comisionable exige que el profesional esté asignado a la misma
  sucursal de la caja.
- Un usuario no puede cerrar, revertir ni consultar el detalle de una caja de
  una sucursal fuera de su alcance. Las excepciones de owner/manager se definen
  por permiso explícito, no por ocultar botones.

La UI de Caja tendrá selector de sucursal para owner/manager y selector
limitado a sus asignaciones para receptionist/barber. El selector se conserva
al entrar a detalle e historial. Todo listado mostrará la etiqueta de sucursal;
la vista consolidada es solo de lectura y no permite abrir ni registrar en una
“caja consolidada”.

## Vistas UI propuestas

### Configuración de sucursales

En `Configuración del negocio → Sucursales`:

- marcar/cambiar sucursal principal;
- crear sucursal con aviso: “se copiarán horario y servicios habilitados de
  [Sucursal principal]”;
- detalle de sucursal con dos accesos: **Horario de atención** y **Servicios
  habilitados**;
- acción opcional, confirmada: “Copiar configuración de sucursal principal”;
- archivar/restaurar conservando las protecciones actuales (caja abierta y
  citas futuras).

### Horario de atención

Mover el actual “Horario del negocio” dentro del detalle de sucursal o añadir
un selector de sucursal visible. Permite abrir/cerrar cada día y editar inicio
y fin. Solo owner/manager con `schedule.manage` puede guardarlo.

Se retiran de `Gestión de colaboradores`:

- “Configurar horario en esta sucursal”;
- “Configurar mi horario”;
- cualquier pantalla o CTA de horario profesional.

Los roles sin permiso pueden ver el horario de su sucursal como información de
solo lectura, no una pantalla que falle al guardar.

### Servicios habilitados

Nuevo apartado dentro del detalle de sucursal: lista el catálogo global con un
interruptor “Disponible en esta sucursal”. Muestra cuántos profesionales de la
sucursal lo tienen asignado y advierte que al desactivarlo no se alteran citas
ya creadas.

`Gestión de servicios` sigue editando el catálogo global. Debe añadir un enlace
“Gestionar disponibilidad por sucursal” que abre el detalle anterior; así se
distingue claramente editar el servicio de habilitarlo en una sede.

### Equipo, agenda, inventario y reportes

- Equipo: owner asigna una o más sucursales obligatorias a receptionist y
  barber. Para barber solo queda la gestión de servicios/capacidades, no el
  horario.
- Agenda: selector visible de sucursal; receptionist no ve datos fuera de sus
  asignaciones y barber sigue limitado a sus propias citas.
- Inventario: ya es por `locationId`; debe exponer selector y rechazar el
  `locationId` ajeno en cada ruta. Las existencias nunca se consolidan para
  editar; el owner puede ver un resumen agregado de solo lectura.
- Reportes y dashboard: filtro “Todas las sucursales” solo para owner/manager;
  por defecto usan la sucursal activa. Las respuestas incluyen `locationId` y
  `locationName` para agrupar sin ambigüedad.

## Compatibilidad y migración segura

1. Añadir `primaryLocationId` nullable y poblarla sin modificar sucursales ni
   horarios existentes.
2. Hacer obligatoria la selección/validación de `locationId` en rutas nuevas o
   modificadas. Mantener temporalmente compatibilidad de lectura para clientes
   antiguos, con telemetría de llamadas sin ubicación.
3. Cambiar disponibilidad y creación/reprogramación de citas para ignorar
   `WeeklySchedule` y `ScheduleBlock`. No borrar esas tablas ni registros en
   esta entrega.
4. Crear/copiar configuración de sucursal desde principal solo para sucursales
   nuevas; no sobrescribir configuraciones de sucursales existentes.
5. Cambiar caja de “una abierta por organización” a “una abierta por sucursal”
   y corregir todas las consultas `current`, `summary`, `history`, `detail`,
   `open`, `close` y `movements` para filtrar por ubicación autorizada.
6. Migrar cajas existentes con `locationId = null` solo después de una regla
   auditable de resolución. Si no puede deducirse una sucursal de forma segura,
   conservarlas como historial organizacional de solo lectura y no asignarlas
   arbitrariamente.
7. Eliminar UI y permisos muertos de horario profesional únicamente cuando la
   API nueva y las pruebas estén activas.

No se hará migración destructiva de `WeeklySchedule`, `ScheduleBlock`, citas,
movimientos, inventario o auditoría hasta definir una política de retención y
una ventana de reversión.

## Riesgos detectados en la implementación actual

- La caja ya guarda `locationId`, pero busca la caja abierta por organización;
  hoy no aísla completamente la operación simultánea entre sucursales.
- La resolución actual de caja toma la primera `MemberLocation`, lo cual es
  inadecuado para un colaborador multi-sucursal y no representa una selección
  de usuario.
- Al crear sucursal se crean horarios fijos 09:00–18:00 y se asigna el catálogo
  al owner; no se copia literalmente la configuración de la principal. Esta
  extensión define el comportamiento deseado sin suponer que ya existe.
- Inventario ya mantiene existencias por ubicación, pero todas sus rutas deben
  revisarse con la misma política de sucursal activa y autorización uniforme.

## Pruebas de aceptación

1. Una reserva en A se puede crear dentro del horario de A aunque el antiguo
   horario del barbero esté vacío, y se rechaza fuera del horario de A.
2. Editar el horario de A no cambia B; crear C copia el horario y servicios
   habilitados de la principal, y luego C puede editarse independientemente.
3. Deshabilitar un servicio en B impide nuevas reservas/ventas en B, no en A,
   y no cambia citas existentes.
4. Receptionist asignado a A no puede abrir, ver, cobrar ni consultar caja de
   B mediante UI, URL o petición directa. Sus movimientos contienen A.
5. Owner abre cajas en A y B simultáneamente; los totales, cierres e historiales
   son independientes y llevan etiqueta de sucursal.
6. Un cobro de cita de A en caja B y una venta que descuente stock de otra
   sucursal devuelven error de validación.
7. Un colaborador asignado a A y B cambia explícitamente de sucursal; cada
   acción posterior queda registrada en la seleccionada, nunca en “la primera”.
8. Owner ve filtros por sucursal y consolidado de citas, caja e inventario;
   receptionist/barber solo ven sus sucursales permitidas.
9. Las cajas, citas, movimientos y horarios anteriores se conservan tras la
   migración; ninguna sucursal existente recibe una copia automática que
   sobrescriba su configuración.
