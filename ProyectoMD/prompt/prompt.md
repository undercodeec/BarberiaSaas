# Plan de desarrollo — autorización por rol y protección de datos de clientes

**Estado:** núcleo de autorización implementado el 26 de agosto de 2026;
endurecimiento operativo avanzado pendiente.

### Avance de ejecución

- [x] Matriz confirmada para `owner`, `manager`, `receptionist`, `barber` y
      operadores de plataforma.
- [x] Permisos `client.*` centralizados y probados.
- [x] Alcance de directorio y ficha aplicado en servidor por organización,
      sucursal asignada o citas propias.
- [x] Teléfono enmascarado y correo omitido en respuestas restringidas.
- [x] Agenda enmascara contacto y restringe sucursales de colaboradores.
- [x] Barbero consulta y crea únicamente sus notas propias.
- [x] CRUD completo para `owner`/`manager` y exportación backend exclusiva del
      `owner`, con auditoría sin valores PII.
- [x] Mobile oculta acciones no autorizadas y separa/invalida caché por rol.
- [ ] Añadir paginación y límites de frecuencia al directorio y exportación.
- [ ] Implementar flujo excepcional, temporal y aprobado para soporte si el
      negocio lo requiere en el futuro.
- [ ] Ejecutar la matriz completa contra PostgreSQL aislado y E2E físico antes
      del despliegue productivo.

## 1. Objetivo y decisión de seguridad

Aplicar autorización de servidor basada en **rol, acción, alcance y campo de
dato**. Una sesión válida y pertenecer a la misma organización no bastan para
leer, modificar ni exportar información de clientes.

Decisión confirmada de producto: el **propietario (`owner`)** y el
**administrador del negocio (`manager`)** pueden gestionar datos personales de
identificación y contacto de la cartera autorizada: teléfono, correo,
dirección, documento, fecha de nacimiento, notas y fotografías. La exportación
ordinaria queda limitada a `owner` para reducir el riesgo de extracción masiva.

La aplicación no debe confiar en la visibilidad de botones, rutas móviles ni
en datos enviados por el cliente: la API será siempre la fuente de autoridad.

## 2. Hallazgo que se corrige

La API actual de `/v1/clients` limita por organización, pero no consulta el
rol ni un permiso de clientes. Por ello un `barber`, `receptionist` o `manager`
activo puede listar, consultar, crear, editar, borrar, anotar y exportar datos
de toda la cartera, incluido teléfono y documento. El módulo Agenda limita al
barbero a su propia agenda, pero devuelve teléfono y correo de sus citas y el
módulo Clientes permite evitar ese límite.

El diseño debe corregir ambos caminos y evitar respuestas con campos que el
solicitante no necesita.

## 3. Modelo de autorización propuesto

### 3.1 Roles de negocio existentes

| Rol actual                | Alcance de clientes                                         | Datos personales                  | Acciones permitidas                                                                                                             |
| ------------------------- | ----------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `owner` (propietario)     | Toda la organización y sus sucursales                       | Completos                         | CRUD, etiquetas, notas, fotografías, historial, comunicación y exportación.                                                     |
| `manager` (administrador) | Toda la organización y sus sucursales                       | Completos                         | CRUD, etiquetas, notas, fotografías, historial y comunicación; sin exportación masiva.                                          |
| `receptionist`            | Clientes relacionados con citas de sus sucursales asignadas | Nombre y teléfono **enmascarado** | Consulta el directorio operativo y gestiona citas; no exporta, importa, edita PII, lee notas privadas ni elimina clientes.      |
| `barber`                  | Solo clientes de citas donde es el profesional asignado     | Nombre y teléfono **enmascarado** | Consulta clientes relacionados y registra/lee únicamente sus notas propias; no exporta, importa, edita PII ni elimina clientes. |

El teléfono enmascarado tendrá formato consistente, por ejemplo `*** *** 6789`.
No se enviará el número completo a la app para luego ocultarlo visualmente.

### 3.2 Roles de plataforma existentes

`SUPER_ADMIN`, `SUPPORT`, `BILLING`, `OPERATIONS` y `READ_ONLY` pertenecen a
la plataforma Nava, no a una barbería. No heredan permisos sobre PII de los
clientes de un negocio. Las pantallas operativas mostrarán conteos y estados
agregados. Un acceso excepcional de soporte a datos identificables requerirá
una solicitud aprobada, motivo, expiración corta, registro inmutable y aviso al
owner; no formará parte del flujo normal de soporte.

### 3.3 Principios no negociables

- Denegar por defecto: un permiso inexistente no autoriza nada.
- Separar permisos de negocio de permisos de plataforma.
- Resolver organización, membresía activa y sucursal en servidor; nunca desde
  `organizationId`, `role` o `membershipId` enviados por móvil/web.
- Aplicar el alcance de sucursal y de profesional también en consultas por ID,
  notas, etiquetas, historial, búsquedas y mutaciones.
- Minimizar campos en cada contrato API; no devolver PII “por si acaso”.
- Registrar accesos y exportaciones de PII sin almacenar el valor del teléfono,
  correo o documento en el log.

## 4. Catálogo de permisos

Extender `packages/permissions` con permisos explícitos; no reutilizar
`appointment.read` como permiso de datos personales.

```text
client.directory.read                 # listado y búsqueda global
client.record.read                    # ficha e historial
client.contact.read_full              # teléfono/correo sin máscara
client.contact.read_masked            # teléfono/correo minimizados
client.personal_data.read             # dirección, documento, nacimiento
client.create
client.update
client.delete
client.note.read
client.note.create
client.note.manage
client.label.manage
client.export
client.contacts.import
client.communication.initiate         # llamar/WhatsApp con número completo
```

Asignación inicial:

- `owner`: todos los permisos anteriores.
- `manager`: todos salvo `client.export`.
- `receptionist`: `client.directory.read`, `client.record.read` y
  `client.contact.read_masked`, condicionados a las sucursales asignadas.
- `barber`: `client.directory.read`, `client.record.read`,
  `client.contact.read_masked`, `client.note.read` y `client.note.create`,
  condicionados a citas propias; solo puede consultar sus notas propias.

No se implementarán roles "custom" del onboarding como autoridad en backend
hasta que exista un modelo persistente, validado y administrable de permisos.
Mientras tanto deben mapearse a uno de los roles de membresía existentes.

## 5. Diseño técnico de la API

1. Crear un servicio central `authorization` con:
   - `requireActiveMembership(request)`;
   - `requirePermission(context, permission)`;
   - `requireClientScope(context, clientId, action)`;
   - `requireAppointmentScope(context, appointmentId, action)`.
     Debe devolver un contexto inmutable con `organizationId`, rol, membresía,
     sucursales asignadas y, para barberos, su `membershipId`.

2. Añadir una política de relaciones cliente-profesional. Para el barbero, un
   cliente queda relacionado solo si existe una cita de su membresía dentro de
   la organización. La consulta siempre incluirá `organizationId`,
   `professionalMembershipId` y, cuando aplique, `locationId` asignada.

3. Sustituir `publicClient` por serializadores por propósito:
   - `clientDirectoryOwner`: datos necesarios para el directorio del owner;
   - `clientDetailOwner`: ficha completa autorizada;
   - `appointmentClientMinimal`: nombre y teléfono/correo enmascarados;
   - `clientAggregate`: métricas sin identidad.
     Tipar contratos diferentes en `packages/api-client` para impedir que la UI
     reciba accidentalmente una ficha completa.

4. Proteger cada endpoint actual:

| Recurso                         | Regla final                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /v1/clients` y búsqueda    | `owner`/`manager`: organización; `receptionist`: citas de sucursales asignadas; `barber`: citas propias. Datos enmascarados para los dos últimos.            |
| `GET /v1/clients/:id`           | Mismo alcance que el listado; ficha completa solo para `owner`/`manager`.                                                                                    |
| `POST/PATCH/DELETE /v1/clients` | `owner` y `manager`, con verificación de organización.                                                                                                       |
| Notas                           | `owner`/`manager`: todas; `barber`: solo notas propias de clientes relacionados; `receptionist`: sin acceso.                                                 |
| Fotografías y etiquetas         | Solo `owner`/`manager`; validar también el cliente padre.                                                                                                    |
| Importación de contactos        | Solo `owner`/`manager`; pedir permiso nativo solo después de autorizar en API/UI.                                                                            |
| Exportación                     | Nuevo endpoint de exportación solo para `owner`; generar archivo temporal, cifrado/protegido donde aplique, registrar evento y borrar al expirar.            |
| Agenda y eventos de cita        | Filtrar por sucursal y profesional antes de serializar; usar el contrato mínimo para `barber`/`receptionist`, nunca `clientPhone` o `clientEmail` completos. |

5. El endpoint de exportación debe ser servidor-side, paginado y con límites de
   frecuencia. No se debe exportar desde la caché completa del móvil. Incluir
   confirmación explícita, motivo opcional y evento `CLIENT_EXPORT_CREATED`.

6. Crear `AuditLog` para `CLIENT_READ_FULL`, `CLIENT_CONTACT_REVEALED`,
   `CLIENT_CREATED`, `CLIENT_UPDATED`, `CLIENT_DELETED`, `CLIENT_NOTE_*`,
   `CLIENT_EXPORT_CREATED` e `CLIENT_CONTACT_IMPORT_*`. El evento almacena actor,
   organización, cliente o cantidad afectada, rol, IP/sesión y resultado; no PII
   en `beforeData`, `afterData` ni `metadata` salvo identificadores internos.

7. Revisar índices para las consultas de alcance: citas por
   `organizationId + professionalMembershipId + clientId`, y relaciones de
   clientes por organización. Ejecutar migración compatible y plan de rollback.

## 6. Cambios en móvil y web

1. Obtener una capacidad efectiva desde `/v1/organization/current` o un
   endpoint dedicado. La UI utiliza esas capacidades únicamente para experiencia
   de usuario; nunca como barrera de seguridad.
2. Ocultar Clientes, importación, selección masiva, exportación, edición,
   notas y acciones de llamada/WhatsApp cuando la capacidad no exista.
3. Para Agenda, usar el nuevo contrato mínimo. No conservar teléfono completo
   en React Query, estado de componente, logs, analytics ni notificaciones.
4. Limpiar caché de React Query al cerrar sesión, cambiar de organización,
   revocar una membresía o cambiar de rol. Separar las claves por usuario,
   organización y capacidad/contrato para evitar que un owner deje PII visible a
   un colaborador en el mismo dispositivo.
5. Tratar `403` como cambio de permisos: invalidar datos protegidos, regresar a
   una pantalla permitida y mostrar un mensaje neutro de acceso no autorizado.
6. Revisar panel web/admin con las mismas capacidades. El panel de plataforma
   no debe consumir endpoints de ficha de cliente del negocio.

## 7. Migración, despliegue y compatibilidad

### Fase A — Inventario y especificación (bloqueante)

- Inventariar todos los endpoints, consultas Prisma, jobs, webhooks,
  notificaciones, exports y pantallas que contienen `phone`, `email`,
  `documentNumber`, dirección, fecha de nacimiento, notas o fotos.
- Elaborar una matriz endpoint × rol × acción × campo × alcance, aprobada por
  producto y responsable de privacidad.
- Definir la ventana exacta de acceso mínimo de barbero/recepcionista y si
  pueden iniciar una llamada sin revelar el número; si se requiere, usar una
  acción de comunicación auditada del servidor.

### Fase B — Backend primero

- Incorporar permisos, contexto y serializadores.
- Cambiar contratos API y eliminar campos no autorizados de respuestas de
  Agenda, Clientes, eventos y exportaciones.
- Añadir auditoría, límites de tasa y pruebas antes de desplegar la UI.
- Publicar en modo observación inicialmente: registrar decisiones de permiso
  sin bloquear únicamente en entorno de staging, comparar con la matriz y luego
  activar denegación en producción.

### Fase C — Clientes consumidores

- Actualizar móvil, web y admin para los contratos reducidos.
- Eliminar la exportación local basada en caché y el teléfono completo fuera de
  las pantallas del owner.
- Liberar primero a usuarios internos y una barbería piloto; monitorear 403,
  errores de serialización y auditoría durante 7 días.

### Fase D — Activación y limpieza

- Activar denegación por defecto y retirar endpoints/contratos heredados.
- Invalidar cachés/sesiones activas si es necesario y comunicar el cambio a los
  negocios.
- Revisar mensualmente los accesos PII, exportaciones y cuentas de plataforma.

## 8. Pruebas y criterios de aceptación

### Pruebas automatizadas obligatorias

- Unitarias de la matriz completa: cada permiso permitido y denegado por rol.
- Integración API para todos los endpoints de cliente con owner, manager,
  receptionist, barber, membresía suspendida, usuario sin membresía y tenant
  ajeno.
- Pruebas de respuesta: comprobar que los JSON de `barber` y `receptionist` no
  contienen teléfono/correo completo, documento, dirección, nacimiento, notas,
  fotos ni campos alternativos equivalentes.
- Pruebas de alcance: un barbero no puede consultar por ID un cliente de otro
  profesional, aunque conozca el UUID; tampoco puede inferir existencia por la
  diferencia entre 403 y 404.
- E2E móvil: navegación directa/deep link a Clientes y detalle, caché tras
  cambio owner→barber, importación/exportación, llamada/WhatsApp y recepción de
  un 403 durante una sesión abierta.
- Pruebas de auditoría: cada acceso y exportación autorizada deja un evento sin
  PII; los rechazos sensibles quedan registrados de forma segura.

### Criterios de salida

- Un `barber` o `receptionist` no puede obtener el teléfono completo
  mediante API, UI, caché, exportación, búsqueda, agenda, evento, deep link ni
  una respuesta de error.
- Solo `owner` y `manager` pueden leer, crear, editar, eliminar o importar la
  ficha completa de clientes de su organización; solo `owner` puede exportarla.
- Ningún rol, incluido uno de plataforma, accede a PII de clientes sin una
  política explícita y un evento de auditoría.
- La protección se mantiene aunque se modifique la aplicación móvil, se invoque
  un endpoint manualmente o se conozca un identificador válido.
- Las pruebas de autorización y de no filtración de campos son requisito de CI
  para cada endpoint nuevo o modificado.

## 9. Decisiones que requieren validación de producto

1. Confirmar si recepción necesita teléfono completo para atender reservas. La
   decisión vigente es no revelarlo y habilitar, si llega a ser imprescindible,
   una capacidad específica, temporal y auditada.
2. Aprobar retención, exportación y revisión de los eventos de auditoría según
   la política de privacidad aplicable.
