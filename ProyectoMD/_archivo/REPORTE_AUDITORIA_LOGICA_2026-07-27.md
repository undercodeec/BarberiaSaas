# Auditoría de lógica y riesgos funcionales

Fecha de corte: 2026-07-27 13:35, America/Guayaquil.

## 1. Resumen ejecutivo

El proyecto compila, pero el estado actual no es funcionalmente seguro para un
piloto. La revisión encontró cuatro riesgos críticos:

1. El onboarding móvil vigente marca la cuenta como completada sin crear la
   organización, la sucursal ni la membresía operativa.
2. Los colaboradores y servicios capturados durante el onboarding nunca se
   convierten en el equipo y los servicios reales de la organización.
3. Una persona invitada que todavía no tiene cuenta queda dirigida a un login
   desde el cual no puede registrarse conservando la invitación.
4. La protección PostgreSQL evita materialmente una doble reserva, pero la API
   devuelve HTTP 500 en lugar del conflicto HTTP 409 esperado. Este fallo fue
   reproducido con la suite real contra `postgres-test`.

Además, el motor de agenda permite transiciones de estado incoherentes, el
reenvío de OTP reinicia los intentos fallidos, existen carreras que pueden
asignar una cuenta a más de una organización y la interfaz de agenda usa la zona
horaria del dispositivo en lugar de la del local.

Conclusión: las fases 1–3 tienen piezas valiosas y varias garantías correctas,
pero los flujos actualmente conectados en la app móvil no cumplen todavía el
ciclo que declara `ESTADO_PROYECTO.md`. Antes de continuar con reservas públicas
conviene corregir los hallazgos críticos y altos de este informe.

## 2. Alcance revisado

Se revisaron:

- Los tres documentos solicitados en `ProyectoMD`.
- README, ADR, documentación de producto, base de datos y pruebas.
- Esquema Prisma y las 15 migraciones presentes al momento del corte.
- API Fastify: autenticación, verificación, onboarding, invitaciones, equipo,
  servicios, horarios y agenda.
- App Expo: autenticación, registro, invitaciones, onboarding, dashboard,
  operaciones y agenda.
- Cliente HTTP, validaciones, permisos y paquetes compartidos.
- Apps web y admin, configuración del monorepositorio y CI.
- Pruebas unitarias e integración PostgreSQL.

Se excluyeron de la revisión de lógica `node_modules`, artefactos `.next`,
salidas `dist` y código Android generado. Sí se revisó la configuración Android
propia cuando era relevante.

El repositorio tenía cambios locales no confirmados mientras se realizó la
auditoría. No se modificó la aplicación. El único cambio de archivos realizado
por esta auditoría es este informe. Para las pruebas se actualizaron las
migraciones únicamente en la base aislada `barber_saas_test`.

## 3. Criterio de severidad

- **Crítica:** bloquea un flujo central, rompe aislamiento o produce un estado
  operativo grave.
- **Alta:** puede causar errores de negocio, pérdida de continuidad o
  inconsistencias relevantes.
- **Media:** defecto real con alcance limitado, recuperable o dependiente de una
  condición menos frecuente.
- **Baja:** robustez, mantenibilidad o defensa adicional sin fallo inmediato
  demostrado.

## 4. Hallazgos críticos

### LOG-001 — El onboarding vigente termina sin crear la barbería

**Severidad:** crítica.

**Evidencia:**

- `apps/mobile/app/(onboarding)/account-setup.tsx:28` inicia el recorrido en
  `organization`.
- `apps/mobile/app/(onboarding)/organization.tsx:285` continúa a `services`.
- `apps/mobile/app/(onboarding)/services.tsx:153` continúa a
  `account-details`.
- `apps/mobile/app/(onboarding)/account-details.tsx:172` continúa a
  `congratulations`.
- `apps/mobile/app/(onboarding)/congratulations.tsx:45-56` llama
  `/v1/onboarding/complete-account-setup` y redirige a `dashboard`.
- `apps/api/src/app.ts:936-953` muestra que ese endpoint solo escribe
  `user_registration_profiles.onboarding_completed_at`.
- La creación real de organización, sucursal, membresía y asignación vive en
  otro endpoint, `/v1/onboarding`, en `apps/api/src/app.ts:1049-1114`, que el
  recorrido vigente nunca invoca.
- `apps/mobile/app/(onboarding)/dashboard.tsx:1038-1062` responde “no
  disponible” para Agenda, Caja, Equipo y Ajustes.

**Escenario:**

1. Una cuenta nueva verifica su correo.
2. Registra colaboradores, servicios y datos de cuenta.
3. Pulsa “Ir al inicio”.
4. La cuenta queda marcada como onboarding completado.
5. `/v1/organizations/current` continúa devolviendo `organization: null`.
6. El usuario entra al dashboard visual, pero no puede usar la aplicación
   operativa de las fases 2–3.

**Impacto:** el flujo principal anunciado como completado no crea la entidad
multi-tenant necesaria para operar. La cuenta queda en un estado intermedio que
la navegación interpreta como final.

**Recomendación:** unificar la finalización en una sola transacción de backend
que cree organización, local, membresía, equipo, servicios y horarios; escribir
`onboarding_completed_at` únicamente al final de esa transacción. La navegación
debe basarse en una organización activa, no solo en el timestamp del perfil.

### LOG-002 — Los borradores de colaboradores y servicios nunca se materializan

**Severidad:** crítica.

**Evidencia:**

- Los colaboradores se guardan en `onboarding_collaborators` por `owner_user_id`
  (`apps/api/src/app.ts:954-1014`).
- Los servicios se guardan en `onboarding_services`
  (`apps/api/src/app.ts:1017-1046`).
- La transacción real de `/v1/onboarding` solo crea `Organization`, `Location`,
  `Membership`, `MemberLocation` y un `AuditLog`
  (`apps/api/src/app.ts:1053-1112`).
- Esa transacción no lee ninguna de las dos tablas de borradores ni crea
  `memberships`, `services`, `professional_services` o `weekly_schedules` a
  partir de ellas.

**Impacto:** aun accediendo manualmente al endpoint antiguo que crea la
barbería, el equipo y los servicios mostrados como guardados durante el
onboarding no aparecen en los módulos operativos. Los datos quedan aislados en
tablas temporales sin consumidor.

**Recomendación:** definir explícitamente el mapeo de cada rol de onboarding al
modelo real, crear usuarios reclamables/invitaciones, categorías, servicios,
asignaciones y horarios en la misma transacción, y eliminar o marcar como
consumidos los borradores.

### LOG-003 — El alta de una persona invitada nueva queda bloqueada

**Severidad:** crítica.

**Evidencia:**

- Una invitación crea anticipadamente un `User` con `passwordHash: null`
  (`apps/api/src/operations.ts:232-275`).
- Al abrir el enlace sin sesión,
  `apps/mobile/app/(onboarding)/accept-invitation.tsx:33-41` redirige al login
  conservando el token.
- `LoginFullScreen` solo permite iniciar sesión, recuperar acceso o volver al
  inicio. Sus regresos usan `router.replace('/')`
  (`apps/mobile/src/components/LoginFullScreen.tsx:37,47`) y no ofrece “Crear
  cuenta” conservando `invitationToken`.
- El registro sí sabe continuar a la aceptación cuando recibe el token
  (`apps/mobile/src/components/RegistrationFlow.tsx:322-328`), pero no existe un
  enlace desde el login que llegue a ese registro con el parámetro.

**Impacto:** una persona que todavía no tiene contraseña no puede iniciar
sesión, y al volver al inicio pierde el token del enlace profundo. El flujo
normal de invitación de un integrante nuevo no puede completarse.

**Recomendación:** detectar que el correo invitado no tiene credenciales o
mostrar en el login una acción de registro que preserve el token. El token debe
permanecer en un estado seguro hasta completar registro, verificación y
aceptación.

### LOG-004 — Una reserva concurrente devuelve HTTP 500

**Severidad:** crítica.

**Evidencia reproducida:**

La suite API se ejecutó contra PostgreSQL aislado después de aplicar sus
migraciones:

```text
FAIL evita doble reserva bajo concurrencia y publica el evento
esperado: [201, 409]
recibido: [201, 500]
```

La restricción `appointments_no_professional_overlap` sí impide que se creen dos
filas solapadas. El problema está en la traducción del error:
`apps/api/src/agenda.ts:332-338` identifica el conflicto buscando textos
específicos dentro de `error.message`; el error real emitido por Prisma 7 no
coincidió y terminó en el manejador genérico HTTP 500.

**Impacto:** no se produce la doble reserva, pero uno de los dispositivos ve un
error interno en lugar de “horario ocupado”. Esto induce reintentos, mala
experiencia y pérdida de confianza en la agenda.

**Recomendación:** clasificar el error por su tipo y código Prisma/PostgreSQL,
incluida la causa del adaptador `pg`, y conservar una prueba concurrente
obligatoria en CI.

## 5. Hallazgos de severidad alta

### LOG-005 — No existe una máquina de estados válida para las citas

**Severidad:** alta.

`PATCH /status` acepta cualquiera de los estados permitidos sin considerar el
estado actual (`apps/api/src/agenda.ts:757-798`). Además,
`reservesSlot` se calcula como:

```text
releasesSlot ? false : existing.reservesSlot
```

en `apps/api/src/agenda.ts:773-780`.

Una cita cancelada tiene `reservesSlot = false`. Si después se cambia a
`confirmed` o `in_progress`, queda visualmente activa, pero continúa sin
reservar el horario. Lo mismo ocurre al “reactivar” una cita completada o
marcada como no-show. Pueden coexistir dos citas aparentemente activas en el
mismo intervalo.

También se puede cancelar nuevamente una cita finalizada y saltar directamente
de programada a completada.

**Recomendación:** implementar una tabla explícita de transiciones, rechazar
estados terminales, decidir una operación separada y protegida para reapertura,
y derivar `reservesSlot` desde el nuevo estado dentro de la misma transacción.

### LOG-006 — Reprogramación, cancelación y estado tienen carreras entre sí

**Severidad:** alta.

La reprogramación lee la cita antes de abrir la transacción
(`apps/api/src/agenda.ts:620-648`) y luego actualiza por `id` sin versión ni
`SELECT ... FOR UPDATE`. Cancelar y cambiar estado siguen el mismo patrón.

Dos solicitudes concurrentes pueden validar el mismo estado anterior y escribir
resultados incompatibles. Por ejemplo, una cancelación y una reprogramación
pueden dejar una cita cancelada con horas recién cambiadas, o generar eventos
que no reflejan el orden real.

**Recomendación:** bloquear la fila dentro de la transacción o usar control
optimista con `updated_at`/versión. La validación de estado, disponibilidad,
actualización, evento y auditoría debe ocurrir en la misma transacción.

### LOG-007 — Reenviar el OTP reinicia los intentos fallidos

**Severidad:** alta, seguridad.

`issueVerificationCode` actualiza siempre:

```text
failedAttempts: 0
lockedUntil: null
```

en `apps/api/src/app.ts:342-349`. El endpoint de reenvío reutiliza esa función en
`apps/api/src/app.ts:727-752`.

Aunque se impide reenviar durante un bloqueo ya activado, después de uno a
cuatro errores basta pedir otro código para volver a tener cinco intentos. Esto
contradice directamente `ESTADO_PROYECTO.md`, que afirma que generar o reenviar
no restablece el límite.

**Recomendación:** conservar `failedAttempts` y `lockedUntil` al reenviar. Solo
un desbloqueo cumplido o una verificación correcta debe reiniciar el contador.
Agregar pruebas para “cuatro fallos → reenvío → quinto fallo”.

### LOG-008 — Una cuenta puede quedar activa en dos organizaciones por carrera

**Severidad:** alta, multi-tenant.

- `/v1/onboarding` consulta si existe membresía dentro de la transacción, pero
  no bloquea una clave común por usuario (`apps/api/src/app.ts:1053-1063`).
- La única unicidad es `(organization_id, user_id)`
  (`packages/database/prisma/schema.prisma:299`), por lo que dos organizaciones
  distintas no colisionan.
- Aceptar invitación comprueba otra organización antes de abrir su transacción
  (`apps/api/src/operations.ts:376-392`).
- Dos onboarding concurrentes, o dos invitaciones de organizaciones distintas,
  pueden pasar la comprobación y crear dos membresías activas.
- Después, `requireMembership` usa `findFirst` sin orden ni contexto explícito
  (`apps/api/src/operations.ts:47-55`, `apps/api/src/agenda.ts:47-55`).

**Impacto:** el usuario puede entrar en una organización no determinista; las
operaciones posteriores dependen de la primera fila elegida.

**Recomendación:** mientras el producto soporte una organización por cuenta,
crear una garantía de base de datos por `user_id` para membresías activas y
serializar onboarding/aceptación con bloqueo por usuario. A futuro, exigir un
contexto de organización explícito y validado.

### LOG-009 — Se publica y comparte un enlace ajeno y no operativo

**Severidad:** alta.

La API construye el enlace como
`https://book.weibook.co/{businessNameKey}` en
`apps/api/src/app.ts:849-851,909`. WeiBook es el producto competidor mencionado
en la investigación, no un dominio propio del SaaS. La fase de reservas
públicas está pendiente y `apps/web` no tiene una ruta por barbería.

La pantalla de felicitaciones permite copiar y compartir ese enlace como “tu
enlace de reservas”.

**Impacto:** se entrega al negocio un URL que puede no existir, pertenecer a un
tercero o apuntar a información no relacionada.

**Recomendación:** no exponer un enlace hasta implementar la fase 4, o generarlo
desde `PUBLIC_WEB_URL` con un slug reservado por la organización. Nunca usar el
dominio del competidor.

### LOG-010 — La agenda móvil usa la zona horaria del dispositivo

**Severidad:** alta.

- `today()` usa `getTimezoneOffset()` del teléfono
  (`apps/mobile/app/(app)/agenda.tsx:23-29`).
- Las etiquetas usan `toLocaleTimeString` sin `timeZone`
  (`apps/mobile/app/(app)/agenda.tsx:37-41`).

La API calcula correctamente con `location.timezone`, pero el móvil puede pedir
el día equivocado o mostrar otra hora si el dispositivo viaja, tiene una zona
mal configurada o administra un local remoto.

**Recomendación:** derivar fecha y etiquetas con la zona IANA devuelta por la
sucursal. Añadir pruebas para dispositivo y local en zonas diferentes.

### LOG-011 — Las imágenes se persisten como URI local del teléfono

**Severidad:** alta.

La portada, foto del colaborador e imagen de servicio guardan directamente
`result.assets[0].uri`:

- `apps/mobile/app/(onboarding)/account-details.tsx:129-160`
- `apps/mobile/src/components/CollaboratorFormSheet.tsx:146-153`
- `apps/mobile/src/components/ServiceFormSheet.tsx:178-185`

Esas URI suelen ser `file://` o rutas temporales del dispositivo. Otro teléfono
no puede abrirlas y el sistema operativo puede eliminarlas.

**Recomendación:** incorporar la abstracción de almacenamiento prevista en el
documento maestro, subir el archivo y persistir una clave/URL gestionada. Hasta
entonces, no presentar la imagen como sincronizada.

### LOG-012 — Los permisos contradicen los roles definidos

**Severidad:** alta.

- El rol `manager` no tiene `membership.manage`
  (`packages/permissions/src/index.ts:27-39`), y la UI restringe invitaciones al
  propietario (`apps/mobile/app/(app)/operations.tsx:84`).
- El rol `barber` no tiene `schedule.manage`
  (`packages/permissions/src/index.ts:49-56`).
- Los endpoints de invitación y bloqueo requieren precisamente esos permisos
  (`apps/api/src/operations.ts:208-214,697-703`).

El documento maestro indica que el administrador realiza casi todas las
operaciones del propietario y que el barbero puede bloquear horarios
autorizados.

**Recomendación:** separar permisos globales y permisos sobre recursos propios,
por ejemplo `schedule.manage_own`. Alinear backend y navegación con una matriz
de permisos probada por rol.

## 6. Hallazgos de severidad media

### LOG-013 — `serviceIds` duplicados producen disponibilidad falsa y error 500

**Severidad:** media.

Las validaciones aceptan arrays/listas con UUID repetidos
(`packages/validation/src/index.ts:302-310,323-339`). El contexto compara el
número de asignaciones con un `Set`, pero luego vuelve a recorrer el array
original (`apps/api/src/agenda.ts:215-225`).

Con `[servicioA, servicioA]` la duración se duplica y la creación intenta
insertar dos `appointment_services` iguales. La restricción única
`(appointment_id, service_id)` falla y puede terminar como HTTP 500.

**Recomendación:** exigir unicidad en Zod y conservar el orden de servicios
únicos.

### LOG-014 — La validación telefónica permite valores sin dígitos

**Severidad:** media.

`phoneSchema` solo valida longitud entre 7 y 24 caracteres
(`packages/validation/src/index.ts:27-31`), mientras la clave única elimina todo
lo que no sea dígito (`apps/api/src/app.ts:240-242`).

Por ejemplo, `-------` supera la validación y se normaliza a una clave vacía.
Además de guardar un contacto inútil, el primer caso ocupa la clave única vacía
y los siguientes reciben un conflicto engañoso.

**Recomendación:** validar y normalizar a un formato telefónico canónico antes de
persistir, exigiendo una cantidad razonable de dígitos y código de país.

### LOG-015 — El token de recuperación puede usarse dos veces en concurrencia

**Severidad:** media, seguridad.

El endpoint busca un token con `usedAt: null` antes de la transacción
(`apps/api/src/app.ts:805-821`). Dentro de la transacción actualiza por `id`, sin
volver a exigir `usedAt: null` ni bloquear la fila
(`apps/api/src/app.ts:823-836`).

Dos solicitudes simultáneas pueden encontrar el mismo token válido y establecer
dos contraseñas distintas; la última escritura gana.

**Recomendación:** consumir el token con un `updateMany` condicional o bloqueo de
fila dentro de la transacción y continuar solo si se actualizó exactamente una
fila.

### LOG-016 — Un fallo SMTP deja un integrante fantasma

**Severidad:** media.

La invitación crea/actualiza usuario, membresía `INVITED`, local e invitación en
una transacción. El correo se envía después
(`apps/api/src/operations.ts:232-337`). Si SMTP falla, el `catch` solo revoca la
invitación (`apps/api/src/operations.ts:338-343`), pero deja la membresía y su
asignación.

`GET /v1/team` lista todas las membresías, por lo que puede aparecer un
integrante que nunca recibió un token válido.

**Recomendación:** modelar entrega y reintento explícitos. Si la creación no debe
ser visible hasta enviar, revertir también la membresía nueva o filtrar perfiles
sin invitación vigente.

### LOG-017 — La caché móvil no se limpia ni se segmenta completamente por cuenta

**Severidad:** media.

`AuthProvider.signOut` borra el token y el estado de sesión, pero no limpia
TanStack Query (`apps/mobile/src/providers/AuthProvider.tsx:111-120`). Varias
claves son globales: `['team']`, `['services']`, `['appointments', ...]` y
`['appointment-events']`.

El cursor incremental también vive en `latestEventId.current` y no se reinicia
por usuario/organización (`apps/mobile/app/(app)/agenda.tsx:66,136-151`).

**Impacto:** al cambiar de cuenta en el mismo dispositivo puede mostrarse
temporalmente información cacheada de la cuenta anterior. Un cursor alto de la
organización anterior también puede hacer que la nueva pierda eventos hasta
remontar ese identificador global.

**Recomendación:** incluir `userId` y `organizationId` en todas las claves,
reiniciar cursores al cambiar de contexto y limpiar datos sensibles al cerrar
sesión.

### LOG-018 — La disponibilidad y la creación no tratan igual los bloqueos entre locales

**Severidad:** media.

En disponibilidad, los bloqueos se consultan por profesional y rango, sin
`locationId` (`apps/api/src/agenda.ts:413-419`). En `assertBookable`, el bloqueo
sí se filtra por local (`apps/api/src/agenda.ts:295-303`).

Así, un bloqueo del local A puede ocultar horarios del local B en la consulta,
pero una solicitud directa aún puede crear la cita del local B.

**Recomendación:** decidir si un bloqueo es global para el profesional o
específico del local y aplicar la misma regla en esquema, disponibilidad y
creación.

### LOG-019 — Los cambios de estado no generan auditoría

**Severidad:** media.

Crear, reprogramar y cancelar escriben `audit_logs`; cambiar estado solo escribe
`appointment_events` (`apps/api/src/agenda.ts:757-798`). El documento maestro
incluye las modificaciones de citas entre las acciones críticas auditables.

**Recomendación:** escribir `beforeData`, `afterData`, actor y local en el mismo
commit transaccional del cambio.

### LOG-020 — La base de datos no garantiza coherencia multi-tenant entre claves

**Severidad:** media como defensa de integridad.

`MemberLocation`, `ProfessionalService`, `WeeklySchedule`, `ScheduleBlock`,
`TeamInvitation` y `Appointment` usan claves foráneas independientes. La base no
garantiza que membresía, servicio y local pertenezcan a la misma organización.
La API vigente realiza varias comprobaciones correctas, pero cualquier endpoint
futuro, script o migración puede insertar relaciones cruzadas válidas para las
FK actuales.

**Recomendación:** añadir claves/índices compuestos que incorporen
`organization_id` o triggers de integridad. Mantener también las comprobaciones
de API.

## 7. Calidad, pruebas y operación

### Resultado de comandos

| Verificación                                   | Resultado                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm build`                                   | Aprobado en los 12 paquetes                                                             |
| Typecheck secuencial de database, API y mobile | Aprobado                                                                                |
| `pnpm typecheck` global                        | Falló por dos `prisma generate` concurrentes con `EEXIST`                               |
| `pnpm lint`                                    | Falló con 41 errores                                                                    |
| `pnpm format:check`                            | Falló; 31 archivos reportados                                                           |
| Jest mobile aislado                            | 4 suites, 6 pruebas aprobadas                                                           |
| Suite global inicial                           | Falló una vez por timeout de `CollaboratorFormSheet`; aislada y repetida después aprobó |
| API con PostgreSQL aislado                     | 15 aprobadas, 1 fallida; doble reserva respondió 500 en vez de 409                      |

### QA-001 — El typecheck global contiene una carrera de generación Prisma

`packages/database/package.json:10,17` ejecuta `prisma generate` tanto en
`build` como en `typecheck`. Turbo necesita el build de database para otros
paquetes y puede ejecutar ambos objetivos al mismo tiempo. Se reprodujo:

```text
EEXIST: file already exists, mkdir .../generated/prisma/internal
EEXIST: file already exists, mkdir .../generated/prisma/models
```

El código sí pasa typecheck al ejecutar los paquetes de forma secuencial.

**Recomendación:** convertir la generación en una tarea única de dependencia,
evitar que `build` y `typecheck` escriban el mismo directorio en paralelo y
comprobar CI sin caché.

### QA-002 — Las pruebas PostgreSQL se omiten silenciosamente sin variable

`apps/api/src/app.integration.test.ts:8-9` usa `describe.skip` cuando
`TEST_DATABASE_URL` no existe. En una ejecución local normal, diez pruebas
críticas aparecieron como omitidas y la suite continuó.

El job `database` de CI sí configura la variable, pero el comando local descrito
como verificación completa puede dar una falsa sensación de cobertura.

**Recomendación:** crear un script explícito `test:integration` que falle si
falta la base de pruebas y reservar el modo `skip` únicamente para `test:unit`.

### QA-003 — El estado documentado está adelantado respecto de la evidencia

`ESTADO_PROYECTO.md` afirma que lint, tipos, pruebas y el motor concurrente están
aprobados. En el corte actual:

- lint y formato fallan;
- el typecheck global falla por carrera;
- el test concurrente falla de forma determinista con HTTP 500;
- el onboarding visual no crea la organización operativa;
- la entrega de colaboradores/servicios a las tablas reales no existe.

**Recomendación:** actualizar el estado solo desde resultados reproducibles del
commit exacto y registrar el SHA o una etiqueta de versión en cada evidencia.

### QA-004 — Faltan pruebas de los escenarios que originan los defectos

Agregar como mínimo:

1. Onboarding móvil completo y comprobación de organización/equipo/servicios.
2. Invitado nuevo: enlace → registro → OTP → aceptación.
3. Cuatro OTP incorrectos → reenvío → contador conservado.
4. Transiciones inválidas de cita y reapertura de estados terminales.
5. Cancelación, reprogramación y cambio de estado concurrentes.
6. Dos onboarding simultáneos para el mismo usuario.
7. Dos invitaciones simultáneas de organizaciones diferentes.
8. `serviceIds` repetidos.
9. Teléfono sin dígitos.
10. Dispositivo y sucursal en zonas horarias distintas.
11. Cambio de cuenta en el mismo dispositivo y limpieza de caché.
12. Fallo SMTP al invitar.
13. Consumo concurrente del mismo token de recuperación.

## 8. Aspectos correctos encontrados

La auditoría también confirmó decisiones sólidas:

- La API deriva la organización desde la sesión y no acepta un
  `organizationId` arbitrario del cliente.
- Los tokens de sesión se almacenan como hash.
- Contraseñas y tokens se procesan en backend.
- El consumo de OTP usa bloqueo de fila PostgreSQL.
- Los montos de servicios operativos se guardan en centavos enteros.
- Las citas conservan snapshots de nombre, duración y precio.
- La restricción de exclusión PostgreSQL impide materialmente solapamientos
  concurrentes por profesional.
- Creación, reprogramación y cancelación de citas agrupan la mutación y el
  evento en transacciones.
- El aislamiento básico de consultas por organización está aplicado en los
  endpoints principales.
- La compilación completa del monorepositorio y la exportación web de Expo
  finalizan correctamente.

Estos puntos deben conservarse al corregir los flujos.

## 9. Orden recomendado de corrección

### Bloque 1 — Recuperar un onboarding operativo

1. Definir un único estado fuente del onboarding.
2. Crear una transacción final que materialice organización, local, equipo,
   servicios, asignaciones y horarios.
3. Marcar `onboarding_completed_at` solo al finalizar.
4. Dirigir el dashboard a módulos reales o mantenerlo fuera del flujo hasta que
   sus acciones funcionen.
5. Sustituir el enlace WeiBook por un estado “reservas aún no activadas”.

### Bloque 2 — Estabilizar agenda

1. Corregir la traducción del conflicto PostgreSQL a 409.
2. Implementar máquina de estados.
3. Serializar reprogramación, cancelación y cambio de estado.
4. Validar `serviceIds` únicos.
5. Unificar semántica de bloqueos.
6. Usar zona horaria del local en móvil.

### Bloque 3 — Cerrar riesgos de identidad y permisos

1. Reparar registro de invitados conservando el token.
2. Impedir membresías activas concurrentes en varias organizaciones.
3. Conservar contador OTP al reenviar.
4. Consumir atómicamente tokens de recuperación e invitación.
5. Alinear permisos de manager y barbero.
6. Limpiar caché al cerrar sesión o cambiar de contexto.

### Bloque 4 — Restablecer puertas de calidad

1. Hacer obligatoria la integración PostgreSQL.
2. Eliminar la carrera de `prisma generate`.
3. Corregir lint y formato, excluyendo artefactos Android generados.
4. Actualizar `ESTADO_PROYECTO.md` con el resultado verificable.

## 10. Dictamen

No se recomienda comenzar la fase 4 ni realizar un piloto con usuarios reales
antes de resolver LOG-001 a LOG-012. El riesgo principal no es que falten
módulos futuros, sino que el onboarding actual declara éxito sin crear el
entorno operativo y que los flujos de agenda e invitación tienen estados y
respuestas inconsistentes.

Después de corregir esos puntos, la base técnica existente —Fastify, Prisma,
transacciones, sesiones opacas, snapshots y exclusión PostgreSQL— es aprovechable
y permite continuar sin reescribir la arquitectura.
