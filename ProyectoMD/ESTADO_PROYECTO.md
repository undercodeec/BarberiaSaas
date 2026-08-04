# Estado del proyecto

Seguimiento basado en `INSTRUCCIONES_CODEX_BARBER_SAAS.md` y en la decisión posterior documentada en `docs/adr/0003-postgresql-prisma-y-api-en-vps.md`. Se marca `[x]` solo cuando la tarea está implementada y cuenta con la verificación indicada; `[ ]` significa pendiente o aún no demostrada.

Última actualización: 2026-08-03

## Decisión de infraestructura vigente

- [x] PostgreSQL como base de datos inicial.
- [x] Prisma ORM 7 para esquema, cliente tipado y migraciones.
- [x] API Node/Fastify como única frontera de datos para los clientes.
- [x] Despliegue inicial preparado para una VPS; no se ha realizado ningún despliegue.
- [x] Estrategia de migración futura a PostgreSQL administrado por Supabase sin acoplar el móvil a Supabase.
- [x] Supabase Auth, RPC, RLS, Storage y Realtime retirados de la implementación actual.
- [x] Snapshot PostgreSQL + Prisma incluido en el repositorio.

## Resumen por fases

- [x] Fase 0 — Inicialización del repositorio
- [ ] Fase 1 — Autenticación, organización y onboarding _(implementada y verificada localmente; autenticación SMTP y entrega a bandeja externa aprobadas)_
- [x] Fase 2 — Equipo, servicios y horarios
- [ ] Fase 3 — Motor de agenda _(implementada y verificada contra PostgreSQL; aceptación manual móvil pendiente)_
- [ ] Fase 4 — Reservas públicas _(implementada, verificada contra PostgreSQL y recorrida manualmente; quedan ajustes menores de UI/UX y configuración externa)_
- [x] Fase 5 — Clientes e historial
- [ ] Fase 6 — Caja y POS básico _(implementada técnicamente; validación manual en dispositivo físico diferida al cierre integral del MVP)_
- [x] Fase 7 — Comisiones
- [x] Fase 8 — Inventario básico
- [x] Fase 9 — Notificaciones
- [x] Fase 10 — Reportes esenciales
- [x] Fase 11 — Planes y límites
- [x] Fase 12 — Panel interno del SaaS
- [ ] Fase 13 — Estabilización del MVP

## Fase 0 — Inicialización del repositorio

- [x] Monorepositorio con pnpm y Turborepo.
- [x] Aplicaciones `mobile`, `web` y `admin` ejecutables.
- [x] Paquetes compartidos iniciales.
- [x] TypeScript estricto, ESLint y Prettier.
- [x] Catálogo de variables de entorno sin secretos reales.
- [x] Vitest, Jest Expo y Playwright configurados.
- [x] GitHub Actions configurado.
- [x] README y ADR inicial creados.
- [x] PostgreSQL y Mailpit definidos para desarrollo en `compose.yaml`.
- [x] PostgreSQL de desarrollo levantado y saludable en el puerto 5434; `postgres-test` (5433) y Mailpit también fueron verificados como saludables.

## Fase 1 — Autenticación, organización y onboarding

### Base de datos

- [x] Esquema Prisma para usuarios, sesiones y recuperación de contraseña.
- [x] Esquema Prisma para organizaciones, sucursales, membresías y asignaciones.
- [x] Roles y estados modelados como enums.
- [x] Auditoría del onboarding modelada.
- [x] Migración inicial PostgreSQL creada.
- [x] Script de reversa documentado.
- [x] Cliente Prisma 7 generado correctamente.
- [x] Esquema Prisma validado estáticamente.
- [x] Migración aplicada correctamente contra PostgreSQL local.

### API y seguridad

- [x] Registro por correo con normalización y contraseña derivada mediante `scrypt`.
- [x] Inicio y cierre de sesión.
- [x] Sesiones opacas: el cliente recibe el token y PostgreSQL guarda únicamente SHA-256.
- [x] Restauración y revocación de sesiones.
- [x] Recuperación y cambio de contraseña con tokens de un solo uso.
- [x] Envío de recuperación desacoplado mediante SMTP configurable.
- [x] Invitaciones de equipo enviadas por SMTP con enlace profundo y token de un solo uso.
- [x] Compatibilidad temporal con las variables SMTP heredadas `EMAIL_*`.
- [x] Onboarding ejecutado en una única transacción Prisma.
- [x] La organización autorizada se deriva de la sesión y membresía del servidor.
- [x] La API no confía en `organizationId` enviado por el cliente.
- [x] Bundle ejecutable de la API generado para Node.js; despliegue en VPS no iniciado.
- [x] Bundle iniciado y endpoint `/health` verificado con HTTP 200.
- [x] Conectividad autenticada con el proveedor SMTP real y entrega a bandeja verificadas en el entorno de despliegue.

### Aplicación móvil

- [x] Pantalla de bienvenida.
- [x] Pantalla de inicio de sesión.
- [x] Pantalla de registro.
- [x] Pantalla de recuperación y cambio de contraseña.
- [x] Pantalla para crear barbería.
- [x] Pantalla para configurar sucursal.
- [x] Resumen y finalización del onboarding.
- [x] Enlace profundo de invitación conservado durante registro o inicio de sesión.
- [x] Aceptación de invitación precargada desde el enlace recibido por correo.
- [x] Sesión persistida con Expo Secure Store.
- [x] Cliente Supabase eliminado; Expo consume exclusivamente la API HTTP propia.
- [x] URL pública de la API validada mediante Zod.
- [x] Portada móvil NAVA restaurada como entrada principal: fondo blanco, logo, mensaje `Bienvenido a Nava` y botones `Crear cuenta` e `Iniciar sesión`.
- [x] La antigua portada verdosa fue retirada de `app/index.tsx`; ambos botones enlazan exclusivamente con los flujos actuales.
- [x] Inicio de sesión actual en `/login`, con fondo móvil `loginbanner.png`, correo, contraseña, recuperación y regreso al inicio; la UI anterior fue retirada.
- [x] Registro guiado dentro de un panel inferior: tipo inicial, información del negocio, ubicación, horario, credenciales y revisión editable.
- [x] Catálogo mundial de países y ciudades integrado con `country-state-city`; la ciudad depende del país seleccionado.
- [x] Prefijo telefónico internacional seleccionable y detección inicial por zona horaria/región del dispositivo.
- [x] Horarios de apertura y cierre seleccionables mediante ruedas deslizables de horas y minutos.
- [x] Banner final para ingresar un código OTP de seis dígitos, reenviarlo y completar la verificación de cuenta.
- [x] El código de desarrollo local no se muestra en la interfaz; el banner presenta una cuenta regresiva `mm:ss`, bloquea la confirmación al vencer y reinicia el contador al reenviar.
- [x] Pantalla inicial de configuración de cuenta tras la verificación o el primer inicio de sesión, con acceso al onboarding de barbería y sucursal.
- [x] Onboarding visual de colaboradores como paso 1 de 4, con navegación de regreso, progreso, ilustración Nava y controles coherentes con la pantalla de inicio de sesión.
- [x] Panel inferior para añadir colaboradores con fotografía de perfil, nombre y tipo obligatorios, descripción, roles de barbero/administrador y creación de roles personalizados con permiso para realizar servicios.
- [x] Onboarding visual de servicios como paso 2 de 4, accesible al registrar al menos un colaborador y pulsar `Siguiente`.
- [x] Panel inferior para añadir borradores de servicios con nombre, descripción, duración y precio validados, usando la ilustración `imagenServicios.png`.
- [x] Formulario y componentes antiguos de login/registro retirados; las rutas cargan exclusivamente `LoginFullScreen` y `RegistrationFlow`.

### Flujo vigente de registro y verificación

1. Desde la bienvenida, la persona selecciona `Crear cuenta`.
2. El panel inferior solicita si se registra como negocio o profesional.
3. Se recopilan nombre, nombre del negocio y teléfono con prefijo internacional.
4. Se seleccionan país y ciudad desde el catálogo mundial.
5. Se seleccionan apertura y cierre mediante ruedas de hora y minutos.
6. Se recopilan correo, contraseña y confirmación.
7. Se muestra un resumen editable de toda la información.
8. `Completar registro` crea únicamente una solicitud temporal en `pending_registrations`; todavía no inserta ni activa una cuenta en `users`.
9. La solicitud temporal conserva los hashes de contraseña y OTP, correo, nombre, tipo de cuenta, negocio, teléfono, país, ciudad, horario y expiración. El OTP vence en 10 minutos y un reenvío reemplaza el código anterior.
10. El correo se envía mediante el SMTP configurable del proyecto. En entorno local, la API puede incluir el código de desarrollo para pruebas automatizadas, pero la interfaz nunca lo muestra.
11. El banner de verificación permite ingresar o reenviar el código y presenta la vigencia restante como cuenta regresiva `mm:ss`.
12. Un código válido elimina atómicamente la solicitud temporal, crea o activa `users`, establece `email_verified_at` y crea la primera sesión.
13. Un código vencido, incorrecto o reutilizado es rechazado. Cada fallo reduce los intentos disponibles.
14. Al quinto código incorrecto, el correo queda bloqueado durante 15 minutos con respuesta HTTP `429 VERIFICATION_RATE_LIMITED`. El bloqueo también impide registrar o reenviar otro código y se serializa mediante bloqueo de fila PostgreSQL.
15. Después de verificar, continúa el onboarding de organización o la aceptación de invitación conservada.

### Persistencia y API de verificación

- [x] Campo `users.email_verified_at` modelado en Prisma.
- [x] Tabla `email_verification_codes` con hash, expiración, consumo y relación en cascada con usuario.
- [x] Migración `20260724180000_email_verification_codes` y reversa SQL creadas.
- [x] Tabla `pending_registrations` para conservar la solicitud temporal sin crear `users`, con hashes, expiración, intentos fallidos y bloqueo.
- [x] Migraciones `20260725183000_pending_registrations` y `20260725190000_verification_attempt_limits`, con reversas SQL, creadas y aplicadas en desarrollo y pruebas.
- [x] `POST /v1/auth/register` devuelve una solicitud pendiente en lugar de crear cuenta o sesión.
- [x] `POST /v1/auth/verify-email` valida y consume el OTP, verifica usuario y crea sesión.
- [x] `POST /v1/auth/resend-verification` invalida códigos pendientes y emite uno nuevo.
- [x] `POST /v1/auth/login` bloquea cuentas no verificadas.
- [x] Máximo de cinco intentos OTP fallidos por correo, bloqueo de 15 minutos y HTTP `429`; generar o reenviar otro código no restablece el límite.
- [x] Plantilla SMTP `Verifica tu cuenta de Nava` implementada.
- [x] Migraciones OTP y solicitudes pendientes aplicadas a PostgreSQL local (`5434`) y a la base aislada de pruebas (`5433`).
- [x] Entrega del OTP comprobada con el proveedor SMTP real en una bandeja externa.
- [x] Los datos ampliados del registro (tipo de cuenta, negocio, teléfono, país, ciudad y horario) se conservan temporalmente en `pending_registrations` y, tras verificar el correo, se trasladan a `users` y `user_registration_profiles`, relacionados mediante el `user_id` único.
- [ ] Añadir limitación general de frecuencia por IP para registro y reenvío antes de producción; la limitación de intentos OTP por correo ya está implementada.

### Persistencia de perfil, continuidad del onboarding y unicidad

- [x] El registro móvil envía `accountType`, `businessName`, teléfono con prefijo, `countryCode`, ciudad, apertura y cierre junto con las credenciales.
- [x] `pending_registrations` conserva esos datos mientras el correo continúa pendiente de verificación, sin crear anticipadamente una cuenta activa.
- [x] La verificación crea o actualiza `users`, almacena el teléfono y realiza `upsert` de `user_registration_profiles`.
- [x] `user_registration_profiles.user_id` es simultáneamente clave primaria y clave foránea a `users.id`; cada perfil ampliado pertenece a un único usuario.
- [x] Migración `20260725203000_user_registration_profiles` creada y aplicada en PostgreSQL de desarrollo y pruebas.
- [x] Migración `20260725213000_unique_registration_identity` creada y aplicada en PostgreSQL de desarrollo y pruebas.
- [x] Correo normalizado en minúsculas y protegido por unicidad.
- [x] Teléfono normalizado ignorando espacios, guiones y caracteres de formato; protegido por claves e índices únicos tanto en solicitudes pendientes como en perfiles verificados.
- [x] Nombre de negocio normalizado ignorando mayúsculas, acentos, puntuación y espacios equivalentes; protegido por claves e índices únicos.
- [x] La migración reconcilia duplicados históricos conservando una clave canónica y evita nuevos duplicados.
- [x] `POST /v1/auth/registration-availability` comprueba simultáneamente correo, teléfono y negocio en registros pendientes vigentes y usuarios verificados.
- [x] Códigos de conflicto específicos: `EMAIL_ALREADY_EXISTS`, `PHONE_ALREADY_EXISTS` y `BUSINESS_NAME_ALREADY_EXISTS`.
- [x] Al pulsar `Siguiente` en información del negocio, el móvil consulta disponibilidad de nombre y teléfono; muestra el error bajo el `label` correspondiente y no avanza.
- [x] Al pulsar `Siguiente` en credenciales, el móvil consulta la disponibilidad del correo; muestra el error bajo el campo y no avanza.
- [x] Una colisión concurrente detectada al completar el registro devuelve al paso correcto y conserva el mensaje bajo negocio, teléfono o correo.
- [x] Una sesión autenticada sin organización activa es redirigida a `/(onboarding)/account-setup`, incluso al restaurar o abrir directamente una ruta protegida.
- [x] El grupo `/(app)` bloquea el acceso hasta confirmar una organización activa; los errores de red presentan reintento y no se interpretan como onboarding incompleto.
- [x] Una cuenta ya configurada que abre `account-setup` regresa a `/(app)` y no puede duplicar su configuración.

### Preloader y ajustes visuales móviles

- [x] Preloader `NavaPreloader` integrado como capa inicial en el layout raíz durante 3,2 segundos.
- [x] Logotipo animado compuesto por cuatro recursos rasterizados, entrada escalonada de piezas, brillo enmascarado y aparición del wordmark.
- [x] Dependencia `@react-native-masked-view/masked-view` instalada para limitar el brillo a la pieza diagonal.
- [x] Recursos del preloader almacenados en `apps/mobile/assets/preloader`.
- [x] Separador y franja decorativa de la bienvenida ajustados a negro translúcido.
- [x] Indicador activo de los pasos de colaboradores y servicios ajustado a negro.
- [x] Prompt visual del onboarding reorganizado en `ProyectoMD/prompt/prompt.md`.

### Pruebas y calidad

- [x] Pruebas unitarias de criptografía, validación, permisos, transporte y componente móvil creadas.
- [x] Prueba de integración para onboarding atómico creada.
- [x] Prueba de aislamiento entre dos organizaciones creada.
- [x] Tipos aprobados en base de datos, validación, cliente API, API y móvil.
- [x] Pruebas unitarias ejecutadas: 23 aprobadas.
- [x] Bundle de la API generado correctamente.
- [x] Suite API/PostgreSQL actual: 14 de 14 pruebas aprobadas, incluida persistencia por `user_id`, ausencia de `users` antes de verificar, bloqueo tras cinco OTP incorrectos, disponibilidad y rechazo de correo, teléfono y negocio duplicados.
- [x] Lint, tipos, pruebas unitarias y builds del monorepositorio aprobados después del cambio de arquitectura.
- [x] UI móvil verificada con TypeScript, ESLint y cuatro pruebas de componentes.
- [x] Typecheck secuencial aprobado en los 12 paquetes, lint global sin advertencias y export web de Expo completado con los recursos del preloader.

### Colaboradores persistentes durante onboarding

- [x] Colaboradores de onboarding persistidos por usuario antes de crear la organización.
- [x] Edición y eliminación desde la pantalla de organización.
- [x] Identificación, teléfono y color de agenda; selector accesible de 40 colores.
- [x] Migración `20260725230000_onboarding_collaborators` aplicada en desarrollo y `postgres-test` el 2026-07-25.
- [x] CRUD de API/PostgreSQL (15/15), validación (14/14), Jest Expo (3/3), TypeScript y ESLint aprobados.

## Fases funcionales

### Fase 2 — Equipo, servicios y horarios

- [x] Profesionales representados por membresías y asignaciones de sucursal.
- [x] Invitaciones con token opaco, expiración, aceptación y auditoría.
- [x] Perfiles `INVITED` configurables por el propietario antes de la aceptación.
- [x] Acceso del integrante bloqueado hasta registrarse y aceptar el enlace recibido por email.
- [x] Categorías y servicios con precio y duración validados.
- [x] Asignación de servicios por profesional y sucursal, con personalización opcional.
- [x] Horarios semanales sin intervalos superpuestos.
- [x] Bloqueos de agenda con rangos temporales válidos.
- [x] Permisos por rol y visibilidad limitada del barbero a sus propios datos operativos.
- [x] Consola móvil con selección explícita de barbero, categoría, servicio, personalización, días, horas y bloqueos.

### Fase 3 — Motor de agenda

- [x] Citas con estados, datos básicos de cliente y servicios con snapshot de precio y duración.
- [x] Disponibilidad calculada desde jornada, bloqueos, citas existentes y zona horaria de sucursal.
- [x] Creación y reprogramación transaccionales mediante la API propia.
- [x] Cancelación que libera inmediatamente el horario.
- [x] Restricción de exclusión PostgreSQL `appointments_no_professional_overlap` como garantía final contra doble reserva.
- [x] Agenda diaria móvil con selección de barbero, múltiples servicios, horario, datos del cliente, estados, cancelación y reprogramación.
- [x] Eventos durables e incrementales con actualización automática cada 2 segundos entre dispositivos.
- [x] Prueba concurrente repetida sin fallos intermitentes: 5 ejecuciones consecutivas aprobadas contra `postgres-test`.

### Fase 4 — Reservas públicas

- [x] Página pública con servicios, equipo, reseñas visibles y profesional obligatorio.
- [x] Selección de varios servicios y disponibilidad calculada en tiempo real.
- [x] Datos obligatorios del cliente, precio permanente, aceptación de política y verificación por correo.
- [x] Idempotencia, tokens de gestión, rate limiting y retención temporal de bloqueos sin verificar.
- [x] Confirmación de asistencia configurable por negocio, recordatorio por correo y política para conservar o cancelar citas no confirmadas.
- [x] Cancelación y reprogramación pública con anticipación configurable.
- [x] Cancelación y reprogramación manual desde la aplicación por parte del negocio o profesional autorizado.
- [x] Reseñas automáticas después de completar una cita y capacidad de ocultarlas.
- [x] Entrega SMTP a una bandeja externa comprobada y flujo público recorrido visualmente en móvil y escritorio.

### Fase 5 — Clientes e historial

- [x] Directorio autenticado, búsqueda, creación e importación de contactos.
- [x] Aislamiento por organización activa o, en su ausencia, por usuario propietario.
- [x] Historial de citas vinculado por `clientId`, conservando compatibilidad con snapshots anteriores.
- [x] Eliminación lógica de clientes sin perder el historial de citas.
- [x] Edición, notas operativas y fotografías privadas.

### Fase 6 — Caja y POS básico

- [x] Apertura, ventas, depósitos, otros ingresos, pagos, gastos, retiros,
      cierre y auditoría.

### Fase 7 — Comisiones

- [x] Reglas, cálculo backend, snapshots, liquidaciones y reversión.

Decisión de alcance para el MVP:

- las citas completadas y cobradas calculan comisión automáticamente a partir del profesional y los servicios ya vinculados;
- una venta manual comisionable desde Caja debe seleccionar un servicio del catálogo y un profesional; una venta libre sin servicio no genera comisión;
- cada servicio vendido origina una única entrada de comisión idempotente;
- gastos y retiros no generan comisión;
- las anulaciones o devoluciones crearán una reversión auditable, nunca eliminarán la entrada original;
- no se admitirán pagos parciales en este corte: la comisión nace con el cobro completo;
- productos y reglas de comisión de productos se integrarán junto con Inventario (Fase 8).
- [x] Base de datos inicial de Comisiones creada mediante la migración `20260731214903_commission_engine`: reglas, entradas idempotentes con snapshot y liquidaciones.
- [x] Alta de profesionales desde Gestión de colaboradores con comisión inicial persistida en la invitación. Al aceptar, se crea una regla `SERVICE_PERCENTAGE`; antes de aceptar no existe regla activa ni puede calcularse comisión.
- [x] Conectar el cálculo automático al cobro de citas y el registro manual comisionable desde Caja.

### Fase 8 — Inventario básico

- [x] Productos, stock por sucursal, movimientos, ajustes y alertas.

### Fase 9 — Notificaciones

- [x] Plantillas, cola durable sobre notificaciones internas, entrega SMTP/Expo Push, reintentos con backoff y recordatorios.

### Fase 10 — Reportes esenciales

- [x] Reportes diarios, filtros, permisos, zona horaria y CSV.

### Fase 11 — Planes y límites

- [x] Trial, planes, límites backend, feature flags y suspensión simulada.

### Fase 12 — Panel interno del SaaS

- [ ] Operación de organizaciones, planes, uso, errores y soporte seguro.
      Backend implementado y verificado; la sustitución del placeholder de
      `apps/admin` quedó bloqueada por permisos de escritura del entorno actual.

### Fase 13 — Estabilización del MVP

- [ ] Seguridad, E2E, rendimiento, accesibilidad, backups y checklist de producción.

## Evidencia histórica y verificación actual

- Commit base de Fase 0: `45080b7`.
- Prisma Client 7.8.0: generado correctamente.
- TypeScript en los 12 paquetes del monorepositorio: aprobado.
- Vitest/Jest: 20 pruebas unitarias ejecutadas sin caché y aprobadas el 2026-07-19.
- Jest Expo: 1 prueba aprobada.
- API: bundle de Node.js generado correctamente.
- API: arranque del bundle y `GET /health` verificados con HTTP 200.
- Docker Desktop: `postgres-test` en el puerto 5433 y Mailpit iniciados y saludables el 2026-07-20.
- PostgreSQL de pruebas: las nueve migraciones fueron aplicadas a `barber_saas_test` usando una URL derivada en memoria desde las variables de `.env`; no se usó `.env.example` ni se modificaron secretos.
- PostgreSQL de desarrollo: levantado en el puerto 5434 porque Windows impidió vincular el 5432; las nueve migraciones fueron aplicadas y `pnpm db:status` confirmó el esquema actualizado usando `.env`.
- Migración `20260719170000_team_services_and_schedules`: aplicada correctamente.
- Migración `20260719210000_appointment_engine`: aplicada correctamente con `btree_gist`.
- Migración `20260723120000_claimable_team_members`: aplicada correctamente en desarrollo y pruebas; reversa documentada.
- Fase 2: invitación/aceptación, catálogo, asignación, horarios, bloqueos, permisos y auditoría verificados contra PostgreSQL.
- Fase 3: disponibilidad, duración, bloqueo, jornada, reprogramación, cancelación, eventos y concurrencia verificados contra PostgreSQL.
- Verificación actual del cambio: API/PostgreSQL 14/14, validación 13/13 y Jest Expo 4/4.
- Verificación de correo: pruebas unitarias añadidas para formato OTP y validación; prueba de integración añadida para bloqueo previo, consumo y rechazo de reutilización.
- UI web de autenticación: bienvenida, navegación a login separado, regreso al inicio y conservación del banner de registro verificadas en viewport móvil.
- Suite API/PostgreSQL: 14 de 14 aprobadas contra `postgres-test` en el puerto 5433.
- Concurrencia de agenda: aprobada 5 veces consecutivas, sin doble reserva.
- Lint, tipos y builds en los 12 paquetes: aprobados después del flujo reclamable.
- Formato de todos los archivos modificados por el flujo reclamable y `git diff --check`: aprobados.
- El chequeo global de Prettier continúa pendiente por 12 archivos generados o cambios previos ajenos a este flujo.
- Perfiles reclamables: migración aplicada en desarrollo y pruebas el 2026-07-23.
- Invitaciones: `transporter.verify()` aprobó la conexión autenticada con el
  proveedor SMTP configurado; la entrega y asunto de la plantilla fueron
  verificados localmente contra Mailpit.
- Flujo reclamable: perfil `INVITED` configurable, acceso previo rechazado y
  aceptación posterior aprobados contra PostgreSQL real.
- Seguridad de invitaciones: el token original no se persiste ni se devuelve al
  cliente; una nueva invitación revoca la pendiente anterior y un fallo de envío
  revoca el token emitido.
- Onboarding móvil, persistencia de registro, disponibilidad por campo y preloader:
  cuatro pruebas de componentes, TypeScript y ESLint aprobados el 2026-07-25.
- Export web móvil aprobado con 1.009 módulos y 27 recursos empaquetados.
- Next.js regeneró `apps/web/next-env.d.ts` para referenciar los tipos de rutas
  del modo de desarrollo.

### Servicios persistentes durante onboarding

- [x] Formulario de servicio ampliado con configuración adicional: reserva online, visibilidad de duración, tipo de precio, categoría, impuesto, imagen, color de agenda y porcentaje de abono.
- [x] Selectores de tipo de precio (`fijo`, `a partir de`, `gratis`, `no mostrar`) y controles de porcentaje para impuesto y abono.
- [x] Modales para crear categoría e impuesto durante la configuración del servicio.
- [x] Se sustituyó el azul global `#2464E8` por negro en controles y textos nuevos; el color se conserva exclusivamente como opción de las paletas de agenda.
- [x] Migración `20260726110000_onboarding_services` creada para `onboarding_services`, vinculada al usuario propietario antes de crear una organización.
- [x] La tabla guarda nombre, descripción, duración, precio y tipo, reservas online, duración visible, categoría y descripción, impuesto y sus reglas, imagen, color y porcentaje de abono.
- [x] CRUD autenticado en `/v1/onboarding/services`: listado, creación, actualización y eliminación, siempre restringido al `ownerUserId` de la sesión.
- [x] La pantalla `apps/mobile/app/(onboarding)/services.tsx` consulta los servicios persistidos y muestra tarjetas con acciones de editar y eliminar, siguiendo el patrón de colaboradores.
- [x] Al editar, `ServiceFormSheet` recibe los valores almacenados y precarga el formulario.
- [x] Cliente Prisma regenerado y typecheck de API y móvil aprobados tras el cambio.
- [ ] Aplicar `20260726110000_onboarding_services` en PostgreSQL de desarrollo, pruebas y despliegue mediante `prisma migrate deploy`; la migración fue creada pero no se aplicó durante este cambio.

## Funcionalidad reciente

### Configuracion final de cuenta y cierre de onboarding

- [x] Paso 3 movil: formulario final de cuenta con portada, nombre, telefono, correo de solo lectura, campos opcionales y selector mundial dependiente de pais y ciudad.
- [x] GET y PATCH en /v1/onboarding/account-details leen y actualizan el usuario autenticado y su user_registration_profiles en una transaccion.
- [x] Migracion 20260726130000_onboarding_account_details creada y aplicada en PostgreSQL local; agrega portada, direccion, descripcion y enlaces sociales al perfil.
- [x] Pantalla movil de felicitaciones creada con Felicidadez.png, enlace de reservas, panel interno de acciones, compartir y copia mediante expo-clipboard.
- [x] El boton Siguiente de servicios lleva a la configuracion final y, despues de guardar, a /congratulations.
- [x] Typecheck de API y movil aprobados; API Vitest: 6 pruebas aprobadas y 10 de integracion omitidas sin TEST_DATABASE_URL; export web de Expo aprobado con la ruta y recurso de felicitaciones.

### Dashboard inicial

- [x] Ruta protegida /dashboard creada al finalizar el onboarding para no depender todavia de una organizacion activa.
- [x] UI movil del dashboard: saludo y negocio desde el perfil, resumen visual de ventas, acciones rapidas, tarjeta de reservas, comunidad y navegacion inferior fija.
- [x] Boton Ir al inicio de felicitaciones dirigido al dashboard.
- [x] `Ir al inicio` confirma el cierre en `onboarding_completed_at`; el estado queda en PostgreSQL y el usuario vuelve a `/dashboard` tras iniciar de nuevo, recargar o restaurar sesión.
- [x] Las rutas de configuración redirigen a usuarios finalizados al dashboard, evitando que vuelvan a completar pasos ya guardados.
- [x] La consulta de finalización usa una clave de caché por usuario, fuerza revalidación al montar y la migración `20260726235500_backfill_completed_onboarding_profiles` recupera perfiles que completaron el flujo antes de existir el marcador.
- [x] Las migraciones `20260726150000_onboarding_completion_state` y `20260726235500_backfill_completed_onboarding_profiles` fueron aplicadas y verificadas en PostgreSQL local.
- [x] `Abrir` muestra un panel interno compatible con Expo Web con QR, copia de enlace y website; no abre el enlace provisional de reservas. QR y website quedan visibles como próximas integraciones hasta contar con reservas públicas.
- [ ] Estadisticas de ventas, notificaciones, agenda, caja, equipo y ajustes del dashboard siguen como UI de referencia hasta implementar sus APIs y permisos.

## Siguiente tarea recomendada

- [ ] Aplicar y verificar las migraciones 20260726110000_onboarding_services y 20260726130000_onboarding_account_details en PostgreSQL de pruebas y despliegue.
- [ ] Implementar reservas publicas reales: slug publico unico, pagina web de reservas, disponibilidad publica, creacion idempotente y rate limiting.
- [ ] Servir el enlace de reservas desde la API con dominio configurado y HTTPS; no construirlo en el cliente.
- [ ] Conectar las opciones QR y ver mi website del panel existente al enlace público real, y permitir descargar o compartir el QR.

- [ ] Aplicar y verificar la migración de servicios de onboarding en PostgreSQL, incluyendo pruebas de CRUD y aislamiento por usuario. Luego verificar el flujo móvil completo y continuar con la Fase 4 — Reservas públicas.

## Actualización 2026-07-27 — banners de dashboard

### Implementado

- [x] `apps/mobile/app/(onboarding)/dashboard.tsx` concentra los tres paneles inferiores de la experiencia posterior al onboarding: `NotificationPermissionSheet`, `WelcomeSurveySheet` y `LocationBannerSheet`.
- [x] `NotificationPermissionSheet` consulta el permiso de notificaciones con `expo-notifications` en cada inicio de sesión y solicita el permiso nativo al aceptar. Si no está concedido, el panel vuelve a mostrarse en el siguiente inicio de sesión.
- [x] `WelcomeSurveySheet` incluye selección múltiple, validación de selección obligatoria, confirmación temporal `Respuesta guardada`, bloqueo del fondo y entrada/salida de panel inferior.
- [x] `LocationBannerSheet` incluye dirección editable, mapa visual simplificado, marcador ajustable al tocar el mapa, validación, acciones `Ahora no` y `Guardar ubicación`, y confirmación temporal `Ubicación guardada`.
- [x] La dirección guardada por `LocationBannerSheet` actualiza `user_registration_profiles.address_line` mediante el `PATCH /v1/onboarding/account-details` autenticado ya existente.
- [x] Los paneles Welcome y Location pueden cerrarse tocando el fondo, con el botón Atrás de Android o deslizando el panel hacia abajo; el cierre se anima hacia el borde inferior.
- [x] El orden actual del flujo es: permiso de notificaciones, encuesta Welcome y banner de ubicación.
- [x] La visualización y cierre de Welcome y Location se guardan localmente por usuario en SecureStore (móvil) o localStorage (web), por lo que el panel no vuelve a abrirse en ese mismo dispositivo tras ser cerrado o completado.
- [x] `expo-notifications` se agregó como dependencia compatible con Expo SDK 57.
- [x] Verificación realizada: `pnpm --filter @barber-saas/mobile typecheck`, `expo export --platform web` y `git diff --check` aprobados tras los cambios de banners.

### Pendiente: activación funcional de Location / Google Maps

- [ ] Configurar una clave de Google Maps Platform en las variables de entorno móviles, sin versionarla en Git.
- [ ] Habilitar facturación, `Maps SDK for Android` y `Places API (New)` en el proyecto de Google Cloud; para iOS, habilitar también `Maps SDK for iOS` cuando corresponda.
- [ ] Restringir la clave Android al paquete `com.barbersaas.mobile`, su certificado SHA-1 y las APIs necesarias.
- [ ] Instalar e integrar el SDK de mapa nativo, `expo-location` y la búsqueda/autocompletado de Places; sustituir el mapa visual actual por Google Maps y solicitar permiso de ubicación para centrar y marcar la posición del dispositivo.
- [ ] Persistir latitud, longitud, `placeId` y dirección normalizada del negocio en PostgreSQL mediante una migración y una API autenticada.

### Pendiente: persistencia de encuesta Welcome

- [ ] Crear una tabla y endpoint autenticado para almacenar las opciones de `WelcomeSurveySheet` de forma única por usuario en PostgreSQL.
- [ ] Cambiar el comportamiento de cierre de Welcome para que, si se cierra sin enviar opciones, vuelva a mostrarse hasta completar el envío; actualmente el cierre local también la considera atendida.

## Actualizacion 2026-07-27 - Sesiones, bloqueo y agenda

### Seguridad de sesiones

- [x] Corregida la advertencia React por claves duplicadas entre los paneles de encuesta y ubicacion del dashboard.
- [x] El aviso de permisos de notificaciones se muestra una sola vez por sesion de aplicacion y por inicio de sesion, aunque la persona navegue fuera y vuelva al dashboard.
- [x] Las sesiones mantienen un limite absoluto de 30 dias y ahora vencen tras 7 dias sin actividad autenticada en la API.
- [x] Se agrego `sessions.last_active_at`, su indice y la migracion `20260727133000_add_session_idle_timeout`; se aplico y verifico en PostgreSQL local el 2026-07-27.
- [x] El error HTTP 500 en `POST /v1/auth/login`, causado por la migracion pendiente de `last_active_at`, fue resuelto al ejecutar `prisma migrate deploy` localmente.
- [x] La aplicacion movil se bloquea despues de cinco minutos en segundo plano; solicita autenticacion local y valida la sesion con la API antes de volver a mostrar contenido.
- [x] Se incorporo `expo-local-authentication` compatible con Expo SDK 57. Si no hay autenticacion local disponible, la aplicacion cierra la sesion como medida segura.

### Agenda semanal movil

- [x] Ruta protegida `/agenda` creada en el grupo de onboarding terminado.
- [x] El boton Agenda de la navegacion inferior del dashboard redirige a la nueva ruta.
- [x] Pantalla visual semanal implementada con encabezado, selector de siete dias, resumen de disponibilidad, linea temporal, tarjetas de citas de referencia, indicador de hora actual, boton flotante y navegacion inferior con Agenda activa.
- [x] La pagina adopta la estetica del dashboard: superficies claras, tipografia fuerte, bordes redondeados, sombras ligeras y navegacion inferior fija; el azul `#3478F6` se usa como acento de agenda.
- [ ] Conectar la agenda a las citas reales, disponibilidad, profesionales, filtros y creacion de reservas mediante la API del motor de agenda.

### Verificacion reciente

- [x] `pnpm --filter @barber-saas/api typecheck`, `pnpm --filter @barber-saas/mobile typecheck` y `pnpm --filter @barber-saas/database typecheck` aprobados.
- [x] Vitest de API aprobado: 6 pruebas aprobadas y 10 de integracion omitidas sin `TEST_DATABASE_URL`.
- [x] Formato de las rutas moviles modificadas y `git diff --check` aprobados.

## Actualizacion 2026-07-27 - Agenda interactiva, clientes y equipo

### Agenda movil

- [x] La ruta protegida `/agenda` consulta la zona horaria de la sucursal u organizacion activa y usa como respaldo la zona horaria del dispositivo.
- [x] El selector semanal mantiene sincronizados el dia elegido, el mes visible y el calendario completo.
- [x] El boton central del selector abre un calendario mensual completo, con navegacion entre meses y seleccion directa de fecha.
- [x] Los controles anterior y siguiente cambian un dia por vez.
- [x] El area de horarios admite deslizamiento horizontal hacia izquierda o derecha para avanzar o retroceder un dia, con transicion suave de desplazamiento y opacidad.
- [x] La animacion se limita al contenido de horarios; el resumen y la navegacion permanecen fijos.
- [x] La franja semanal refleja inmediatamente el cambio de fecha producido por botones, calendario o gesto.
- [x] `Horario del dia` utiliza primero los horarios semanales configurados para el dia seleccionado y, si no existen, usa la apertura y cierre guardados en `user_registration_profiles`.
- [x] La fecha actual se calcula con la zona horaria disponible y no depende exclusivamente del reloj UTC.
- [x] El boton flotante `Nueva cita` consulta `/v1/clients`; si no existen clientes redirige a `/equipo`.
- [ ] La creacion completa de una cita cuando ya existen clientes continua pendiente; actualmente muestra un aviso de funcionalidad futura.
- [ ] Las tarjetas de citas y estadisticas de la agenda todavia no consumen el motor real de reservas.

### Pantalla Equipo / Clientes

- [x] Nueva pantalla protegida `/clients` con el lenguaje visual vigente del dashboard.
- [x] La ruta `/equipo` funciona como alias y redirige al directorio de clientes.
- [x] El boton Equipo de la navegacion inferior abre la pantalla creada.
- [x] Directorio con busqueda local por nombre o telefono, estado vacio y listado de clientes persistidos.
- [x] Boton flotante para abrir el formulario de nuevo cliente, ubicado en la esquina inferior derecha.
- [x] El formulario se presenta como panel inferior y puede cerrarse tocando fuera, usando el boton de cierre del sistema o arrastrando su cabecera hacia abajo.
- [x] El cierre por gesto tiene animacion vertical suave.
- [x] Campos obligatorios: nombre y telefono.
- [x] Campo opcional visible: apellido.
- [x] Campos adicionales desplegables: fecha de nacimiento, direccion, documento y correo electronico.
- [x] Al guardar correctamente se limpian los campos, se cierra el panel y se invalida la consulta para refrescar el listado.
- [x] La accion del estado vacio se renombro a `Importar contactos`.
- [x] Integracion con `expo-contacts` para solicitar permiso y leer nombre, telefono y correo de los contactos en Android o iOS.
- [x] La importacion descarta contactos sin nombre o telefono y evita volver a importar telefonos ya existentes en el directorio cargado.
- [x] En Expo Web se informa que la sincronizacion de contactos requiere un telefono.
- [x] `expo-contacts` fue agregado a la configuracion de Expo con el mensaje de permiso correspondiente.

### Persistencia, API y aislamiento

- [x] Modelo Prisma `Client` agregado con nombre, apellido, telefono, correo, fecha de nacimiento, direccion, documento, notas y marcas de auditoria.
- [x] Cada cliente conserva `created_by_user_id` y `updated_by_user_id`, relacionados con el usuario autenticado.
- [x] `organization_id` es opcional para permitir clientes personales mientras la cuenta aun no pertenece a una organizacion activa.
- [x] Endpoint autenticado `GET /v1/clients` para listar y buscar clientes.
- [x] Endpoint autenticado `POST /v1/clients` para crear clientes; nombre y telefono se validan como obligatorios.
- [x] El cliente movil tipado incluye las respuestas y campos del directorio.
- [x] Si el usuario tiene una membresia activa, los clientes se consultan dentro de su organizacion.
- [x] Si no tiene una membresia activa, la API limita los clientes por `created_by_user_id`, evitando mezclar datos personales entre usuarios.
- [x] La API nunca acepta el propietario ni la organizacion desde el formulario; deriva el usuario desde la sesion y la organizacion desde una membresia activa.
- [x] Migracion `20260727170000_add_clients`: tabla inicial de clientes.
- [x] Migracion `20260727174500_add_client_details`: apellido y campos adicionales.
- [x] Migracion `20260727183000_audit_client_owners`: propietarios de creacion/actualizacion, telefono obligatorio y auditoria.
- [x] Migracion `20260727190000_allow_personal_clients`: organizacion opcional para cuentas individuales.
- [x] Las 20 migraciones disponibles estan aplicadas en PostgreSQL local y `prisma migrate status` confirma el esquema actualizado.

### Organizacion y cuenta actual

- [x] Se verifico que la base local contiene un solo usuario registrado.
- [x] El usuario actual no posee filas en `memberships`; por tanto no tiene una organizacion activa.
- [x] Una organizacion representa el negocio o espacio de trabajo compartido. `Membership` enlaza un usuario con ese negocio y define su rol y estado.
- [x] La ausencia de organizacion no bloquea la creacion de clientes: se guardan como clientes personales con `organization_id = NULL` y el usuario autenticado como propietario.
- [ ] Como mejora estructural, al completar el onboarding debe crearse automaticamente la organizacion del negocio y una membresia `OWNER` para el usuario principal.
- [ ] Cuando se implemente esa creacion automatica, definir la migracion o adopcion de clientes personales existentes hacia la nueva organizacion.

### Correccion del error al guardar clientes

- [x] `logs.md` mostro `POST /v1/clients 500 Internal Server Error`; no correspondia a un rechazo de permisos.
- [x] Se reprodujo el fallo directamente: el Prisma Client generado conservaba el modelo anterior y todavia exigia la relacion `organization`.
- [x] Se regenero Prisma Client 7.8.0 después de aplicar el esquema donde la organizacion es opcional.
- [x] El proceso `tsx watch` de la API detecto el cambio y se recargo.
- [x] Se ejecuto una insercion real sin organizacion dentro de una transaccion de prueba; la insercion fue aceptada y luego revertida para no dejar datos ficticios.
- [x] Se agrego `predev` en `apps/api/package.json` para ejecutar `db:generate` antes de iniciar la API y evitar clientes Prisma obsoletos.
- [x] Typecheck de la API aprobado despues de regenerar Prisma.
- [x] Suite API final aprobada: 3 archivos, 6 pruebas aprobadas y 10 pruebas de integracion omitidas por no proporcionar `TEST_DATABASE_URL`.

### Pendientes funcionales de clientes

- [x] Edicion y eliminacion logica de clientes.
- [x] Historial de citas por cliente.
- [x] Notas operativas y fotografias privadas.
- [ ] Importacion masiva con pantalla previa de seleccion, confirmacion y reporte individual de conflictos.
- [x] Vincular un cliente persistido con la creacion real de una nueva reserva.

## Actualizacion 2026-07-28 - Etiquetas de clientes y correcciones

- [x] Las fichas de cliente muestran etiquetas y permiten crear una con nombre y color desde un panel inferior.
- [x] La etiqueta creada se persiste y se asigna al cliente actual; repetir un nombre existente la reutiliza dentro del mismo alcance.
- [x] El directorio muestra las etiquetas y permite filtrar clientes por ellas.
- [x] Se agregaron los modelos Prisma `ClientLabel` y `ClientLabelAssignment`, junto con los endpoints autenticados `GET` y `POST /v1/clients/labels`.
- [x] Migracion `20260728123000_create_client_label_tables` aplicada en PostgreSQL local; crea las tablas de etiquetas y sus asignaciones sin modificar migraciones ya aplicadas.
- [x] El cliente existente se verifico en PostgreSQL y no fue eliminado durante la correccion.
- [x] Resuelto el HTTP 500 de clientes (`P2021`): faltaba `client_label_assignments` porque una migracion ya aplicada no se vuelve a ejecutar al cambiar su archivo.
- [x] Resuelta la advertencia de Expo Web `Unexpected text node`: se elimino el nodo de texto invalido entre dos modales de `client-detail.tsx`.
- [x] Verificado: Prisma validate, migraciones, typecheck de API y movil; insercion de cliente probada dentro de una transaccion revertida.

## Actualizacion 2026-07-28 - Notas, historial y nueva reserva

- [x] Notas de cliente persistentes con descripcion y foto opcional: el selector permite tomar foto o cargarla desde el dispositivo.
- [x] Las fotos se validan antes de enviarse: maximo 1.5 MB y 1600 × 1600 pixeles; la API limita el contenido codificado a 2 MB.
- [x] La nota se relaciona con el cliente y el usuario autenticado; la API deriva el alcance desde la sesion y no recibe propietarios desde el movil.
- [x] El panel de nueva nota se cierra tocando fuera o al deslizar su cabecera hacia abajo.
- [x] Migracion `20260728140000_add_client_notes` aplicada en PostgreSQL local.
- [x] Historial de reservas con orden real por fecha y filtros para actividad, pagado, cancelado y finalizado.
- [x] Se agrego `appointments.payment_status` y la migracion `20260728150000_add_appointment_payment_status`, aplicada localmente; el filtro Pagado usa ese dato persistido.
- [x] Nueva pestaña Comentarios con UI de estrellas, preparada para integrar la captura de reseñas posteriormente.
- [x] Nueva ruta movil `/new-booking`: Paso 1 de 4 para elegir cliente, buscar por nombre/telefono/correo, continuar sin cliente y acceder al alta de clientes.
- [x] Desde Nueva reserva, `Añadir cliente` abre el panel en la misma pantalla; incluye los campos adicionales y guarda el cliente asociado al usuario autenticado.
- [x] Corregido el nodo de texto invalido en Nueva reserva que producia `Unexpected text node` en Expo Web.
- [x] El boton Nueva cita de Agenda redirige a `/new-booking` cuando existen clientes; si no, conserva el redireccionamiento al directorio.
- [x] La nueva reserva usa la variante visual negra solicitada, sin el azul de la referencia.
- [x] Se agrego el acceso de sincronizacion de contactos junto al titulo Clientes, reutilizando la importacion existente.
- [x] Verificado: typecheck movil, API, Prisma validate, migraciones y `git diff --check`.

## Actualizacion 2026-07-28 - Agenda y lista de espera

- [x] El antiguo boton `Filtrar agenda` fue reemplazado por `Lista espera`, con icono de lista y acceso a la ruta movil `/waitlist`.
- [x] Se agrego, junto a Lista espera, el boton `Ajustes agenda` con icono de configuracion y mensaje temporal hasta implementar sus opciones.
- [x] Nueva pantalla movil de Lista de espera con buscador y pestañas `Pendientes`, `Aceptados` y `Rechazados`.
- [x] Las pestañas cambian visualmente entre sus estados y muestran sus estados vacios; no consumen ni persisten solicitudes porque la logica de reservas aun no existe.
- [x] El alta de cliente dentro de Nueva reserva incluye Nombre, telefono y el desplegable `Agregar campos adicionales`: apellidos, fecha de nacimiento, direccion, documento y correo.
- [x] Los campos adicionales de Nueva reserva se envian al endpoint de clientes, se limpian tras guardar y el cliente creado queda seleccionado.
- [x] Corregido el error de Expo Web `Unexpected text node` registrado en `logs.log`: provenia de un nodo de espacio invalido junto al modal de Nueva reserva.
- [x] Verificado: `pnpm --filter @barber-saas/mobile typecheck` y `git diff --check` sin errores funcionales.

## Actualizacion 2026-07-28 - Ajustes reales de agenda

- [x] El boton `Ajustes agenda` abre un panel inferior con filtros aplicables de inmediato.
- [x] El panel permite mostrar las 24 horas o mantener el horario configurado, e incluir o excluir citas canceladas.
- [x] Las vistas Dia, Semana y Completo consultan citas reales de la fecha, semana o mes respectivo.
- [x] Los filtros de reservas usan datos persistidos: activa (confirmada, check-in o en proceso), no asistio, pendiente de confirmacion, pagado, en espera, confirmado, en proceso y finalizado.
- [x] Los miembros se obtienen de `/v1/team`; seleccionar uno filtra por su `professionalMembershipId`.
- [x] Se creo el estado Prisma `WAITING` para citas en espera y la migracion `20260728160000_add_appointment_waiting_status`, aplicada localmente.
- [x] La API ahora expone `paymentStatus` en cada cita para que el filtro Pagado use la BD.
- [x] Los selectores de vista, estado y miembro se presentan como filas horizontales desplazables, con icono y texto.
- [x] Los filtros se aplican inmediatamente al seleccionar una opcion; se retiro el boton de aplicar.
- [x] El panel de ajustes se cierra con una animacion suave al tocar fuera o al deslizar la cabecera hacia abajo.
- [x] Verificado: migracion aplicada, Prisma Client regenerado, typecheck de API y movil, y `git diff --check`.

## Actualizacion 2026-07-28 - Caja

- [x] Nueva ruta movil `/cash-register`, accesible desde el boton Caja de Agenda.
- [x] Estado inicial de caja cerrada y formulario para abrirla con responsable y dinero base.
- [x] La caja abierta se persiste; no es informacion temporal, para conservar trazabilidad de ventas, gastos y cierres diarios.
- [x] Migracion `20260728170000_add_cash_register_sessions` aplicada localmente; conserva responsable, base, fechas y estado de la sesion.
- [x] Endpoints autenticados para consultar la caja abierta actual y abrir una nueva; se evita abrir dos cajas dentro del mismo alcance.
- [x] Verificado: typecheck de API y movil, migraciones locales aplicadas y `git diff --check`.

## Actualizacion 2026-07-28 - Navegacion, Ajustes y perfil de usuario

### Navegacion inferior compartida

- [x] Se creo el componente reutilizable `BottomNavigation` para evitar menus inferiores duplicados.
- [x] Dashboard, Agenda, Clientes/Equipo, Caja, Ajustes y Edicion de perfil usan el mismo menu flotante.
- [x] Los accesos Inicio, Agenda, Caja, Equipo y Ajustes navegan a rutas reales y muestran la opcion activa.
- [x] Se agregaron `elevation` y `zIndex` al menu para impedir que quede oculto por el contenido desplazable en web o Android.

### Correcciones de Caja

- [x] La pagina Caja incluye el menu flotante compartido.
- [x] El boton de regreso usa la ruta estable `/agenda` y evita la advertencia `GO_BACK` cuando no existe historial de navegacion.
- [x] El signo de informacion de Dinero base muestra una descripcion dentro del formulario: corresponde al efectivo fisico disponible al abrir la caja, sin incluir ventas ni gastos del dia.

### Pagina de Ajustes

- [x] Se creo la ruta protegida `/settings` con el lenguaje visual negro, blanco y gris del Dashboard.
- [x] La pantalla muestra perfil del negocio, soporte, Mi negocio, promociones, SuperLink, cierre de sesion, borrado de cuenta y version instalada.
- [x] El bloque `Estadisticas e informes` se ubica inmediatamente debajo de `Mi negocio`; actualmente es una entrada de UI para funcionalidades futuras.
- [x] `ProyectoMD/prompt/prompt.md` conserva la especificacion detallada de la futura pantalla de estadisticas, historiales e informes; esas rutas y reportes aun no estan implementados.
- [x] El texto de actualizacion y version se presenta centrado.
- [x] El menu flotante inferior compartido se renderiza con Ajustes como opcion activa.
- [x] El lapiz del avatar navega a la nueva ruta `/profile-edit`.

### Edicion de perfil y portafolio

- [x] Se creo la pagina `/profile-edit`, fiel a la paleta visual del Dashboard.
- [x] Permite editar foto de perfil, nombre, telefono y descripcion `Sobre mi`; el correo se muestra como dato de solo lectura.
- [x] El portafolio muestra las fotos persistidas y ofrece un boton `+` para tomar una foto o cargarla desde el dispositivo.
- [x] El movil limita cada imagen a 1.5 MB y 1600 x 1600 pixeles; la API acepta JPEG, PNG o WebP y limita el contenido Base64 a 2 MB.
- [x] Se agregaron los endpoints autenticados `GET /v1/profile`, `PATCH /v1/profile` y `POST /v1/profile/portfolio`.
- [x] Los campos `profile_photo_data` y `profile_bio` se almacenan en `users`.
- [x] El modelo `UserPortfolioItem` relaciona cada foto del portafolio con su usuario mediante `user_id` y eliminacion en cascada.
- [x] La migracion `20260728180000_add_user_profile_portfolio` fue creada y aplicada en PostgreSQL local.
- [x] Prisma Client fue regenerado y `prisma migrate status` confirma 25 migraciones aplicadas.
- [x] Verificado: schema Prisma valido, typecheck de API y movil, `git diff --check` y export web de Expo completado.

## Actualizacion 2026-07-28 - Ajustes del negocio e informes

- [x] Nueva ruta movil `/business-settings`, accesible desde la tarjeta `Mi negocio` de Ajustes.
- [x] La pantalla secundaria incluye opciones recientes, ajustes del negocio, encabezado fijo, scroll seguro, tarjetas accesibles y los acordeones Nava Flex y Mas opciones.
- [x] Equipo, edicion de perfil y servicios abren sus modulos existentes; los demas accesos responden con un aviso temporal sin romper la navegacion.
- [x] Nueva ruta movil `/reports`, accesible desde `Estadisticas e informes`, con las secciones de resumen, caja, ventas y otros reportes solicitadas.
- [x] Las pantallas nuevas reutilizan la paleta negro, blanco y gris del Dashboard, sin acentos azules.
- [x] Verificado: typecheck movil y `git diff --check`.

## Actualizacion 2026-07-28 - Simplificacion de Ajustes

- [x] Se retiraron de la aplicacion los accesos y mensajes promocionales que no aportan a la operacion del MVP.
- [x] La bienvenida permanece unicamente en Dashboard mientras la configuracion de cuenta sigue pendiente; explica que desaparecera al completarla y se oculta al registrarse `onboardingCompletedAt`.
- [x] Verificado: formateo de las pantallas modificadas, typecheck movil y `git diff --check`.

## Actualizacion 2026-07-29 - Banner de opinion

- [x] El banner local de opinion se muestra al ingresar por primera vez al Dashboard.
- [x] Al enviar la encuesta o cerrarla, se registra localmente la fecha de interaccion por usuario y dispositivo.
- [x] El banner vuelve a estar disponible despues de siete dias desde la ultima interaccion.
- [x] La frecuencia se conserva en `SecureStore` en dispositivos moviles y en `localStorage` para Expo Web; no requiere cambios en API ni base de datos y no se sincroniza entre dispositivos o reinstalaciones.
- [x] Se conservan los datos locales existentes: un registro invalido o sin fecha permite volver a mostrar el banner.
- [x] Verificado: `pnpm --filter @barber-saas/mobile typecheck` aprobado.

## Planificacion 2026-07-29 - Desarrollo funcional de Ajustes del negocio

> Estado de esta seccion: especificacion funcional, tecnica y comercial aprobada
> para desarrollo posterior. Los elementos marcados con `[ ]` no estan
> implementados todavia. Esta seccion no registra codigo terminado.

### Objetivo y contexto

La ruta movil `apps/mobile/app/(onboarding)/business-settings.tsx` funciona como
menu secundario de configuracion del negocio. En la revision realizada se
identificaron siete tarjetas y dos acordeones:

| Opcion                   | Estado al iniciar esta planificacion | Decision                                       |
| ------------------------ | ------------------------------------ | ---------------------------------------------- |
| Gestion de colaboradores | Redirige a `/equipo`                 | Conservar la ruta; no recrear la pantalla      |
| Horario del negocio      | Sin ruta; muestra aviso temporal     | Crear una pantalla y persistencia nuevas       |
| Editar informacion       | Redirige a `/profile-edit`           | Conservar la ruta; no recrear la pantalla      |
| Configuracion avanzada   | Sin ruta; muestra aviso temporal     | Crear pantalla y modulos funcionales graduales |
| Nava Wallet              | Sin ruta; muestra aviso temporal     | Crear un centro de pagos y anticipos por fases |
| Gestion de servicios     | Redirige a `/services`               | Conservar la ruta; no recrear la pantalla      |
| Suscripcion              | Sin ruta; muestra aviso temporal     | Crear pantalla con suscripcion simulada        |

Los acordeones `Nava Flex` y `Mas opciones` ya se expanden y contraen dentro de
la misma pantalla. No deben navegar a una ruta independiente durante este
desarrollo, salvo que una especificacion futura lo solicite expresamente.

### Principios transversales aprobados

- [ ] Mantener la identidad visual actual de Nava: negro, blanco, grises,
      tipografia, radios, bordes, espaciado e iconos existentes.
- [ ] Reutilizar componentes actuales antes de crear variantes nuevas.
- [ ] Los paneles inferiores deben cerrarse tocando fuera, mediante el boton de
      cancelar o deslizando el panel hacia abajo.
- [ ] Toda funcionalidad editable debe persistir realmente; no se mostraran
      interruptores o botones que simulen guardar informacion.
- [ ] Las secciones todavia no funcionales mostraran una insignia discreta
      `Proximamente` y una explicacion, sin enviar datos al servidor.
- [ ] Las decisiones de autorizacion se validaran nuevamente en la API. Ocultar
      un control en el movil no se considera una medida de seguridad.
- [ ] Todas las operaciones multi-tenant derivaran la organizacion, sucursal y
      membresia desde la sesion autenticada.
- [ ] Los cambios sensibles se registraran en `AuditLog`.
- [ ] Las nuevas rutas conservaran proteccion de sesion, estados de carga,
      error, reintento, vacio y falta de permisos.
- [ ] El trabajo se entregara por cortes verticales: migracion, validacion,
      API, tipos compartidos, UI, navegacion y pruebas del mismo modulo.
- [ ] No modificar ni recrear las tres pantallas que ya tienen redireccion
      funcional desde `business-settings.tsx`.

## Modulo planificado 1 - Horario general del negocio

### Alcance funcional aprobado

- [x] Crear la ruta movil `/business-schedule`.
- [x] Administrar el horario general del negocio de lunes a domingo.
- [x] Cada dia tendra un checkbox para indicar `Abierto` o `Cerrado`.
- [x] Debajo del checkbox se mostrara un icono de configuracion.
- [x] Cada dia admitira un unico intervalo continuo de apertura y cierre.
- [x] Al tocar el icono se abrira un panel inferior para editar ambas horas.
- [x] El selector de hora reutilizara el estilo y comportamiento del registro
      inicial, actualmente implementado mediante `TimeField` y
      `TimeWheelModal` en `RegistrationSelectors.tsx`.
- [x] El panel inferior se podra cerrar deslizando hacia abajo, tocando fuera o
      presionando `Cancelar`.
- [x] El panel tendra una accion explicita para confirmar el intervalo del dia.
- [x] La pantalla tendra un boton general `Guardar cambios`.
- [x] Un dia desmarcado se mostrara como `Cerrado`.
- [x] El icono de configuracion de un dia cerrado quedara visualmente
      deshabilitado.
- [x] Al cerrar un dia se conservara internamente su ultimo intervalo; si el
      usuario lo activa nuevamente, se restauraran esas horas.
- [x] Se validara que la hora de apertura sea anterior a la hora de cierre.
- [x] Se impediran intervalos vacios, iguales o fuera de `00:00-24:00`.

### Compatibilidad con cuentas existentes

El registro actual solo conserva `openingTime` y `closingTime`; no permite
seleccionar dias. Por ello, la primera inicializacion del nuevo horario semanal
usara esta regla aprobada:

- [x] Activar inicialmente los siete dias.
- [x] Copiar a cada dia la apertura y cierre configurados durante el registro.
- [x] Ejecutar la inicializacion de forma idempotente para no sobrescribir una
      configuracion semanal ya editada.
- [x] Conservar temporalmente los campos generales existentes mientras las
      pantallas que aun los consumen migran al nuevo horario.
- [ ] Eliminar o deprecar esos campos solamente en una migracion posterior y
      despues de comprobar que no existen consumidores activos.

### Efecto sobre agenda y reservas

El proyecto ya posee horarios semanales por profesional mediante
`WeeklySchedule` y `/v1/schedules`. El nuevo horario no los reemplaza. Se
aplicara una interseccion:

```text
Disponibilidad efectiva
= horario general del negocio
∩ horario del profesional
- bloqueos
- citas que reservan espacio
```

- [x] No ofrecer horas fuera del horario general, aunque el profesional tenga
      un horario mas amplio.
- [x] No ofrecer horas fuera del horario profesional, aunque el negocio este
      abierto.
- [x] Rechazar tambien en el servidor la creacion o reprogramacion de una cita
      fuera de la disponibilidad efectiva.
- [ ] Aplicar la misma regla a disponibilidad interna y futura reserva publica.
- [x] Ajustar la linea temporal de Agenda para que use el horario semanal del
      dia seleccionado, no solamente el par historico de apertura y cierre.
- [x] Mantener el control de concurrencia y exclusion de citas existente.

### Modelo y API propuestos

Crear una entidad semanal asociada a la sucursal, aunque el MVP empiece con una
sola ubicacion:

```text
BusinessWeeklySchedule
- id
- organizationId
- locationId
- weekday (0-6)
- isOpen
- openingMinute
- closingMinute
- createdAt
- updatedAt
```

- [x] Indice unico por `locationId + weekday`.
- [x] Restriccion de dia entre 0 y 6.
- [x] Horas nulas unicamente cuando el dia esta cerrado, o una regla equivalente
      claramente validada.
- [x] `GET /v1/business-schedule` para consultar los siete dias.
- [x] `PUT /v1/business-schedule` para reemplazar la semana completa dentro de
      una transaccion.
- [x] Permisos separados de lectura y administracion o reutilizacion consciente
      de `schedule.read` y `schedule.manage`.
- [x] Registro de auditoria con estado anterior y posterior.

### Criterios de aceptacion

- [x] Los siete dias se muestran sin scroll horizontal obligatorio en telefonos
      pequenos; el layout puede adaptarse en filas o tarjetas.
- [ ] El panel de horas funciona en Android, iOS y Expo Web.
- [x] Cerrar el panel sin confirmar no modifica el valor guardado.
- [x] Guardar actualiza la consulta, informa exito y conserva la pantalla.
- [x] Un fallo de red no elimina los datos que el usuario estaba editando.
- [x] Disponibilidad, creacion y reprogramacion rechazan horas fuera del negocio.
- [x] Existen pruebas de inicializacion, validacion, interseccion y aislamiento
      entre organizaciones.

## Modulo planificado 2 - Configuracion avanzada

### Estructura general

- [ ] Crear la ruta movil `/advanced-settings`.
- [ ] Mantener el orden de la referencia:
  1. Tipo de cuenta.
  2. Permisos a colaboradores.
  3. Modificar enlace de reserva.
  4. Configuracion general.
  5. Reservas anticipadas.
  6. Informacion adicional.
- [ ] Mostrar un boton inferior `Guardar cambios` solo para los cambios de tipo
      de cuenta y enlace de reserva.
- [ ] Mantener el boton deshabilitado cuando no existan cambios.
- [ ] Los permisos se guardaran dentro de su propio flujo, no con el boton
      general de la pantalla.

### Tipo de cuenta y personalizacion de experiencia

Las opciones aprobadas son:

```text
Solo yo
Tengo un negocio
```

La seleccion representa un modo de experiencia y producto. No reemplaza roles,
permisos ni controles de autorizacion.

#### Experiencia `Solo yo`

- [ ] Ocultar Gestion de colaboradores y Permisos a colaboradores.
- [ ] Evitar selectores de profesionales cuando el unico profesional es el
      propietario.
- [ ] Enfocar Agenda directamente en el propietario.
- [ ] Adaptar textos a lenguaje singular, por ejemplo `Mi horario` y
      `Mis servicios`, cuando corresponda.
- [ ] Mantener disponibles clientes, servicios, reservas, caja, Wallet,
      reportes y suscripcion del plan vigente.

#### Experiencia `Tengo un negocio`

- [ ] Mostrar equipo, invitaciones, roles y permisos.
- [ ] Permitir agendas y filtros por colaborador.
- [ ] Mostrar administracion de horarios individuales y del horario general.
- [ ] Mantener la experiencia administrativa completa.

#### Cambio entre tipos

- [ ] Permitir `Solo yo -> Tengo un negocio` de forma inmediata.
- [ ] Permitir `Tengo un negocio -> Solo yo` unicamente cuando no existan otros
      colaboradores ni invitaciones pendientes.
- [ ] Si existen colaboradores o invitaciones, bloquear el cambio con una
      explicacion y una accion hacia `/equipo`.
- [ ] Nunca borrar colaboradores, invitaciones, citas ni configuracion como
      efecto secundario de cambiar el tipo de cuenta.
- [ ] Centralizar las diferencias de experiencia en un hook, contexto o politica
      de capacidades; evitar condicionales dispersos por toda la aplicacion.
- [ ] Extender la API de perfil/configuracion para persistir el tipo de cuenta
      despues del registro.

### Permisos hibridos por rol y por colaborador

Se aprobo un modelo hibrido:

```text
Permisos efectivos
= plantilla del rol
+ permisos concedidos individualmente
- permisos retirados individualmente
```

Si un colaborador no tiene personalizaciones, recibe exactamente la plantilla
de su rol. Las excepciones se aplican por membresia.

#### Flujo de UI

- [ ] Abrir una pantalla secundaria o flujo dedicado desde
      `Permisos a colaboradores`.
- [ ] Mostrar lista de colaboradores y permitir seleccionar uno.
- [ ] Mostrar su rol base: administrador, recepcionista o barbero.
- [ ] Ofrecer `Usar permisos del rol` y `Personalizar permisos`.
- [ ] Agrupar las acciones en acordeones:
  - Negocio.
  - Sucursales.
  - Colaboradores.
  - Servicios.
  - Horarios.
  - Agenda y reservas.
  - Pagos y Wallet.
- [ ] Distinguir visualmente `Heredado del rol` de `Personalizado`.
- [ ] Incluir la accion `Restaurar permisos del rol`.
- [ ] Confirmar antes de retirar permisos sensibles.

#### Capacidades base

Las capacidades existentes que deben conservarse y exponerse de forma
comprensible son:

- `organization.read`
- `organization.update`
- `location.read`
- `location.update`
- `membership.read`
- `membership.manage`
- `service.read`
- `service.manage`
- `schedule.read`
- `schedule.manage`
- `appointment.read`
- `appointment.manage`

Wallet requerira agregar capacidades especificas, evitando concentrar todas las
acciones financieras en un unico permiso:

- [ ] Ver historial de pagos.
- [ ] Registrar pagos en efectivo.
- [ ] Ver comprobantes de transferencia.
- [ ] Aprobar o rechazar transferencias.
- [ ] Ejecutar reversos o reembolsos.
- [ ] Administrar metodos y configuracion de pago.

#### Reglas de seguridad aprobadas

- [ ] El propietario conserva acceso completo y sus permisos no se pueden
      retirar desde esta UI.
- [ ] Solo el propietario puede personalizar permisos.
- [ ] Un usuario no puede conceder una capacidad superior a la que posee.
- [ ] `Administrar` activa o exige automaticamente `Ver`.
- [ ] Cambiar el rol debe preguntar si se conservan o eliminan excepciones.
- [ ] El rol y el permiso determinan la accion; el alcance de datos determina si
      se opera sobre datos propios, de una sucursal o de toda la organizacion.
- [ ] Un barbero solo consulta el estado financiero de sus propias citas, salvo
      una politica futura expresamente mas amplia.
- [ ] Credenciales PayPhone y reembolsos permanecen bajo control exclusivo del
      propietario.
- [ ] Todo cambio genera auditoria con actor, membresia afectada, estado anterior
      y estado posterior.

#### Persistencia propuesta

Crear una tabla de excepciones por membresia, por ejemplo:

```text
MembershipPermissionOverride
- membershipId
- permission
- effect (grant | deny)
- createdByUserId
- createdAt
- updatedAt
```

- [ ] Indice unico por `membershipId + permission`.
- [ ] Calcular permisos efectivos en un unico paquete compartido y aplicar la
      misma funcion en todos los endpoints.
- [ ] No confiar en una lista de permisos calculada por el cliente movil.
- [ ] Agregar pruebas para escalamiento de privilegios, dependencias y
      aislamiento multi-tenant.

### Modificar enlace de reserva

Formato aprobado:

```text
https://book.nava.app/{identificador}
```

- [ ] Obtener el dominio base desde configuracion del entorno.
- [ ] Mostrar el dominio como prefijo no editable.
- [ ] Permitir editar solamente el identificador.
- [ ] Normalizar a minusculas y guiones.
- [ ] Permitir letras minusculas, numeros y guiones con longitud validada.
- [ ] Comprobar disponibilidad sin esperar al guardado final.
- [ ] Proteger tambien en base de datos contra cambios concurrentes.
- [ ] Permitir copiar y compartir el enlace actual.
- [ ] Confirmar el impacto antes de cambiarlo.
- [ ] Limitar el cambio a una vez cada 30 dias.
- [ ] Reservar permanentemente los identificadores historicos para impedir
      suplantacion.
- [ ] Redirigir un enlace historico al identificador vigente.
- [ ] Guardar el identificador canonico en la organizacion; dejar de construir
      el enlace publico desde `businessNameKey`.
- [ ] Preparar la ruta de una sola sucursal para que en Multi pueda aparecer un
      selector de ubicacion sin romper enlaces existentes.

Persistencia adicional propuesta:

```text
BookingSlugAlias
- id
- organizationId
- slug
- replacedAt
- createdAt
```

La pagina publica de reservas sigue siendo una dependencia pendiente. Editar,
copiar y conservar el enlace puede implementarse antes, pero no se debe afirmar
que acepta reservas reales hasta completar esa fase.

### Secciones solo visuales

- [ ] `Configuracion general`: acordeon funcional con contenido
      `Proximamente`; no incluir controles editables.
- [ ] `Reservas anticipadas`: acordeon con vista previa de futuras reglas de
      anticipacion minima, horizonte maximo y cancelacion; queda `Proximamente`
      hasta integrarlo con reservas publicas.
- [ ] `Informacion adicional`: acordeon `Proximamente` hasta definir campos y
      efecto de negocio.
- [ ] Estas secciones no habilitan el boton `Guardar cambios`.

## Modulo planificado 3 - Nava Wallet

### Cambio de alcance y definicion del producto

El documento original del MVP dejaba wallet y pasarela de pagos fuera de
alcance. La decision comercial tomada en esta planificacion amplia ese alcance.
Debe implementarse de forma gradual y no habilitar dinero real en produccion
sin completar pruebas, autorizaciones del proveedor y revision operativa.

Nava Wallet no custodiara fondos. Funcionara como centro de configuracion,
anticipos, conciliacion e historial:

- PayPhone acredita el dinero en la cuenta PayPhone Business del negocio.
- Una transferencia se acredita directamente en la cuenta bancaria del negocio.
- El efectivo entra en la caja fisica del local.
- Nava registra el movimiento, su relacion con la cita y su estado.

### Navegacion y UI

- [ ] Crear la ruta movil `/wallet`.
- [ ] Organizarla en tres pestañas:
  - `Resumen`.
  - `Historial`.
  - `Configuracion`.
- [ ] Mostrar estado de conexion PayPhone.
- [ ] Reutilizar tarjetas, filtros, paneles inferiores y estados visuales de
      Nava.

#### Resumen

- [ ] Total cobrado online durante el periodo seleccionado.
- [ ] Transferencias aprobadas.
- [ ] Transferencias pendientes de verificacion.
- [ ] Saldo pendiente de las citas.
- [ ] Pagos rechazados, reversados o reembolsados.
- [ ] Acceso a PayPhone Business para consultar el saldo real del proveedor.
- [ ] No etiquetar como `Saldo disponible PayPhone` una suma calculada
      internamente, porque comisiones, retenciones y reversos pueden producir una
      diferencia con el saldo retirable.

#### Historial

- [ ] Mostrar cliente, cita, metodo, monto, estado y fecha.
- [ ] Mostrar saldo restante de la cita.
- [ ] Mostrar referencia bancaria o identificadores PayPhone cuando existan.
- [ ] Permitir abrir el comprobante de transferencia con permisos adecuados.
- [ ] Filtrar por fecha, metodo y estado.
- [ ] Permitir consultar el detalle y la auditoria del movimiento.

#### Configuracion

- [ ] Activar o desactivar efectivo.
- [ ] Activar o desactivar transferencia bancaria.
- [ ] Activar o desactivar PayPhone.
- [ ] Configurar politica de anticipo.
- [ ] Configurar cuenta bancaria.
- [ ] Conectar, probar, rotar o desconectar PayPhone.
- [ ] Permitir que el cliente pague solamente el minimo o el total completo.

### Politica de anticipos

Estados configurables:

```text
Sin anticipo
Anticipo opcional
Anticipo obligatorio
```

Calculo configurable:

```text
Porcentaje del total
Valor fijo en la moneda del negocio
```

- [ ] La Wallet define la regla general del negocio.
- [ ] Cada servicio puede heredarla o establecer una excepcion.
- [ ] Migrar el porcentaje de abono que ya existe en servicios de onboarding al
      modelo operativo `Service`, que actualmente no conserva ese campo.
- [ ] En citas con varios servicios, calcular el anticipo de cada servicio y
      sumar los resultados.
- [ ] Un valor fijo nunca puede superar el total de la cita.
- [ ] Trabajar siempre en unidades monetarias menores, por ejemplo centavos.
- [ ] Conservar monto total, monto pagado y saldo restante.
- [ ] Ofrecer al cliente `Pagar anticipo minimo` o `Pagar total`, cuando la
      politica lo permita.

### Efectivo

- [ ] Interpretar efectivo como `Pagar en el local`, no como anticipo online.
- [ ] Crear la cita con pago pendiente cuando la politica permita pagar despues.
- [ ] Registrar el cobro al atender o finalizar la cita.
- [ ] Integrar el efectivo con la sesion de caja abierta y su futuro movimiento
      transaccional.
- [ ] No aumentar caja por transferencias ni pagos PayPhone.
- [ ] Cuando el anticipo sea obligatorio, ocultar efectivo en la reserva
      publica.
- [ ] Permitir una excepcion manual solo a un usuario autorizado y dejarla
      auditada.

### Transferencia bancaria

Para el MVP ampliado se aprobo una sola cuenta bancaria activa por negocio:

- Banco.
- Tipo de cuenta.
- Numero de cuenta.
- Titular.
- RUC o identificacion.
- Correo opcional.
- Instrucciones adicionales.
- Codigo QR opcional como imagen.

Flujo aprobado:

1. El cliente selecciona transferencia.
2. Nava reserva temporalmente el horario.
3. El cliente dispone de 30 minutos para adjuntar el comprobante.
4. Si no adjunta el comprobante, la solicitud vence y libera el horario.
5. Si lo adjunta, la cita queda `Pendiente de verificacion` y conserva el
   horario.
6. El negocio recibe una alerta interna.
7. Un usuario autorizado aprueba o rechaza.
8. Aprobado: se confirma la cita y se registra el anticipo.
9. Rechazado: se informa dentro del canal disponible y se libera el horario.

- [ ] Subir comprobantes a almacenamiento privado, no a una URL publica.
- [ ] Autorizar cada descarga mediante la sesion y permisos efectivos.
- [ ] No aprobar automaticamente una transferencia por recibir una imagen.
- [ ] Definir antes de produccion el plazo maximo que el negocio tendra para
      revisar un comprobante ya enviado.
- [ ] Implementar un trabajo de expiracion idempotente para liberar
      reservaciones sin comprobante.
- [ ] Evitar que dos clientes adquieran el mismo horario mientras la reserva
      temporal sigue vigente.

### PayPhone

Las credenciales correctas son:

```text
Token
StoreID
```

No deben llamarse `API key` e `ID de negocio` dentro de la implementacion.

#### Configuracion inicial

- [ ] Mostrar una ventana informativa que explique la necesidad de una cuenta
      PayPhone Business.
- [ ] Enlazar al registro y documentacion oficial del proveedor.
- [ ] Solicitar Token y StoreID.
- [ ] Permitir seleccionar ambiente `Pruebas` o `Produccion`.
- [ ] Incluir `Probar conexion`.
- [ ] Mostrar estados `No configurado`, `Conectado`, `Error` y
      `Requiere atencion`.
- [ ] Ocultar el token despues de guardarlo y mostrar solamente una referencia
      parcial no sensible.
- [ ] Permitir rotacion y desconexion.

#### Seguridad y arquitectura

- [ ] Enviar credenciales directamente a la API de Nava sobre HTTPS.
- [ ] Cifrar el Token en el servidor con una clave externa a la base de datos.
- [ ] No guardar el Token en SecureStore, AsyncStorage, logs, auditorias,
      analytics ni respuestas del API.
- [ ] El StoreID puede mostrarse parcialmente, pero debe tratarse como dato de
      configuracion sensible.
- [ ] Crear un adaptador de proveedor para no acoplar citas directamente a
      PayPhone.
- [ ] Usar identificadores internos idempotentes por intento de pago.
- [ ] Confirmar cada pago en el servidor mediante consulta al proveedor,
      respuesta firmada o webhook autorizado; no confiar en el resultado mostrado
      por el navegador o telefono del cliente.
- [ ] Verificar que monto, moneda, StoreID, cita e identificador interno
      coincidan antes de aprobar el pago.
- [ ] Procesar notificaciones repetidas sin duplicar pagos.
- [ ] Ejecutar primero el flujo completo en ambiente de pruebas.

#### Estrategia comercial de integracion

Para una primera prueba puede permitirse que el propietario ingrese su Token y
StoreID. Antes de escalar a muchos negocios se debe evaluar con PayPhone el
modelo `Comercio aliado: token de tercero`, diseñado para plataformas SaaS:

- Nava configura una aplicacion base como partner.
- Cada barberia queda asociada como comercio aliado.
- Cada comercio recibe credenciales separadas.
- Los fondos se acreditan directamente en la wallet del comercio aliado.

Este modelo requiere autorizacion previa, validacion comercial y aceptacion de
las condiciones vigentes del proveedor. No se debe activar en produccion
basandose solamente en la documentacion tecnica.

Referencias oficiales revisadas durante la definicion:

- Credenciales y ambientes:
  `https://docs.payphone.app/configuracion-de-ambiente-y-credenciales`.
- Token de terceros para plataformas:
  `https://docs.payphone.app/token-de-terceros`.
- Notificacion externa:
  `https://docs.payphone.app/notificacion-externa`.
- API Link:
  `https://docs.payphone.app/api-link`.
- API Sale y consulta de transacciones:
  `https://docs.payphone.app/api-sale`.

### Estados de pagos

El modelo debe distinguir, como minimo:

```text
pending
processing
proof_submitted
approved
rejected
cancelled
expired
reversed
refunded
```

El estado simplificado actual `AppointmentPaymentStatus.PENDING/PAID` no es
suficiente para el nuevo flujo. Puede conservarse como resumen derivado durante
la migracion, pero la fuente de verdad debe ser un registro de pagos.

### Persistencia propuesta

Separar responsabilidades en modelos equivalentes a:

```text
PaymentSettings
- organizationId
- cashEnabled
- bankTransferEnabled
- payPhoneEnabled
- depositRequirement
- depositCalculation
- depositValue
- allowFullPayment

BankAccount
- organizationId
- datos de la unica cuenta activa
- qrPrivateAsset
- isActive

PaymentProviderConnection
- organizationId
- provider
- environment
- storeId
- encryptedToken
- status
- verifiedAt

AppointmentPayment
- appointmentId
- method
- amountCents
- currencyCode
- status
- providerTransactionId
- clientTransactionId
- createdByUserId
- reviewedByUserId
- timestamps

TransferProof
- appointmentPaymentId
- privateAsset
- submittedAt
- reviewedAt
- reviewReason

BookingPaymentHold
- appointment o solicitud publica
- startsAt
- expiresAt
- status
```

- [ ] Usar restricciones unicas para idempotencia de proveedor.
- [ ] Relacionar reversos y reembolsos con el pago original.
- [ ] Nunca editar destructivamente un movimiento aprobado; registrar la
      operacion compensatoria.
- [ ] Conservar monto, moneda y datos historicos aunque cambie el servicio.

### Permisos de Wallet aprobados

- Propietario: acceso completo.
- Administrador autorizado: historial, registro y verificacion segun excepciones.
- Recepcionista autorizado: efectivo y verificacion de transferencias.
- Barbero: solamente estado de pago de sus propias citas.
- Token, StoreID, configuracion del proveedor y reembolsos: propietario.

### Dependencias y riesgos

- [ ] Completar la reserva publica antes de prometer anticipos al cliente final.
- [ ] Definir almacenamiento privado para comprobantes.
- [ ] Acordar con PayPhone webhook, dominio, ambiente de produccion y modalidad
      comercial.
- [ ] Definir politica operativa de disputas, devoluciones y comprobantes
      fraudulentos.
- [ ] Revisar requisitos legales, privacidad y conservacion de datos financieros.
- [ ] No habilitar produccion hasta superar pruebas de idempotencia, concurrencia,
      reversion, expiracion y recuperacion ante fallos.

## Modulo planificado 4 - Suscripcion

### Planes comerciales aprobados

Solo existiran dos nombres de plan:

```text
Esencial
Multi
```

Los precios quedan expresamente `Por definir`. No se escribiran precios
provisionales en la aplicacion ni en constantes del cliente. El backend debera
permitir precios nulos o no publicados.

### Plan Esencial

Dirigido tanto a `Solo yo` como a `Tengo un negocio` cuando opera una sola
sucursal:

- Una sucursal.
- Colaboradores ilimitados.
- Clientes, servicios y reservas sin limite comercial por usuario.
- Agenda individual y de equipo.
- Pagina publica y enlace personalizado de reservas.
- Horario general y horarios por colaborador.
- Roles y permisos personalizados.
- Lista de espera.
- Gestion de clientes e historial.
- Caja basica.
- Nava Wallet.
- PayPhone, transferencia y efectivo cuando Wallet este habilitada.
- Anticipos y reglas por servicio.
- Reportes esenciales.
- Inventario de una sucursal cuando se implemente.
- Soporte estandar.
- Sin cobro adicional por cada barbero.

La diferencia entre profesional individual y negocio se resuelve mediante el
tipo de cuenta y la experiencia visual, no mediante un tercer plan.

### Plan Multi

Incluye Esencial y agrega operacion de hasta cinco sucursales:

- Colaboradores ilimitados.
- Colaboradores asignables a varias sucursales.
- Agenda consolidada y filtro por sucursal.
- Clientes compartidos entre sucursales.
- Reportes consolidados y comparativos.
- Caja independiente por sucursal.
- Inventario por sucursal y transferencias.
- Servicios generales con excepciones de precio/duracion por sucursal.
- Horarios distintos por local.
- Permisos con alcance por sucursal.
- Cuenta bancaria y PayPhone configurables por sucursal.
- Enlace general con selector de sucursal.
- Enlaces individuales por local.
- Auditoria consolidada.
- Exportacion de reportes.
- Soporte prioritario.

Multi permanecera visible como `Proximamente` hasta que esas capacidades sean
reales. No debe venderse ni activarse un plan basado en funciones simuladas.

### Matriz comercial resumida

| Capacidad                      | Esencial               | Multi                       |
| ------------------------------ | ---------------------- | --------------------------- |
| Sucursales                     | 1                      | Hasta 5                     |
| Colaboradores                  | Ilimitados             | Ilimitados                  |
| Reservas, clientes y servicios | Incluidos              | Incluidos                   |
| Wallet                         | Una sucursal           | Configuracion por sucursal  |
| Permisos                       | Por colaborador        | Por colaborador y sucursal  |
| Reportes                       | Esenciales del negocio | Consolidados y comparativos |
| Enlaces de reserva             | Uno                    | General y por sucursal      |
| Soporte                        | Estandar               | Prioritario                 |

### Flujo de suscripcion para el MVP

- [x] Crear la ruta movil `/subscription`.
- [x] Mostrar plan actual y estado.
- [x] Estados previstos: `trial`, `active`, `past_due`, `suspended`,
      `cancelled`.
- [x] Mostrar funciones y consumo frente a limites aplicables.
- [x] Mostrar Esencial como plan disponible.
- [x] Mostrar Multi como `Proximamente`.
- [x] Prueba de 14 dias sin tarjeta.
- [x] Periodo de gracia de siete dias.
- [x] Despues de la gracia, pasar a modo lectura sin eliminar informacion.
- [x] Explicar con precision que accion esta bloqueada y como reactivar.
- [x] No bloquear acceso a exportacion/consulta de informacion propia por un
      cambio de plan sin una politica comercial y legal revisada.
- [x] Durante el MVP la suscripcion sera simulada; no se integrara cobro real.
- [x] El metodo de pago de la suscripcion se mostrara `Proximamente` o se
      omitira mientras no exista facturacion del SaaS.
- [x] Las definiciones de planes y limites viviran en backend.

### Fuera de alcance comercial

- [ ] No incluir notificaciones de WhatsApp en Esencial, Multi, Wallet ni la
      comparacion de planes.
- [ ] No mostrar cuotas de WhatsApp ni prometer integracion futura en esta fase.
- [ ] No cobrar por colaborador/barbero.
- [ ] No definir todavia precio mensual o anual.
- [ ] No reutilizar las credenciales PayPhone del negocio para cobrar la
      suscripcion de Nava.

## Flujo comercial consolidado

```text
El usuario elige experiencia:
  Solo yo
  o Tengo un negocio

Ambas experiencias pueden usar:
  Plan Esencial

Si el negocio necesita varias sucursales:
  Plan Multi

Los cobros de citas:
  pertenecen al negocio y pasan por sus metodos de pago

El cobro futuro de la suscripcion Nava:
  sera un flujo separado y aun no esta definido
```

- El tipo de cuenta personaliza UX/UI; no otorga permisos.
- El rol y sus excepciones determinan autorizacion.
- El plan determina limites comerciales y capacidades disponibles.
- La sucursal determina el alcance operativo de horarios, caja, pagos y
  reportes.
- PayPhone procesa pagos de clientes hacia el negocio; Nava no debe mezclar esos
  fondos con su propia facturacion.

## Rutas previstas y conexion con el menu

Actualizar `business-settings.tsx` solamente cuando cada destino exista:

```text
Horario del negocio      -> /business-schedule
Configuracion avanzada   -> /advanced-settings
Nava Wallet              -> /wallet
Suscripcion              -> /subscription
```

- [ ] Extender el tipo `SettingsMenuItem.route` con rutas reales.
- [ ] Mantener el aviso temporal hasta que el corte vertical correspondiente
      este listo.
- [ ] No apuntar una tarjeta a una pantalla incompleta que pueda perder datos.
- [ ] Conservar navegacion de regreso estable hacia `/business-settings` o
      `/settings`.

## Estrategia y orden de implementacion

### Fase A - Horario general del negocio

1. Diseñar migracion y compatibilidad con apertura/cierre actuales.
2. Crear validacion y tipos compartidos.
3. Implementar API y reglas de permisos.
4. Integrar horario general con disponibilidad y citas.
5. Crear UI semanal y panel de horas.
6. Conectar la tarjeta.
7. Ejecutar pruebas y documentar resultado.

Esta debe ser la primera fase porque modifica una regla central de
disponibilidad y establece el patron de panel inferior reutilizable.

### Fase B - Configuracion avanzada

Dividirla en cortes independientes:

1. Contenedor visual y secciones `Proximamente`.
2. Tipo de cuenta y politica centralizada de experiencia.
3. Permisos hibridos y auditoria.
4. Enlace canonico, disponibilidad, alias y redireccion.

No mezclar los cuatro cortes en una unica migracion.

### Fase C - Suscripcion simulada

1. Crear `Plan` y `Subscription` con precios no publicados.
2. Sembrar Esencial y Multi.
3. Implementar estados, prueba, gracia y modo lectura.
4. Aplicar limites de sucursal en backend.
5. Crear comparador y pantalla movil.
6. Mantener Multi deshabilitado hasta soporte multisucursal.

Esta fase puede completarse antes de Wallet porque no mueve dinero real.

### Fase D - Nava Wallet

Dividir en puertas de seguridad:

1. Modelos de pagos y configuracion sin proveedor externo.
2. Efectivo y relacion con caja.
3. Transferencia, comprobantes privados y aprobacion.
4. Retenciones temporales de horarios.
5. PayPhone en sandbox.
6. Webhook/confirmacion, idempotencia y reversos.
7. Revision comercial y autorizacion PayPhone.
8. Produccion controlada.

No saltar directamente a credenciales de produccion.

## Verificacion obligatoria por fase

- [ ] `prisma validate`.
- [ ] Migraciones aplicadas en una base de desarrollo limpia y en una base con
      datos existentes.
- [ ] Prisma Client regenerado.
- [ ] Typecheck de API, movil y paquetes modificados.
- [ ] Pruebas unitarias de validacion y calculos.
- [ ] Pruebas de integracion con PostgreSQL.
- [ ] Pruebas de aislamiento multi-tenant.
- [ ] Pruebas de permisos efectivos y escalamiento de privilegios.
- [ ] Pruebas de concurrencia para slugs y horarios.
- [ ] Pruebas de disponibilidad dentro/fuera del horario general.
- [ ] Pruebas de idempotencia y repeticion de webhooks para Wallet.
- [ ] Verificacion visual en Android, iOS y Expo Web.
- [ ] `git diff --check`.
- [ ] Actualizar esta seccion cambiando a `[x]` solamente lo que haya sido
      implementado y verificado.

## Decisiones pendientes antes de produccion

- [ ] Precio de Esencial.
- [ ] Precio de Multi.
- [ ] Periodicidad comercial y eventual descuento anual.
- [ ] Acuerdo PayPhone para produccion y modalidad partner/comercio aliado.
- [ ] Comisiones, retenciones y comunicacion comercial de PayPhone.
- [ ] Endpoint o mecanismo oficial para consultar saldo retirable; mientras no
      exista, Nava mostrara cobros registrados, no saldo real.
- [ ] Tiempo maximo de revision de un comprobante ya enviado.
- [ ] Politica de devoluciones fuera de la ventana de reverso del proveedor.
- [ ] Almacenamiento privado y periodo de conservacion de comprobantes.
- [ ] Contenido funcional de Configuracion general.
- [ ] Contenido funcional de Informacion adicional.
- [ ] Reglas definitivas de reservas anticipadas publicas.
- [ ] Desarrollo completo de reservas publicas.
- [ ] Desarrollo real multisucursal antes de activar Multi.

## Proxima accion de desarrollo

El siguiente bloque de desarrollo, ya sea como continuacion de esta sesion o
desde una sesion futura, debe comenzar exclusivamente con
`Horario general del negocio`. Antes de modificar codigo se debe:

1. Revisar esta planificacion completa.
2. Inspeccionar el estado de las migraciones y consumidores de
   `openingTime/closingTime`.
3. Confirmar que los cambios locales existentes no se sobrescriban.
4. Crear un plan de implementacion limitado a la Fase A.
5. Implementar y verificar el corte vertical.
6. Actualizar este documento con archivos, migracion, endpoints, pruebas y
   pendientes reales.

Configuracion avanzada, Suscripcion y Wallet no deben iniciarse en paralelo con
Horario del negocio salvo una autorizacion posterior explicita.

## Implementacion 2026-07-29 - Fase A completada

### Resultado funcional

Se completo el primer corte vertical de esta planificacion:
`Horario general del negocio`. La tarjeta ya no muestra el aviso temporal;
navega a `/business-schedule` y permite administrar la semana completa.

La pantalla implementada:

- muestra lunes a domingo como tarjetas verticales;
- conserva el orden solicitado de checkbox y engranaje debajo;
- distingue visualmente dias abiertos y cerrados;
- conserva las horas al cerrar temporalmente un dia;
- deshabilita la configuracion mientras el dia esta cerrado;
- permite un solo intervalo diario;
- reutiliza `TimeField` y el selector de rueda del registro inicial;
- abre la edicion en una hoja inferior;
- permite cerrar la hoja al tocar fuera, cancelar o deslizar el tirador hacia
  abajo;
- valida apertura anterior al cierre;
- mantiene el borrador cuando una solicitud falla;
- advierte antes de salir con cambios sin guardar;
- muestra carga, error, reintento, guardado en curso y confirmacion de exito.

### Persistencia y compatibilidad

Se agrego `BusinessWeeklySchedule`, asociado tanto a organizacion como a
sucursal. La implementacion usa `startMinute` y `endMinute`; ambos valores se
conservan incluso cuando `isOpen=false`. Esta es la regla equivalente elegida
para restaurar el ultimo intervalo al volver a activar un dia.

La migracion
`20260729120000_add_business_weekly_schedules`:

- crea la tabla, claves foraneas e indices;
- restringe `weekday` a `0..6`;
- restringe los minutos a un intervalo valido;
- exige una sola fila por `locationId + weekday`;
- inicializa las cuentas existentes con siete dias activos;
- toma `opening_time` y `closing_time` del perfil de registro del propietario;
- usa `09:00-18:00` solamente como respaldo para datos historicos incompletos;
- no reemplaza filas ya existentes.

El onboarding crea desde ahora las siete filas dentro de su misma transaccion.
Los campos historicos `openingTime` y `closingTime` se mantienen porque aun son
parte del perfil de registro y no corresponde eliminarlos en este corte.

### API, autorizacion y auditoria

Se agregaron:

- `GET /v1/business-schedule`, protegido por `schedule.read`;
- `PUT /v1/business-schedule`, protegido por `schedule.manage`;
- validacion de semana completa, siete dias unicos e intervalos validos;
- comprobacion de que la sucursal pertenece a la organizacion autenticada;
- reemplazo transaccional mediante `upsert`;
- auditoria `business_weekly_schedule.replaced` con estado anterior y posterior;
- inicializacion diferida e idempotente si una cuenta historica no tiene las
  siete filas.

Un colaborador sin `schedule.manage` puede consultar el horario si su rol tiene
lectura, pero no puede modificarlo. El propietario mantiene administracion.

### Integracion con Agenda

La disponibilidad efectiva ahora se calcula como la interseccion entre el
horario del negocio y el horario del profesional. Un dia cerrado devuelve cero
espacios. La creacion y reprogramacion reutilizan la misma comprobacion en el
servidor y responden `OUTSIDE_BUSINESS_HOURS` cuando corresponde.

La linea temporal de la Agenda movil consulta el horario semanal y:

- muestra el intervalo correspondiente al dia seleccionado;
- queda vacia si el negocio esta cerrado;
- recorta horarios profesionales que excedan la apertura o cierre del negocio.

Tambien se fortalecio el reconocimiento de conflictos concurrentes de
PostgreSQL/Prisma para conservar la respuesta `409 APPOINTMENT_CONFLICT` ante
dos intentos simultaneos sobre el mismo espacio.

### Archivos del corte

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260729120000_add_business_weekly_schedules/migration.sql`
- `packages/validation/src/index.ts`
- `packages/validation/src/index.test.ts`
- `packages/api-client/src/index.ts`
- `apps/api/src/business-schedule.ts`
- `apps/api/src/app.ts`
- `apps/api/src/agenda.ts`
- `apps/api/src/app.integration.test.ts`
- `apps/mobile/app/(onboarding)/business-schedule.tsx`
- `apps/mobile/app/(onboarding)/business-settings.tsx`
- `apps/mobile/app/(onboarding)/agenda.tsx`

### Verificacion ejecutada

- [x] `prisma validate`.
- [x] Prisma Client regenerado.
- [x] Migracion aplicada correctamente en PostgreSQL local.
- [x] 16 pruebas unitarias de validacion aprobadas.
- [x] 17 pruebas de API aprobadas, incluidas las pruebas con PostgreSQL.
- [x] Prueba especifica de horario, permisos, auditoria, disponibilidad y
      rechazo de citas fuera del horario.
- [x] Prueba de doble reserva concurrente aprobada.
- [x] Typecheck de API aprobado.
- [x] Typecheck de la aplicacion movil aprobado.
- [x] Exportacion Expo Web completada: 1114 modulos empaquetados.
- [x] `git diff --check` sin errores de espacios.

La inspeccion visual automatizada no pudo ejecutarse porque la sesion de
desarrollo no tenia un navegador conectado. La exportacion web si fue exitosa,
pero continua pendiente revisar gestos y dimensiones en un dispositivo Android,
un dispositivo iOS y un navegador real antes de declarar verificacion visual
multiplataforma.

### Estado al cerrar esta fase

Fase A queda implementada. No se inicio Configuracion avanzada, Suscripcion ni
Wallet en codigo, por lo que sus casillas y decisiones siguen pendientes. El
siguiente corte recomendado es `Configuracion avanzada`, comenzando por su
contenedor visual y los bloques marcados `Proximamente`, y despues separando
tipo de cuenta, permisos hibridos y enlace de reserva en entregas verificables.

## Corrección de coherencia entre registro y configuración — 29 de julio de 2026

### Problema detectado

El registro moderno recopilaba correctamente el tipo de cuenta, los datos del negocio,
los servicios y el horario inicial, pero al finalizar sólo marcaba
`onboardingCompletedAt`. No creaba las entidades operativas que utiliza el resto de la
aplicación:

- organización;
- sede principal;
- membresía `OWNER`;
- acceso del propietario a la sede;
- horario general del negocio;
- horario profesional del propietario;
- servicios reales y su asignación al propietario.

Por esta razón una cuenta recién creada podía llegar al dashboard, pero las páginas de
configuración y agenda no encontraban una organización activa. Además:

- `accountType` se guardaba, pero no personalizaba la experiencia;
- una cuenta profesional era obligada a pasar por una captura de colaboradores;
- los colaboradores capturados eran borradores sin correo y no podían convertirse de
  forma segura en usuarios o invitaciones;
- la opción Equipo redirigía erróneamente a Clientes;
- Editar información del negocio abría la edición del perfil personal;
- el enlace público continuaba usando el dominio anterior;
- las pruebas de integración no impedían usar accidentalmente la base local principal.

### Decisión funcional

`accountType` describe la experiencia del producto, no los permisos:

- `PROFESSIONAL` se presenta como **Solo yo**.
- `BUSINESS` se presenta como **Tengo un negocio**.
- En ambos casos el usuario que crea la cuenta obtiene el rol de autorización `OWNER`.

Para el MVP, ambas modalidades pueden operar inmediatamente:

- El propietario queda habilitado como profesional.
- Sus servicios iniciales se asignan a su membresía.
- Su horario profesional inicial coincide con el horario general configurado durante el
  registro.
- **Solo yo** oculta las opciones de colaboradores.
- **Tengo un negocio** muestra la gestión de equipo e invitaciones después de finalizar
  el registro.

No se crearán colaboradores ficticios a partir de nombre y cargo. El paso antiguo de
captura de colaboradores deja de formar parte del recorrido obligatorio. Los
colaboradores reales se incorporarán desde Gestión de equipo, donde se dispone de un
correo y del flujo formal de invitación.

### Flujo corregido

1. El usuario elige Solo yo o Tengo un negocio.
2. Completa los datos básicos y el horario inicial.
3. Registra al menos un servicio.
4. Revisa o completa la información de la cuenta.
5. Al confirmar, `POST /v1/onboarding/complete-account-setup` ejecuta una transacción
   idempotente que:
   - crea la organización y un `slug` único;
   - crea la sede Principal;
   - crea la membresía `OWNER` y su acceso a la sede;
   - crea los siete días del horario general;
   - crea los siete días del horario profesional del propietario;
   - transforma los borradores de servicios en categorías y servicios reales;
   - asigna los servicios al propietario;
   - elimina los borradores ya materializados;
   - marca el onboarding como completado.
6. Una repetición de la petición no duplica datos y devuelve la organización ya creada.

### Ajustes de interfaz y navegación

- El onboarding ya no exige agregar colaboradores.
- Configuración muestra textos y opciones según Solo yo o Tengo un negocio.
- Equipo abre la gestión real de operaciones/invitaciones.
- Información del negocio usa los datos del onboarding y, tras completarse, sincroniza
  los cambios con la organización y la sede.
- El enlace de reserva se genera a partir del `slug` real de la organización bajo
  `https://book.nava.app`.

### Protección de datos de pruebas

Las pruebas de integración sólo podrán ejecutarse con una URL identificada
explícitamente como base de pruebas y el puerto del servicio `postgres-test` (`5433`).
Una URL de la base local principal será rechazada antes de cualquier limpieza.

### Criterios de aceptación

- Una cuenta nueva puede abrir horario, servicios, agenda y configuración sin
  `ORGANIZATION_REQUIRED`.
- Existen exactamente una organización, una sede y una membresía propietaria después
  de completar el registro.
- Los siete días y los servicios iniciales conservan la configuración capturada.
- Repetir la finalización no crea duplicados.
- Solo yo no muestra gestión de colaboradores; Tengo un negocio sí.
- Ninguna prueba automatizada puede truncar la base local de desarrollo.

### Estado de implementación y verificación

Implementado y verificado en esta sesión:

- finalización transaccional e idempotente del onboarding moderno;
- materialización de organización, sede, propietario, accesos, horarios,
  categorías, servicios y asignaciones;
- sincronización posterior de información con organización y sede;
- enlace público bajo `book.nava.app`;
- recorrido inicial sin colaboradores ficticios;
- personalización visual y de opciones para Solo yo y Tengo un negocio;
- rutas corregidas para información del negocio y gestión de equipo;
- validación de cierre posterior a la apertura;
- bloqueo preventivo de pruebas contra una base que no sea
  `barber_saas_test:5433`.

Verificaciones completadas:

- typecheck de API, validaciones y aplicación móvil;
- 18 pruebas de API aprobadas, incluida la nueva cobertura del onboarding
  moderno y su reintento;
- 17 pruebas de validación aprobadas;
- 6 pruebas de componentes móviles aprobadas;
- ESLint aprobado en todos los archivos intervenidos.

### Qué sigue después de esta corrección

Antes de ampliar el producto se realizará una aceptación manual del recorrido
completo con la base local limpia:

1. Registrar una cuenta **Solo yo**.
2. Confirmar que se crean el negocio, la sede, el horario y los servicios.
3. Verificar que no aparece Gestión de colaboradores.
4. Registrar una cuenta **Tengo un negocio** con datos diferentes.
5. Confirmar que Gestión de colaboradores abre Operaciones y permite iniciar
   el flujo real de invitación.
6. Editar la información y el horario desde Ajustes, cerrar sesión y comprobar
   que los cambios persisten al volver a ingresar.

Superada esa aceptación, el siguiente corte de desarrollo recomendado es
**Configuración avanzada**, porque ya dispone de `accountType`, organización,
membresía propietaria y `slug` reales.

#### Alcance propuesto para Configuración avanzada

- Crear la pantalla y conectarla desde
  `business-settings.tsx`.
- **Tipo de cuenta**:
  - mostrar Solo yo o Tengo un negocio;
  - permitir pasar de Solo yo a Tengo un negocio;
  - al intentar pasar de Tengo un negocio a Solo yo, no borrar colaboradores
    ni información: mostrar confirmación y bloquear el cambio si existen
    membresías o invitaciones activas.
- **Permisos a colaboradores**:
  - visible únicamente para Tengo un negocio;
  - usar el modelo híbrido ya acordado: permisos base por rol y excepciones
    individuales por colaborador;
  - el rol sirve como plantilla y el ajuste individual sólo sobrescribe las
    capacidades seleccionadas.
- **Modificar enlace de reserva**:
  - mostrar, copiar, compartir y abrir el enlace actual;
  - permitir editar el `slug`;
  - validar disponibilidad antes de guardar;
  - conservar la restricción única en el servidor.
- **Configuración general**:
  - construir únicamente el contenedor visual;
  - mostrar sus opciones como Próximamente hasta definir reglas funcionales.
- **Reservas anticipadas** e **Información adicional**:
  - mantener como secciones visuales Próximamente durante el MVP.
- Guardar cambios con estados de carga, errores del servidor y confirmación
  visible.

#### Orden de implementación del siguiente corte

1. Aceptación manual de Solo yo y Tengo un negocio.
2. Contenedor y navegación de Configuración avanzada.
3. Edición segura del tipo de cuenta.
4. Edición y disponibilidad del enlace de reserva.
5. Permisos por rol con excepciones individuales.
6. Pruebas de API, permisos, persistencia y UI.

Wallet y Suscripción permanecen fuera de este siguiente corte. Se desarrollarán
después de Configuración avanzada para evitar que pagos y límites comerciales
dependan de una estructura de cuenta todavía incompleta.

## Corrección de navegación y altura del onboarding — 29 de julio de 2026

### Problemas reproducidos

- Configuración avanzada no tenía una ruta y sólo mostraba el aviso genérico.
- Gestión de servicios apuntaba a `/services`, que corresponde al alta inicial.
  El guardián del onboarding detectaba una cuenta completada y la devolvía al
  dashboard.
- Colaboradores utilizaba una redirección sin grupo explícito y podía rebotar al
  inicio cuando la consulta de organización todavía conservaba el valor vacío
  anterior a finalizar el registro.
- El botón principal de las primeras pantallas estaba al final del contenido
  desplazable. La ilustración, los espacios flexibles y el alto del botón
  provocaban un recorrido vertical innecesario en pantallas móviles.

### Correcciones aplicadas

- Se creó `advanced-settings.tsx` y Configuración avanzada ahora abre esa
  pantalla.
- La pantalla avanzada muestra:
  - el tipo de cuenta actual;
  - acceso a colaboradores únicamente para Tengo un negocio;
  - enlace de reservas con acciones Copiar, Compartir y Abrir;
  - Configuración general, Reservas anticipadas e Información adicional como
    Próximamente.
- Gestión de servicios abre explícitamente
  `/(app)/operations?section=services`.
- Gestión de colaboradores abre explícitamente
  `/(app)/operations?section=team`.
- La barra inferior oculta Equipo para Solo yo y lo conserva para Tengo un
  negocio.
- Operaciones interpreta el parámetro `section` y muestra solamente la sección
  solicitada, con un título coherente, en lugar de presentar todo el formulario
  operativo.
- Al finalizar el onboarding se invalida `current-organization` antes de abrir
  el dashboard, evitando redirecciones causadas por datos en caché.
- El botón Comenzar configuración quedó fijo debajo del contenido.
- El botón Siguiente de Servicios quedó fijo y visible aunque existan servicios
  guardados en la lista.
- Se redujeron ilustraciones, márgenes, títulos y botones para alturas menores a
  850 px.
- El contenido de bienvenida y servicios cambia entre Solo yo y Tengo un
  negocio.
- El indicador del recorrido se actualizó a tres pasos.

### Verificación

- [x] Typecheck móvil.
- [x] ESLint de los archivos intervenidos.
- [x] 6 pruebas de componentes móviles.
- [x] Exportación Expo Web con 1115 módulos y reconocimiento de la nueva ruta.
- [ ] Inspección visual en navegador/dispositivo: el entorno no expuso una
      sesión de navegador conectada. Se mantiene como prueba manual inmediata.

## Aislamiento de la interfaz móvil heredada — 29 de julio de 2026

### Hallazgo

La aplicación mantenía dos sistemas visuales en paralelo:

- la interfaz vigente, con fondo blanco y componentes similares a
  `dashboard.tsx`;
- la interfaz heredada, construida con `Screen`, `PrimaryButton`, `TextField`,
  `SelectionList` y `theme.ts`.

El tema heredado usa fondo `#101816`, superficie `#18231f` y acento verde
`#d9ff70`. Gestión de servicios y colaboradores todavía enviaban a
`(app)/operations.tsx`, por lo que ambas modalidades de cuenta podían abandonar
la experiencia blanca.

### Corrección de navegación

- Se creó `service-management.tsx` con la interfaz blanca:
  - consulta de servicios y categorías reales;
  - creación de categorías;
  - creación de servicios;
  - asignación automática del servicio nuevo al propietario y sede actuales;
  - resumen y catálogo activo.
- Se creó `team-management.tsx` con la interfaz blanca:
  - listado del equipo real;
  - invitaciones pendientes;
  - creación e invitación por correo;
  - elección inicial de rol;
  - bloqueo de acceso para cuentas Solo yo.
- Business Settings, Configuración avanzada, Equipo y la barra inferior ahora
  apuntan a estas páginas nuevas.
- La ruta de compatibilidad `equipo.tsx` redirige a `team-management`.
- `app/index.tsx`, `account-setup.tsx`, aceptación de invitaciones y el resumen
  heredado regresan al dashboard blanco, no a `/(app)`.
- Si Agenda no encuentra clientes, abre Clientes en lugar de enviar a Equipo.
- Los archivos heredados `(app)/index.tsx`, `(app)/agenda.tsx` y
  `(app)/operations.tsx` quedaron convertidos en redirecciones de
  compatibilidad. Incluso un enlace guardado ya no presenta la UI verde.
- No quedan referencias desde la navegación vigente hacia `/(app)` ni
  `/operations`.

### Inventario de diseños móviles heredados que permanecen

Pantallas todavía construidas con la base visual antigua:

1. `apps/mobile/app/(auth)/recover.tsx`
   - recuperación de acceso;
   - usa `Screen`.
2. `apps/mobile/app/(auth)/reset-password.tsx`
   - cambio de contraseña;
   - usa `Screen`.
3. `apps/mobile/app/(onboarding)/accept-invitation.tsx`
   - aceptación de una invitación al equipo;
   - usa `Screen`.
4. `apps/mobile/app/(onboarding)/location.tsx`
   - paso de ubicación del onboarding anterior;
   - ya no forma parte del recorrido actual.
5. `apps/mobile/app/(onboarding)/summary.tsx`
   - resumen del onboarding anterior;
   - ya no forma parte del recorrido actual.

Infraestructura visual heredada:

- `apps/mobile/src/components/Screen.tsx`;
- `apps/mobile/src/components/PrimaryButton.tsx`;
- `apps/mobile/src/components/TextField.tsx`;
- `apps/mobile/src/components/SelectionList.tsx`;
- `apps/mobile/src/theme.ts`.

Las pantallas `location.tsx` y `summary.tsx` se consideran candidatas a
eliminación después de confirmar que no existen enlaces externos antiguos. Las
pantallas de recuperación, restablecimiento e invitaciones siguen siendo
funcionales y deberán migrarse al estilo blanco en un corte posterior.

### Verificación

- [x] Typecheck móvil.
- [x] 6 pruebas de componentes móviles.
- [x] ESLint aprobado en las páginas nuevas y archivos de navegación
      intervenidos.
- [x] Exportación Expo Web aprobada con 1117 módulos.
- [x] Búsqueda estática sin referencias desde la navegación vigente a
      `/(app)` o `/operations`.
- [ ] `agenda.tsx` conserva deuda previa de reglas React Hooks/refs al ejecutar
      ESLint directamente sobre todo el archivo; no fue introducida por esta
      corrección de ruta.

## Revisión previa a eliminar diseños móviles heredados — 29 de julio de 2026

### Decisión de seguridad

No se eliminó ninguna pantalla en este corte. La petición combina la intención
de retirar el código antiguo con la necesidad de verlo antes de decidir. Para
evitar una pérdida equivocada, se habilitó un catálogo temporal y aislado que
no aparece en la navegación normal.

Ruta del catálogo:

- `/legacy-designs`

Las pantallas del catálogo se abren con `preview=1`. En ese modo se bloquean
las acciones que podrían modificar datos:

- envío de enlaces de recuperación;
- cambio de contraseña;
- aceptación de invitaciones;
- guardado de la primera sucursal;
- creación de la organización desde el resumen anterior.

### Resultado del análisis de dependencias

1. `recover.tsx`
   - está enlazada desde `LoginFullScreen.tsx`;
   - inicia el flujo real de recuperación;
   - no debe eliminarse sin crear antes su reemplazo visual.
2. `reset-password.tsx`
   - es el destino del token generado por `recover.tsx`;
   - completa el cambio real de contraseña;
   - no debe eliminarse sin reemplazo.
3. `accept-invitation.tsx`
   - recibe usuarios desde `LoginFullScreen.tsx` y `RegistrationFlow.tsx`;
   - acepta la pertenencia real a un equipo;
   - no debe eliminarse sin reemplazo.
4. `location.tsx`
   - sólo enlaza con `summary.tsx`;
   - el flujo vigente de `organization.tsx` avanza a `services.tsx`;
   - no tiene enlaces entrantes desde la navegación actual;
   - es candidata segura a eliminación, junto con sus dependencias exclusivas.
5. `summary.tsx`
   - depende únicamente de los datos del onboarding anterior;
   - sólo recibe navegación desde `location.tsx`;
   - no tiene enlaces entrantes desde el flujo vigente;
   - es candidata segura a eliminación junto con `location.tsx`.

### Direcciones de vista previa

Tomando como base Expo Web `http://localhost:8081`:

- catálogo: `http://localhost:8081/legacy-designs`;
- recuperar acceso:
  `http://localhost:8081/recover?preview=1`;
- nueva contraseña:
  `http://localhost:8081/reset-password?preview=1&token=token-de-vista-previa`;
- aceptar invitación:
  `http://localhost:8081/accept-invitation?preview=1&token=00000000000000000000000000000000`;
- primera sucursal:
  `http://localhost:8081/location?preview=1`;
- resumen anterior:
  `http://localhost:8081/summary?preview=1`.

En un túnel o dominio distinto se conserva la ruta y sólo se sustituye
`http://localhost:8081` por el origen activo.

### Estrategia recomendada para la siguiente decisión

- Eliminar `location.tsx` y `summary.tsx` si la revisión visual confirma que no
  contienen elementos que se quieran rescatar.
- Mantener temporalmente recuperación, nueva contraseña y aceptación de
  invitaciones por su lógica activa.
- Rediseñar esas tres pantallas funcionales con el sistema blanco vigente.
- Después de migrarlas, comprobar si `Screen`, `PrimaryButton`, `TextField`,
  `SelectionList` y `theme.ts` quedaron sin consumidores; sólo entonces
  retirar la infraestructura heredada.
- Eliminar `legacy-designs.tsx` y el modo `preview` al cerrar la revisión.

### Verificación

- [x] Typecheck móvil.
- [x] ESLint de las seis pantallas intervenidas.
- [x] Exportación Expo Web aprobada con 1117 módulos.
- [x] Expo Router generó la ruta `/legacy-designs`.
- [x] Las acciones principales están deshabilitadas en modo de vista previa.
- [ ] Revisión visual y decisión explícita del usuario sobre cada pantalla.

## Eliminación definitiva de la interfaz móvil heredada — 29 de julio de 2026

### Decisión

El usuario revisó el inventario y decidió retirar todas las pantallas
heredadas. Recuperación de contraseña y aceptación de invitaciones se
rediseñarán completamente en el futuro. Por tanto, el catálogo temporal y sus
modos de vista previa también dejaron de ser necesarios.

### Rutas eliminadas

- `apps/mobile/app/(auth)/recover.tsx`;
- `apps/mobile/app/(auth)/reset-password.tsx`;
- `apps/mobile/app/(onboarding)/accept-invitation.tsx`;
- `apps/mobile/app/(onboarding)/location.tsx`;
- `apps/mobile/app/(onboarding)/summary.tsx`;
- `apps/mobile/app/(onboarding)/legacy-designs.tsx`.

Estas direcciones ya no forman parte del bundle móvil:

- `/recover`;
- `/reset-password`;
- `/accept-invitation`;
- `/location`;
- `/summary`;
- `/legacy-designs`.

### Infraestructura heredada retirada

Después de eliminar las pantallas se comprobó que los siguientes archivos
quedaron sin consumidores y también fueron retirados:

- `PrimaryButton.tsx` y su prueba;
- `Screen.tsx`;
- `SelectionList.tsx`;
- `TextField.tsx`;
- `features/onboarding/store.ts`;
- `features/onboarding/completeOnboarding.ts`;
- `theme.ts`.

La dependencia `zustand` sólo sostenía el store del onboarding anterior, por
lo que se eliminó de `apps/mobile/package.json` y de `pnpm-lock.yaml`.

`InlineMessage.tsx` sí continúa siendo utilizado por pantallas vigentes. Se
conservó, pero se desacopló del tema verde eliminado y ahora utiliza
contenedores claros para éxito y error.

### Prevención de rutas y acciones rotas

- Inicio de sesión ya no muestra el enlace hacia recuperación.
- Inicio de sesión y registro ya no intentan redirigir a aceptación de
  invitaciones mediante `invitationToken`.
- El registro verificado continúa directamente a `/account-setup`.
- Gestión de colaboradores conserva el resumen y listado del equipo.
- La creación y envío de nuevas invitaciones quedó deshabilitada y visible como
  `Próximamente`, porque sin una pantalla de aceptación funcional se generarían
  invitaciones que el destinatario no podría completar.
- Los endpoints del backend para recuperación, cambio de contraseña e
  invitaciones no se eliminaron. Quedan disponibles para el rediseño futuro y
  para no afectar otros consumidores.

### Verificación

- [x] Búsqueda estática sin imports ni navegación hacia las rutas eliminadas.
- [x] Typecheck móvil.
- [x] ESLint de los archivos adaptados.
- [x] 3 suites y 5 pruebas móviles aprobadas.
- [x] Exportación Expo Web aprobada con 1102 módulos.
- [x] El bundle exportado no contiene ninguna de las seis rutas retiradas.

## Corte consolidado para revisión manual — 29 de julio de 2026

### Estado general del corte

El desarrollo realizado hasta este punto queda técnicamente compilado y con
pruebas automatizadas aprobadas. El estado funcional del corte es:

> **PENDIENTE DE REVISIÓN MANUAL EN NAVEGADOR Y DISPOSITIVO MÓVIL.**

La revisión manual es necesaria para validar experiencia de uso, dimensiones,
gestos, persistencia entre sesiones y navegación real con datos creados por el
usuario. Las verificaciones automatizadas no sustituyen esta aceptación.

### Funcionalidades implementadas que forman parte de la revisión

#### 1. Registro, tipo de cuenta y finalización del onboarding

- Selección entre `Solo yo` y `Tengo un negocio`.
- Captura de datos personales, datos de actividad o negocio, país, ciudad,
  teléfono, horario inicial, credenciales y servicios.
- Verificación del correo antes de continuar.
- Recorrido inicial sin creación de colaboradores ficticios.
- Finalización transaccional e idempotente del onboarding.
- Creación de:
  - organización;
  - sede Principal;
  - membresía propietaria;
  - acceso del propietario a la sede;
  - horario general de siete días;
  - horario profesional del propietario;
  - categorías y servicios reales;
  - asignación de servicios al propietario.
- Personalización de textos y opciones visibles según el tipo de cuenta.
- Pantallas iniciales compactadas para reducir desplazamiento vertical
  innecesario.

#### 2. Navegación principal y Ajustes

- Cuenta finalizada abre el dashboard blanco vigente.
- Inicio, Agenda, Clientes, Caja y Ajustes utilizan navegación compartida.
- Ajustes muestra la identidad del negocio o actividad actual.
- `Mi actividad` se utiliza para `Solo yo`.
- `Mi negocio` se utiliza para `Tengo un negocio`.
- Ajustes del negocio abre rutas blancas independientes para:
  - Horario del negocio;
  - Configuración avanzada;
  - Gestión de servicios;
  - Gestión de colaboradores, sólo para `Tengo un negocio`.
- Los enlaces históricos de `(app)` funcionan únicamente como compatibilidad y
  redirigen a las páginas blancas actuales.
- No quedan enlaces de la navegación vigente hacia la antigua pantalla verde de
  Operaciones.

#### 3. Horario general del negocio

- Consulta y persistencia real mediante:
  - `GET /v1/business-schedule`;
  - `PUT /v1/business-schedule`.
- Semana completa de lunes a domingo.
- Activación y desactivación individual por checkbox.
- Engranaje de configuración debajo de cada día.
- Un solo intervalo de apertura y cierre por día.
- Hoja inferior con el mismo selector de hora utilizado en el registro.
- Cierre de la hoja mediante:
  - botón cerrar;
  - cancelar;
  - toque fuera de la hoja;
  - deslizamiento hacia abajo desde el tirador.
- Validación de apertura anterior al cierre.
- Conservación del último intervalo al desactivar y reactivar un día.
- Aviso al intentar salir con cambios sin guardar.
- Estados de carga, error, reintento, guardado y confirmación.
- Inicialización compatible con cuentas ya existentes.
- Auditoría del reemplazo de horario.
- Integración con disponibilidad y Agenda:
  - día cerrado sin espacios;
  - intersección del horario del negocio con el horario profesional;
  - rechazo de creación o reprogramación fuera del horario mediante
    `OUTSIDE_BUSINESS_HOURS`.

#### 4. Gestión de servicios

- Pantalla blanca `/service-management`.
- Consulta de categorías y servicios reales.
- Creación de categorías.
- Creación de servicios con:
  - nombre;
  - categoría;
  - duración;
  - precio.
- Asignación automática del servicio creado al propietario y sede actuales.
- Resumen de totales.
- Catálogo de servicios persistidos.
- Ruta separada del alta inicial `/services`, evitando que una cuenta
  finalizada regrese al onboarding.

#### 5. Configuración avanzada: alcance actual

La pantalla `/advanced-settings` está conectada y actualmente permite:

- mostrar el tipo de cuenta persistido;
- ocultar colaboradores para `Solo yo`;
- mostrar acceso a colaboradores para `Tengo un negocio`;
- mostrar el enlace de reservas generado desde el `slug` real;
- copiar el enlace;
- compartir el enlace;
- abrir el enlace.

Se muestran como `Próximamente` y no deben evaluarse como funcionales:

- Configuración general;
- Reservas anticipadas;
- Información adicional.

La edición del tipo de cuenta, la personalización detallada de permisos y la
edición del `slug` todavía no están implementadas. En este corte sólo se muestra
el tipo actual y se ofrecen las acciones existentes sobre el enlace.

#### 6. Gestión de colaboradores e invitaciones

- `/team-management` está disponible únicamente para `Tengo un negocio`.
- Muestra integrantes actuales e invitaciones pendientes.
- Propietario y administrador pueden enviar una invitación con nombre, correo,
  rol y, para profesionales, porcentaje de comisión inicial.
- Las tarjetas de integrantes activos permiten editar nombre, rol y porcentaje
  de comisión. El correo queda bloqueado porque identifica la cuenta aceptada.
- Eliminar un colaborador suspende su membresía y desactiva sus reglas futuras;
  no elimina citas, movimientos de caja, comisiones históricas ni auditoría.
- Las invitaciones pendientes pueden cancelarse y ya no se duplican dentro de
  la lista de integrantes activos.
- La invitación queda pendiente hasta que el destinatario acepte el enlace por
  correo. Solo entonces se activa su membresía y se crea la regla porcentual de
  comisión; una invitación pendiente no genera pagos ni comisiones.
- El enlace profundo `/accept-invitation?token=…` conserva el token al iniciar
  sesión o registrarse y permite completar la aceptación desde la app.
- El valor actual de `MOBILE_INVITATION_URL` y el esquema `barbersaas://` se
  mantienen temporalmente para desarrollo. Antes del despliegue se debe
  configurar un enlace HTTPS real de producción, asociado a la app mediante
  Universal Links/App Links y con una página web de respaldo. Este cambio queda
  pendiente y no bloquea las pruebas locales del flujo.
- Una cuenta `Solo yo` es devuelta a Ajustes del negocio si intenta abrir la
  ruta directamente.
- El envío exige que SMTP esté configurado; no se generan colaboradores ni
  registros ficticios.

#### 7. Eliminación de la interfaz heredada

Se eliminaron definitivamente las rutas móviles:

- `/recover`;
- `/reset-password`;
- `/accept-invitation`;
- `/location`;
- `/summary`;
- `/legacy-designs`.

También se retiraron los componentes, tema verde, store y dependencia
exclusivos de esas pantallas. Recuperación de contraseña y aceptación de
invitaciones quedan fuera del alcance funcional actual hasta su rediseño.

### Funcionalidades definidas pero todavía no desarrolladas

Las siguientes decisiones están documentadas como estrategia de producto, pero
no deben considerarse disponibles durante la prueba manual:

- permisos híbridos por rol con excepciones individuales;
- cambio entre `Solo yo` y `Tengo un negocio`;
- edición y validación de disponibilidad del enlace público;
- Nava Wallet;
- resumen e historial de pagos;
- efectivo y transferencia dentro de Wallet;
- integración PayPhone mediante API key e identificador de negocio;
- anticipos mínimos por porcentaje o valor fijo;
- planes Esencial y Multi;
- precios de suscripción;
- aplicación real de límites por plan.

WhatsApp permanece fuera del alcance aprobado. Los precios continúan por
definir.

## Guía de aceptación manual

### Preparación del entorno

1. Confirmar que PostgreSQL, API y aplicación móvil estén ejecutándose.
2. Aplicar las migraciones pendientes, incluida
   `20260729120000_add_business_weekly_schedules`.
3. Usar la base local de desarrollo configurada en `.env`.
4. No ejecutar pruebas de integración contra la base de desarrollo; las
   pruebas usan exclusivamente `barber_saas_test` en el servicio y puerto
   definidos para pruebas.
5. Abrir Expo Web y, si es posible, repetir las pruebas críticas en Android o
   iOS.
6. Utilizar dos correos diferentes:
   - uno para una cuenta `Solo yo`;
   - otro para una cuenta `Tengo un negocio`.
7. Registrar cualquier error con:
   - cuenta utilizada;
   - ruta o pantalla;
   - acción realizada;
   - resultado esperado;
   - resultado obtenido;
   - captura de pantalla;
   - mensaje de API o consola, si existe.

### Prueba A — Cuenta `Solo yo`

- [ ] Abrir Registro y seleccionar `Solo yo`.
- [ ] Completar todos los pasos con datos válidos.
- [ ] Confirmar que apertura y cierre no permitan un intervalo invertido.
- [ ] Crear al menos un servicio durante el onboarding.
- [ ] Verificar el correo y continuar.
- [ ] Confirmar que las pantallas iniciales permitan avanzar sin un
      desplazamiento vertical excesivo.
- [ ] Finalizar el onboarding.
- [ ] Confirmar que abre el dashboard blanco.
- [ ] Cerrar y volver a abrir la aplicación; no debe regresar al onboarding.
- [ ] Abrir Ajustes y confirmar que aparece `Mi actividad`.
- [ ] Abrir Ajustes del negocio.
- [ ] Confirmar que no aparece la opción Gestión de colaboradores.
- [ ] Abrir directamente `/team-management` y confirmar que regresa a Ajustes
      del negocio.
- [ ] Abrir Configuración avanzada y confirmar:
  - [ ] tipo de cuenta `Solo yo`;
  - [ ] ausencia de Permisos a colaboradores;
  - [ ] enlace de reserva visible;
  - [ ] Copiar funciona;
  - [ ] Compartir abre el diálogo del sistema;
  - [ ] Abrir intenta abrir la dirección correcta;
  - [ ] las tres secciones pendientes muestran `Próximamente`.

### Prueba B — Cuenta `Tengo un negocio`

- [ ] Cerrar sesión de la cuenta anterior.
- [ ] Registrar una cuenta nueva con `Tengo un negocio`.
- [ ] Completar negocio, ubicación, horario, credenciales y servicios.
- [ ] Confirmar que el onboarding no obliga a crear colaboradores.
- [ ] Verificar el correo y finalizar.
- [ ] Confirmar que abre el dashboard blanco.
- [ ] Abrir Ajustes y confirmar que aparece `Mi negocio`.
- [ ] Abrir Ajustes del negocio.
- [ ] Confirmar que Gestión de colaboradores sí aparece.
- [ ] Abrir Gestión de colaboradores y comprobar:
  - [ ] total de integrantes;
  - [ ] propietario en Equipo actual;
  - [ ] abrir `Enviar invitación`;
  - [ ] registrar nombre, correo, rol Profesional y comisión entre 0% y 100%;
  - [ ] confirmar que la invitación aparece como pendiente con su comisión;
  - [ ] aceptar el enlace con el correo invitado y confirmar que el integrante
        pasa a activo; entonces debe existir su regla inicial de comisión.
- [ ] Abrir Configuración avanzada y confirmar:
  - [ ] tipo de cuenta `Tengo un negocio`;
  - [ ] acceso a colaboradores;
  - [ ] enlace de reserva real;
  - [ ] acciones Copiar, Compartir y Abrir.

### Prueba C — Horario del negocio

Ejecutar primero con una cuenta y repetir al menos persistencia con la otra:

- [ ] Abrir Horario del negocio desde Ajustes.
- [ ] Confirmar que aparecen exactamente siete días, de lunes a domingo.
- [ ] Confirmar que el estado inicial coincide con el horario registrado.
- [ ] Desactivar un día.
- [ ] Confirmar que su engranaje queda deshabilitado.
- [ ] Reactivar el día y comprobar que recupera sus horas anteriores.
- [ ] Abrir el engranaje de un día activo.
- [ ] Cambiar apertura y cierre.
- [ ] Intentar guardar cierre anterior o igual a apertura; debe bloquearse.
- [ ] Cerrar la hoja tocando fuera.
- [ ] Cerrar la hoja con el botón.
- [ ] Cerrar la hoja deslizando el tirador hacia abajo.
- [ ] Guardar una semana válida.
- [ ] Salir y volver a entrar; los cambios deben persistir.
- [ ] Cerrar sesión e iniciar sesión; los cambios deben persistir.
- [ ] Modificar un valor, intentar volver sin guardar y confirmar que aparece
      la advertencia.
- [ ] Si se puede simular desconexión, guardar sin API y confirmar que el
      borrador permanece y se muestra un error recuperable.

### Prueba D — Efecto del horario sobre Agenda

- [ ] Seleccionar en Agenda un día marcado como cerrado.
- [ ] Confirmar que no se muestran espacios disponibles.
- [ ] Abrir un día con un intervalo corto.
- [ ] Confirmar que la línea temporal respeta apertura y cierre.
- [ ] Confirmar que no aparecen espacios del profesional fuera del horario del
      negocio.
- [ ] Intentar crear una cita fuera del intervalo; la API debe rechazarla.
- [ ] Intentar reprogramar una cita fuera del intervalo; la API debe
      rechazarla.
- [ ] Confirmar que una cita válida dentro del intervalo sí puede crearse.
- [ ] Confirmar que dos reservas sobre el mismo espacio no se aceptan
      simultáneamente.

### Prueba E — Gestión de servicios

- [ ] Abrir Gestión de servicios desde Ajustes del negocio.
- [ ] Confirmar que no redirige al alta inicial ni a Operaciones verde.
- [ ] Confirmar que se muestran categorías y servicios existentes.
- [ ] Crear una categoría nueva.
- [ ] Crear un servicio con nombre, categoría, duración y precio.
- [ ] Confirmar mensaje de éxito.
- [ ] Confirmar que el servicio aparece en el catálogo.
- [ ] Salir y volver a entrar; debe persistir.
- [ ] Comprobar que el servicio queda asociado a la sede y propietario.
- [ ] Comprobar que el nuevo servicio puede utilizarse al crear una cita.
- [ ] Probar campos vacíos o valores inválidos y confirmar que no se envía el
      formulario.

### Prueba F — Navegación y ausencia del diseño antiguo

- [ ] Desde Ajustes, abrir Horario, Configuración avanzada, Servicios y, en
      cuenta negocio, Colaboradores.
- [ ] Confirmar que todas usan fondo blanco y el sistema visual vigente.
- [ ] Confirmar que Servicios abre `/service-management`.
- [ ] Confirmar que Colaboradores abre `/team-management`.
- [ ] Confirmar que los botones Atrás regresan a la pantalla esperada.
- [ ] Confirmar que la barra inferior no envía a `(app)/operations`.
- [ ] Abrir enlaces históricos de dashboard, agenda u operations si existen en
      favoritos y comprobar que redirigen al diseño vigente.
- [ ] Confirmar que `/recover`, `/reset-password`, `/accept-invitation`,
      `/location`, `/summary` y `/legacy-designs` ya no muestran una pantalla
      funcional.
- [ ] Confirmar que Login no muestra `¿Olvidaste tu contraseña?`.

### Prueba G — UI, gestos y adaptación

Repetir las pantallas críticas en una altura pequeña y una grande:

- [ ] No hay espacios verticales excesivos en el onboarding.
- [ ] Los botones principales están visibles o requieren sólo el
      desplazamiento natural del contenido.
- [ ] No hay textos cortados, botones superpuestos ni contenido fuera de la
      pantalla.
- [ ] El teclado no cubre los campos ni la acción principal.
- [ ] Las hojas inferiores respetan el área segura del dispositivo.
- [ ] El gesto vertical para cerrar el horario no interfiere con los selectores
      de hora.
- [ ] Android, iOS y Web mantienen una jerarquía visual equivalente.
- [ ] Copiar, Compartir y Abrir se comportan correctamente según la plataforma.

### Criterio para aprobar el corte

El corte puede marcarse como aceptado cuando:

- las pruebas A a G estén completadas;
- no existan bloqueos de registro, onboarding, inicio de sesión o navegación;
- horario y servicios persistan después de volver a iniciar sesión;
- Agenda respete el horario general;
- ambos tipos de cuenta muestren las opciones correctas;
- no aparezca ninguna interfaz verde heredada;
- las diferencias visuales menores queden registradas como tareas concretas;
- cualquier error funcional tenga pasos de reproducción antes de iniciar el
  siguiente módulo.

Hasta completar esta guía, el estado oficial permanece:

> **IMPLEMENTADO TÉCNICAMENTE — ACEPTACIÓN MANUAL PENDIENTE.**

## Actualización 2026-07-30 — Agenda operativa y reservas públicas

### Flujo interno

- [x] `Nueva cita` continúa a un formulario real y conserva el cliente seleccionado.
- [x] El usuario elige un profesional concreto, uno o varios servicios y un horario calculado desde la disponibilidad efectiva.
- [x] La API vuelve a validar horario general, jornada profesional, bloqueos y citas existentes antes de crear o reprogramar.
- [x] La cita se vincula al cliente mediante `clientId`; nombre, correo, teléfono, precio y duración también se guardan como snapshot histórico.
- [x] El negocio o profesional autorizado puede cancelar o reprogramar manualmente desde Agenda.
- [x] La cancelación libera el horario; la reprogramación no puede crear solapamientos.

### Flujo público del cliente

1. La página pública muestra servicios, equipo y reseñas visibles.
2. El cliente selecciona obligatoriamente un profesional; no existe la opción `cualquier profesional`.
3. Selecciona uno o varios servicios asignados y habilitados para reserva online.
4. Selecciona una fecha y uno de los horarios calculados para la duración total.
5. Registra nombre completo, correo, país y teléfono en formato E.164, y acepta la política versionada del negocio.
6. La API crea un bloqueo temporal de diez minutos y envía un código de verificación por correo.
7. Al validar el código, la cita pasa a confirmada, se crea o reutiliza el cliente y se entrega un enlace privado de gestión.
8. La página final muestra profesional, servicios, precio, fecha, hora y sede; desde el mismo enlace se puede cancelar o reprogramar dentro de los límites configurados.
9. Si la cita se completa, el enlace permite publicar una reseña visible automáticamente. El propietario, administrador o profesional correspondiente puede ocultarla.

### Confirmación de asistencia sin WhatsApp

- [x] El negocio configura si desea una segunda confirmación de asistencia.
- [x] Configura cuántos minutos antes se envía el recordatorio y hasta cuándo se espera la respuesta.
- [x] El recordatorio se envía por correo con un enlace de confirmación que no requiere cuenta ni aplicación móvil.
- [x] El negocio decide si una cita no confirmada se conserva para gestión manual o se cancela automáticamente al vencer el plazo.
- [x] Las reservas realizadas dentro de la ventana del recordatorio no reciben una segunda confirmación redundante.
- [x] El negocio configura por separado la anticipación mínima para cancelar y reprogramar.

WhatsApp no forma parte de este corte. Puede añadirse después como un canal adicional sin cambiar el modelo de citas ni el enlace web de gestión.

### Política de almacenamiento

- Los días y horas disponibles no se guardan como filas. Se calculan al consultar usando horarios del negocio, horarios del profesional, bloqueos, duración acumulada y citas que reservan espacio.
- Un intento público sin verificar sí crea un bloqueo temporal para impedir que dos clientes tomen el mismo horario. Si no se verifica en diez minutos, pasa a `EXPIRED` y deja de reservar espacio.
- Los códigos se almacenan únicamente como hash; el código legible no permanece en la base.
- Las citas confirmadas, canceladas, completadas y ausencias se conservan. No son datos basura: forman el historial del cliente, permiten reseñas, métricas de asistencia, auditoría, comisiones y reportes futuros.
- La eliminación de un cliente es lógica. Su ficha desaparece del directorio activo, pero sus citas históricas no se pierden.

### Configuración y permisos

- [x] Pantalla móvil de reglas de reserva accesible desde Configuración avanzada.
- [x] Sólo propietario y administrador pueden modificar política, tiempos y comportamiento de no confirmados.
- [x] Pantalla móvil para mostrar u ocultar reseñas.
- [x] Un profesional puede administrar únicamente las reseñas asociadas a sus propias citas; recepción no puede ocultarlas.

### Migración y verificación

- [x] Migración `20260730120000_public_bookings_clients_and_reviews` aplicada en PostgreSQL de desarrollo y pruebas.
- [x] Prisma validado, formateado y cliente regenerado.
- [x] Typecheck de API, móvil y web.
- [x] ESLint de todos los archivos modificados por este flujo.
- [x] Suite API: 21/21 pruebas aprobadas, incluidas 3 integrales del flujo público.
- [x] Validación: 19/19 pruebas aprobadas.
- [x] Móvil: 5/5 pruebas aprobadas.
- [x] Builds de producción de API, web y exportación Expo Web aprobados.

### Pendiente para aceptación

- [x] Entrega real de correos comprobada en una bandeja externa con el SMTP del entorno.
- [x] Recorrer visualmente el flujo público en tamaños móvil y escritorio.
- [ ] Afinar detalles menores de UI/UX en la ventana pública del cliente, sin bloqueos funcionales.
- [ ] Confirmar textos legales definitivos y valores iniciales de cancelación, reprogramación y no confirmación.
- [ ] Configurar el dominio público definitivo usado por los enlaces incluidos en correos.
- [ ] Sustituir el rate limiting en memoria si la API se despliega en más de una instancia.

Estado de este corte:

> **IMPLEMENTADO, VERIFICADO AUTOMÁTICAMENTE Y ACEPTADO EN EL FLUJO PÚBLICO — AJUSTES MENORES DE UI/UX Y CONFIGURACIÓN EXTERNA PENDIENTES.**

## Corte de continuidad 2026-07-30 — Notificaciones de reservas

### Estado completado en este corte

- [x] Agenda móvil actualiza las citas cada 2 segundos.
- [x] Las reservas públicas se distinguen en Agenda con la insignia `Reserva online`.
- [x] Las citas se muestran dentro de la fila horaria que corresponde a su inicio.
- [x] Al tocar una cita activa, Agenda muestra una hoja con las acciones `Reprogramar cita`, `Cancelar cita` y `Cerrar`; no depende de `Alert` en Expo Web.
- [x] EAS Project ID configurado en `apps/mobile/app.json`:
      `0feb8bfa-2e01-44e6-8e79-22927a8a7dcb`.
- [x] Base PostgreSQL local de desarrollo `barber_saas` en `127.0.0.1:5434` reiniciada con autorización explícita; sus datos de desarrollo fueron eliminados y las migraciones existentes se reaplicaron.
- [x] Migración `20260730202030_app_notifications` creada y aplicada localmente. Añade el enum `AppNotificationType`, las tablas `app_notifications` y `push_tokens`, y el cliente Prisma fue regenerado.

### Implementación completada

- [x] Módulo de API de notificaciones internas conectado.
- [x] Al confirmar una reserva pública, se crean notificaciones para el profesional asignado y propietario/administradores; se envía correo SMTP a esos destinatarios cuando está configurado.
- [x] La cancelación y reprogramación desde el enlace privado generan las mismas notificaciones.
- [x] Bandeja interna autenticada: lista, marca como leídas y navega a Agenda.
- [x] Registro y revocación de tokens Expo Push por usuario/dispositivo mediante `push_tokens`.
- [x] Envío push mediante Expo al profesional asignado y propietario/administradores con token registrado.
- [x] Botón global de notificaciones visible en todas las pantallas autenticadas; muestra contador de no leídas y despliega una bandeja animada desde la izquierda.
- [x] Acción manual `Enviar recordatorio por WhatsApp` desde la cita: abre WhatsApp con el nombre real del negocio, profesional asignado y fecha/hora formateada en la zona horaria de la sucursal, sin automatización ni proveedor.

### Permisos de Agenda vigentes

- Propietario, administrador y recepción tienen `appointment.manage` y pueden cancelar o reprogramar citas de la organización.
- Un barbero tiene `appointment.manage` limitado a sus propias citas.
- Las acciones se encuentran en **Agenda**: tocar una cita activa abre la hoja de gestión. Citas canceladas, finalizadas o marcadas como no asistió conservan historial y no se vuelven a gestionar.

### Estado del corte

> **IMPLEMENTADO Y VERIFICADO AUTOMÁTICAMENTE.** La validación visual manual del banner global y del contenido final de WhatsApp fue completada durante este corte.

## Inicio de Fase 6 — Caja y POS básico

- [x] Migración `20260731090000_cash_register_pos` aplicada en PostgreSQL local.
- [x] Modelo de movimientos de caja para ventas, gastos y retiros, con métodos de pago.
- [x] API para consultar el resumen de una caja abierta, registrar movimientos y cerrar caja con efectivo esperado, contado y diferencia.
- [x] Ruta móvil `/wallet` conectada desde `Nava Wallet` en Ajustes del negocio; presenta el resumen inicial, el acceso a Caja física y el estado de PayPhone.
- [x] Pestañas funcionales de Wallet: resumen de cobros por método, historial de cierres y estado de configuración de PayPhone; formularios de ventas, gastos, retiros y cierre de Caja disponibles desde móvil.
- [x] Auditoría de apertura, movimientos y cierre; pruebas de integración para totales, cierre e historial.
- [x] Migración `20260731110000_cash_register_open_session_guard` aplicada en desarrollo y pruebas; impide dos cajas abiertas para el mismo negocio o propietario.
- [x] Pantalla móvil de Caja rediseñada con saldo esperado, apertura, resumen diario y movimientos recientes; el propietario no se duplica en el selector de responsable.
- [x] Historial de Wallet muestra explícitamente el efectivo contado al cierre, separado del total de ventas, y cada cierre abre su detalle.
- [x] Detalle de Caja disponible para sesiones abiertas y cerradas: responsable, base, estado, ventas, gastos, retiros, efectivo esperado, contado, diferencia, nota y fecha de cierre.
- [x] Desglose desplegable de todos los métodos de pago (efectivo, tarjeta, transferencia y otro) y listado completo de movimientos, incluida la referencia de una cita vinculada cuando existe.
- [x] Endpoint autenticado de detalle por sesión de caja y prueba PostgreSQL específica aprobada para los datos de cierre y movimientos.
- [ ] Pruebas manuales en dispositivo físico diferidas al proceso final de validación integral del MVP; no bloquean el inicio de las fases siguientes.

## Continuación de Fase 7 — Cálculo automático de comisiones

- [x] Migración `20260731232000_commission_sources` aplicada en PostgreSQL de desarrollo y pruebas.
- [x] Las ventas manuales de Caja pueden identificar servicio y profesional; las ventas libres continúan sin generar comisión.
- [x] La API verifica que el servicio esté activo y asignado al profesional dentro de la organización y sucursal de la sesión.
- [x] Una venta marcada como comisionable exige una regla vigente y crea su movimiento de Caja y entrada de comisión en una sola transacción.
- [x] El cobro de una cita exige el importe completo, marca la cita como pagada y reconcilia la comisión en la misma transacción.
- [x] La comisión de una cita se genera cuando coinciden los estados `COMPLETED` y `PAID`, independientemente del orden en que se registren.
- [x] Cada servicio de cita y cada venta manual producen como máximo una entrada idempotente, con snapshot de servicio, base, regla y resultado.
- [x] Las reglas específicas por servicio prevalecen sobre la regla general del profesional; dentro del mismo alcance se respeta prioridad y fecha de creación.
- [x] Caja móvil permite elegir entre venta libre y servicio comisionable, seleccionando servicio y profesional asignado.
- [x] Prisma validado y cliente regenerado; typecheck de API y móvil aprobado.
- [x] Suite API/PostgreSQL: 23/23 pruebas aprobadas, incluyendo cobro antes/después de completar e idempotencia.
- [x] ESLint de los archivos modificados, bundle de API y exportación Expo Web aprobados.
- [x] Implementar reversos auditables para anulaciones o devoluciones.
- [x] Implementar creación, aprobación y pago de liquidaciones.
- [x] Añadir consulta y gestión móvil de comisiones y liquidaciones.

## Extensión aprobada de Fase 7 — Anticipos a profesionales

### Alcance

Un **anticipo a profesional** es dinero entregado por el negocio a un barbero
o profesional activo que se recupera exclusivamente de sus futuras
liquidaciones de comisión. No es una venta, una comisión generada ni una
edición de una comisión previa. Los anticipos de clientes para reservas
públicas pertenecen a Wallet y son un flujo diferente.

### Flujo operativo

1. Propietario o administrador registra el anticipo indicando profesional,
   monto en centavos, fecha/hora de entrega, método de pago, referencia y nota.
2. Si la entrega es en efectivo y existe Caja abierta, se registra además una
   salida de Caja vinculada al anticipo. Una transferencia u otro medio no
   altera el efectivo esperado de Caja.
3. El anticipo queda con saldo pendiente y no modifica el cálculo ni el estado
   de las comisiones ya generadas.
4. Al crear una liquidación, la API toma las comisiones pendientes del período
   y aplica, por antigüedad, anticipos pendientes del mismo profesional hasta
   el total de comisión disponible.
5. Cada descuento se almacena como una asignación inmutable
   `anticipo → liquidación`, con monto y fecha de aplicación. Un anticipo puede
   descontarse parcialmente en varias liquidaciones.
6. Al aprobar la liquidación se fija la fecha de descuento; al pagarla se
   registra fecha, método y referencia del pago neto al profesional.
7. Si una liquidación en borrador se cancela, se liberan sus asignaciones y el
   saldo de los anticipos vuelve a estar disponible. Un anticipo ya entregado
   no se borra: una corrección crea un reverso con actor, fecha y motivo.

### Reglas y controles obligatorios

- [x] Cada anticipo conserva importe original, saldo pendiente, profesional,
      método, referencia, notas, entregado por, fecha de entrega y auditoría.
- [x] Estados: `PENDING`, `PARTIALLY_DEDUCTED`, `FULLY_DEDUCTED` y
      `REVERSED`.
- [x] El neto de una liquidación nunca baja de cero. Si el anticipo supera la
      comisión del período, el saldo restante pasa al siguiente período.
- [x] Un anticipo no puede descontarse dos veces; la asignación única por
      liquidación y anticipo, junto con la transacción de base de datos,
      protege de concurrencia.
- [x] Solo propietario y administrador pueden registrar, revertir, aprobar o
      pagar. El profesional ve únicamente sus propios anticipos, descuentos y
      liquidaciones.
- [x] Si el profesional deja la organización, los anticipos pendientes se
      conservan para un cierre administrativo; no se eliminan en cascada.
- [ ] Las políticas laborales, tributarias o de nómina aplicables se validarán
      con asesoría local antes de usar esta función como préstamo formal.

### Ejemplo de liquidación

| Concepto                          | Importe |
| --------------------------------- | ------: |
| Comisiones generadas del período  | $180.00 |
| Anticipo entregado el 3 de agosto | -$50.00 |
| Neto pagado al profesional        | $130.00 |

Si la comisión es $40.00 y el anticipo pendiente $50.00, se descuenta $40.00,
el pago neto es $0.00 y $10.00 queda pendiente para la siguiente liquidación.

### Entregables de implementación

- [x] Migración: anticipos profesionales, asignaciones a liquidaciones,
      referencias de aprobación/pago y tipos de salida de Caja.
- [x] API transaccional para crear/listar/revertir anticipos y crear,
      aprobar, cancelar y pagar liquidaciones.
- [x] Integración de las salidas en efectivo con Caja y de los pagos en efectivo
      de liquidaciones con su detalle y auditoría.
- [x] Pantalla móvil de comisiones: saldo por profesional, historial de
      anticipos, detalle de descuentos y acciones autorizadas.
- [ ] Pruebas PostgreSQL de aislamiento multi-tenant, concurrencia, descuentos
      parciales, cancelación de borrador, reversos y no duplicación.

### Revisión de lógica previa a implementación — 1 de agosto de 2026

La revisión contra el esquema, API y UI actuales fija las siguientes
decisiones para evitar ambigüedades contables:

- La fecha que incluye una comisión en un período será `occurredAt`: inicio de
  la cita para servicios y fecha del movimiento para ventas manuales. No se
  usará `commission_entries.created_at`, porque una cita puede cobrarse días
  después de prestarse.
- Crear una liquidación `DRAFT` reserva sus comisiones y anticipos, pero todavía
  no considera descontado el anticipo. La asignación recibe `appliedAt` y reduce
  formalmente el saldo cuando la liquidación pasa a `APPROVED`.
- La UI mostrará por separado saldo pendiente, saldo reservado en borradores y
  saldo efectivamente descontado. Cancelar un borrador libera sus reservas.
- La liquidación será por organización, profesional y período, incluyendo
  todas sus sucursales, con desglose por sucursal. La Caja usada para entregar
  o pagar efectivo sí conserva su sucursal de origen.
- Solo se admitirán `CASH`, `TRANSFER` y `OTHER` para entregar anticipos o pagar
  liquidaciones. `CARD` permanece como método de cobro a clientes y no se
  presentará para pagos al profesional.
- Un pago neto de cero por descuento total se cierra con fecha y auditoría, sin
  crear un movimiento de Caja por valor cero.
- No se permiten períodos que reutilicen una comisión ya reservada o liquidada.
  La selección y asignación se ejecutan en una transacción y se comprueba el
  número de filas actualizado para resolver solicitudes concurrentes.
- Un anticipo se puede revertir directamente solo mientras no tenga descuentos
  aprobados. Si ya fue descontado parcial o totalmente, la corrección se hace
  con un ajuste compensatorio a favor del profesional dentro de una siguiente
  liquidación; nunca se altera el historial aprobado.
- El profesional debe estar activo al entregar el anticipo. Si después queda
  suspendido o sale del equipo, conserva historial y saldo para cierre
  administrativo.
- Se usará el término visible `Anticipo de comisión`; `préstamo` se reservará
  para una futura función contractual que tenga cuotas, vencimiento o interés.

### Permisos financieros requeridos

El paquete actual de permisos no incluye Caja, comisiones, anticipos ni
liquidaciones. Antes de exponer las rutas se agregarán y probarán capacidades
financieras explícitas:

- `commission.read.own`: profesional consulta únicamente sus datos.
- `commission.read.all`: propietario y manager consultan el equipo.
- `commission.manage`: propietario y manager crean/revierten anticipos y crean
  liquidaciones.
- `commission.approve`: propietario aprueba liquidaciones; puede delegarse al
  manager posteriormente mediante permisos personalizados.
- `commission.pay`: propietario registra el pago; puede delegarse después.
- `cash.manage`: controla las salidas en efectivo asociadas.

Recepción y barbero no pueden registrar anticipos, aprobar ni pagar. Además de
ocultar acciones en móvil, cada endpoint vuelve a validar rol, organización y
alcance en el servidor.

### Flujo y estructura de UI aprobados

`Nava Wallet` conservará Caja e historial financiero. En Resumen se añadirá una
tarjeta `Comisiones del equipo`, que abre `/commissions`; el anticipo no se
registrará desde el formulario genérico `Gasto o retiro`.

La pantalla de Comisiones tendrá:

1. Resumen con `Comisiones pendientes`, `Anticipos por descontar` y `Neto
estimado`.
2. Filtros por período y profesional, y lista con generado, anticipos y neto de
   cada integrante.
3. Detalle del profesional con pestañas `Comisiones`, `Anticipos` y
   `Liquidaciones`.
4. Para propietario/manager, acciones `Registrar anticipo` y `Crear
liquidación`; para el barbero, vista `Mis comisiones` sin acciones de
   gestión.

El panel `Registrar anticipo` solicitará profesional, monto, método, fecha de
entrega, referencia y nota. Al elegir efectivo mostrará la Caja abierta y
bloqueará la confirmación si no existe una. Antes de guardar presentará una
confirmación con el texto `Este valor se descontará de futuras liquidaciones`.

La previsualización de liquidación mostrará:

| Concepto         | Contenido                                   |
| ---------------- | ------------------------------------------- |
| Período          | inicio y fin en la zona horaria del negocio |
| Comisiones       | servicios/ventas incluidos y total generado |
| Reversos/ajustes | compensaciones con referencia al origen     |
| Anticipos        | fecha, importe aplicado y saldo restante    |
| Neto a pagar     | total final, nunca menor que cero           |

El detalle de un anticipo mostrará una línea de tiempo: entrega, reserva en
borrador, descuento aprobado y saldo restante. Cada evento enlazará a Caja o a
la liquidación relacionada. En Detalle de Caja se separarán `Anticipos a
colaboradores` y `Pagos de liquidaciones`; ambos reducirán efectivo esperado
solo cuando su método sea efectivo.

### Matriz de pruebas obligatoria

#### Cálculos unitarios

- [ ] Comisión $180, anticipo $50: neto $130 y saldo $0.
- [ ] Comisión $40, anticipo $50: neto $0 y saldo siguiente $10.
- [ ] Varios anticipos se aplican de más antiguo a más reciente.
- [ ] Un anticipo se distribuye parcialmente entre varias liquidaciones.
- [ ] Reversos y ajustes se incluyen una sola vez y el neto nunca es negativo.
- [ ] Redondeo en centavos para reglas porcentuales y fijas.

#### API y PostgreSQL

- [ ] Crear anticipo en efectivo exige Caja abierta y crea una única salida
      vinculada; transferencia no altera efectivo esperado.
- [ ] Un barbero no puede crear/revertir anticipos ni aprobar/pagar.
- [ ] Un barbero solo consulta sus propios registros; no puede cambiar el ID
      para leer los de otro profesional u organización.
- [ ] Dos solicitudes concurrentes no asignan la misma comisión ni el mismo
      saldo de anticipo dos veces.
- [ ] Cancelar `DRAFT` libera reservas; cancelar `APPROVED` se rechaza.
- [ ] Aprobar fija snapshots y fechas; pagar es idempotente.
- [ ] Una liquidación de neto cero se cierra sin movimiento monetario.
- [ ] Revertir anticipo sin descuentos crea trazabilidad; con descuento
      aprobado exige ajuste compensatorio.
- [ ] Suspender o retirar al profesional conserva historial y saldo.
- [ ] Aislamiento multi-tenant y auditoría con actor, antes/después y motivo.

#### Componentes móviles automatizados

- [ ] Resumen, estados vacíos, carga, error recuperable y permisos por rol.
- [ ] Validación de monto, método, referencia y Caja abierta.
- [ ] Previsualización correcta del bruto, anticipos y neto.
- [ ] Confirmaciones de anticipo, aprobación, pago, cancelación y reverso.
- [ ] Etiquetas accesibles y foco/teclado en paneles inferiores.

#### Aceptación manual Android, iOS y Web

- [ ] Navegar Wallet → Comisiones → profesional → anticipo/liquidación y volver
      sin perder filtros.
- [ ] Probar alturas pequeñas/grandes, teclado, área segura, scroll y cierre de
      panel tocando fuera, botón y gesto.
- [ ] Verificar importes, fechas y zona horaria en lista, detalle y Caja.
- [ ] Confirmar que el barbero ve sus datos pero nunca acciones administrativas.
- [ ] Confirmar persistencia tras recargar, cerrar sesión y volver a entrar.
- [ ] Simular error de red y doble toque; no debe duplicar anticipos ni pagos.

### Implementación completada — 1 de agosto de 2026

- [x] Migración `20260801110000_professional_advances_and_settlements` creada y
      aplicada en PostgreSQL de desarrollo (`5434`) y pruebas (`5433`).
- [x] `commission_entries.occurred_at` conserva la fecha económica de la cita o
      venta para seleccionar correctamente el período.
- [x] Libro de anticipos con importe original, reservado, descontado,
      disponible, método, referencia, notas, actor, fechas y reverso.
- [x] Asignaciones de anticipos a liquidaciones con estados `RESERVED`,
      `APPLIED` y `RELEASED`.
- [x] API de resumen, creación y reverso de anticipos; creación, aprobación,
      cancelación y pago idempotente por estado de liquidaciones.
- [x] Propietario aprueba y paga; propietario/manager consultan y gestionan;
      barbero consulta únicamente sus datos. Todos los endpoints validan la
      organización derivada de la sesión.
- [x] Caja registra salidas por anticipos y pagos de liquidación, además de
      entradas compensatorias por reversos en efectivo.
- [x] Wallet incluye la pestaña `Comisiones`, filtro por profesional, neto
      estimado, anticipos, liquidaciones, creación, aprobación, cancelación y
      pago. Detalle de Caja distingue cada tipo de movimiento.
- [x] Suite API/PostgreSQL: 25/25 pruebas aprobadas; incluye autorización,
      descuento total con saldo remanente, neto cero, aprobación/pago,
      cancelación de borrador, liberación de reservas, reverso y auditoría.
- [x] Typecheck de API, móvil y cliente compartido; ESLint de archivos
      modificados; Prisma validate; bundle de API; Jest móvil 5/5 y exportación
      Expo Web aprobados.
- [ ] Revisión visual manual en Android, iOS y Web. El navegador integrado del
      entorno no pudo inicializarse durante este corte, por lo que la validación
      visual no se marca como realizada.
- [ ] Añadir pruebas específicas de concurrencia simultánea sobre dos creaciones
      o aprobaciones de la misma liquidación, además de la protección
      transaccional ya implementada.

Estado del corte:

> **IMPLEMENTADO Y VERIFICADO AUTOMÁTICAMENTE — ACEPTACIÓN VISUAL MANUAL Y
> PRUEBA ESPECÍFICA DE CONCURRENCIA PENDIENTES.**

## Endurecimiento de invitaciones y visibilidad del equipo — 1 de agosto de 2026

### Regla funcional

Una invitación enviada no convierte a la persona en colaborador visible ni le
otorga acceso operativo. La activación exige, en este orden:

1. recibir el enlace con token opaco y vigencia limitada;
2. registrar o completar la cuenta con el mismo correo invitado;
3. verificar ese correo (`users.email_verified_at`);
4. abrir el enlace e iniciar sesión;
5. aceptar la invitación pendiente;
6. activar la membresía y aplicar rol, sucursal y comisión inicial.

Mientras falte cualquiera de esos pasos, la membresía permanece `INVITED` y no
forma parte de `Equipo actual`, Agenda, Caja ni selectores operativos. Solo
propietarios y administradores pueden verla en el bloque administrativo
`Invitaciones pendientes`, claramente separado de los integrantes activos, para
consultar su vencimiento o cancelarla.

### Implementación y pruebas

- [x] `GET /v1/team` devuelve en `members` únicamente membresías `ACTIVE`.
- [x] Las invitaciones pendientes se devuelven por separado con
      `activationStatus: pending_acceptance`.
- [x] `POST /v1/team/invitations/accept` exige explícitamente correo verificado,
      coincidencia entre el correo autenticado y el invitado, token pendiente y
      fecha de vencimiento vigente.
- [x] La aceptación reclama el token atómicamente dentro de la misma transacción
      que activa la membresía; un token usado, revocado o vencido no puede
      reutilizarse.
- [x] La UI cuenta solo integrantes activos y explica que los pendientes aún no
      son colaboradores ni tienen acceso.
- [x] Prueba de integración: el invitado no aparece antes de aceptar; una cuenta
      sin verificar recibe `EMAIL_NOT_VERIFIED`; tras verificar y aceptar aparece
      en el equipo; el segundo uso del token recibe `INVALID_INVITATION`.

### Dependencia externa pendiente

- [ ] Adquirir y configurar el dominio definitivo para enlaces HTTPS de
      invitación.
- [ ] Asociar la ruta de aceptación con Universal Links/App Links y mantener una
      página web de respaldo para equipos sin la aplicación instalada.
- [ ] Cambiar `MOBILE_INVITATION_URL` en producción al enlace HTTPS del dominio y
      validar entrega, apertura y redirección en Android, iOS y Web.

Hasta completar esa dependencia, el flujo puede probarse con el esquema local
`barbersaas://accept-invitation`; la regla de seguridad y activación no depende
del dominio y ya queda preparada en el servidor.

### Limpieza de invitaciones pendientes — 1 de agosto de 2026

- [x] Se eliminaron de la base de desarrollo las 2 invitaciones `PENDING`, las
      2 membresías `INVITED` y sus 2 asignaciones de sucursal asociadas.
- [x] Verificación posterior: cero invitaciones, membresías o asignaciones
      pendientes de activación.
- [x] Las cuentas sin verificar se conservaron: no son colaboradoras activas y
      pueden completar un registro válido o recibir una nueva invitación.
- [ ] Corregir los botones de retorno heredados que ejecutan `router.back()` sin
      confirmar `router.canGoBack()`. El aviso observado en `logs.log`
      (`GO_BACK was not handled by any navigator`) solo ocurre en desarrollo,
      pero debe resolverse con una ruta alternativa específica por pantalla.

## Suscripción, servicios y configuración de acceso — 1 de agosto de 2026

### Suscripción simulada

- [x] Modelos `Plan` y `Subscription` con estados `TRIAL`, `ACTIVE`, `PAST_DUE`,
      `SUSPENDED` y `CANCELLED`.
- [x] Migración `20260801195214_subscription_plans` aplicada en desarrollo y
      pruebas.
- [x] Definiciones de Esencial y Multi viven en backend, sin precios
      provisionales ni cobro real.
- [x] Esencial ofrece prueba de 14 días y período de gracia de siete días;
      después puede marcar la suscripción en modo de solo lectura.
- [x] Multi permanece visible como `Próximamente` y no puede activarse.
- [x] `GET /v1/subscription` devuelve plan, estado, fechas, funciones y consumo
      de sucursales e integrantes.
- [x] Ruta móvil `/subscription` conectada desde Ajustes del negocio, con plan
      actual, estado, uso y comparación de planes.
- [ ] Integrar facturación de Nava únicamente cuando existan proveedor, precios,
      política comercial y revisión legal aprobados.

### Gestión de servicios

- [x] Cada servicio activo abre edición de nombre, descripción, categoría,
      duración, precio y disponibilidad para reservas en línea.
- [x] `PATCH /v1/services/:id` valida organización, permiso, categoría y nombre
      duplicado; registra auditoría antes/después.
- [x] `DELETE /v1/services/:id` realiza baja lógica, retira asignaciones activas
      y conserva las citas históricas; registra `service.archived`.
- [x] Crear nuevamente un nombre archivado reactiva el mismo servicio, conserva
      su identidad histórica y registra `service.reactivated`; un nombre activo
      duplicado devuelve conflicto controlado.
- [x] La UI confirma la eliminación y actualiza el catálogo sin recargar.

### Tipo de cuenta y permisos

- [x] `Tipo de cuenta` abre `/account-type` y permite cambiar entre `Solo yo` y
      `Tengo un negocio` sin eliminar información operativa.
- [x] Solo el propietario puede cambiar el tipo. El cambio a `Solo yo` se bloquea
      si existen colaboradores activos, invitaciones pendientes o más de una
      sucursal.
- [x] `Permisos a colaboradores` abre una página separada y asigna perfiles de
      acceso Administrador, Recepción o Profesional usando el RBAC vigente.
- [x] Los perfiles muestran sus capacidades y la API sigue siendo la autoridad
      final; los permisos no se duplican como reglas editables en el cliente.
- [ ] Permisos personalizados por acción y alcance de sucursal quedan para una
      fase posterior que centralice excepciones en backend y auditoría.

### Configuración general definida

La futura pantalla `Configuración general` agrupará idioma, zona horaria,
moneda, formatos regionales de fecha/hora y preferencias operativas por defecto.
No incluirá política de reservas, permisos, suscripción, Wallet ni información
del negocio, porque esas funciones ya tienen secciones independientes. Antes de
habilitar cambios de zona horaria o moneda se debe definir cómo afectan citas,
caja, comisiones y registros históricos.

### Verificación

- [x] Typecheck de API, móvil, cliente y validaciones compartidas.
- [x] ESLint de todos los archivos modificados.
- [x] Suite API/PostgreSQL: 26/26 pruebas aprobadas.
- [x] Suite móvil: 3 archivos y 5/5 pruebas aprobadas; exportación Web de Expo
      completada sin errores de compilación.
- [ ] Recorrido visual manual de las nuevas pantallas en Android, iOS y Web.

## Inicio de Reportes esenciales — 1 de agosto de 2026

### Resumen del negocio

- [x] Nueva ruta móvil `/business-summary`, accesible desde
      `Estadísticas e informes`, inspirada en las referencias
      `UI-resumen.jpeg` y `UI-resumen2.jpeg` y adaptada a la paleta global de
      Nava.
- [x] Nuevo endpoint `GET /v1/reports/business-summary` con períodos `Hoy`,
      `Últimos 7 días`, `Este mes` y `Últimos 30 días`; admite además
      `from`/`to` para un futuro selector personalizado de hasta 366 días.
- [x] El reporte respeta la zona horaria de cada sucursal y permite consolidar
      únicamente monedas iguales. Si una futura organización tiene monedas
      distintas, exige seleccionar una sucursal.
- [x] El propietario puede consultar todas sus sucursales; el administrador
      solo las sucursales asignadas. Recepción y profesionales no pueden leer
      reportes financieros globales.
- [x] La UI presenta resultado neto, ingresos y egresos, tipos de venta, número
      de transacciones, ticket promedio y comisiones generadas, con filtros por
      período y sucursal.

### Definiciones contables del resumen MVP

| Indicador            | Fuente actual                             | Regla                                                                                                                           |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Ventas cobradas      | `CashMovement.SALE`                       | Incluye únicamente cobros registrados en Caja.                                                                                  |
| Otros ingresos       | `DEPOSIT` y `OTHER_INCOME`                | Incluye depósitos manuales y otros ingresos registrados en Caja; nunca se reutiliza `SALE`.                                     |
| Venta de servicios   | Venta vinculada a cita o servicio         | Usa `appointmentId` o `serviceId`; una venta sin ambos queda como venta libre.                                                  |
| Productos            | `CashMovement.SALE` con `productId`       | Las ventas de productos registradas en Caja se separan de servicios y ventas libres; una reversión deja de sumarlas.            |
| Gastos operativos    | `CashMovement.EXPENSE`                    | Reduce el resultado neto del período.                                                                                           |
| Pago a colaboradores | Liquidaciones y anticipos menos reversos  | Refleja salida neta de efectivo; conserva la trazabilidad de descuentos posteriores.                                            |
| Retiros              | `CashMovement.WITHDRAWAL`                 | Se informa, pero no reduce el resultado porque mover efectivo no constituye un gasto.                                           |
| Comisiones           | `CommissionEntry` no revertida            | Muestra comisión generada, no necesariamente pagada en el mismo período.                                                        |
| Resultado neto       | Ingresos − gastos − pagos a colaboradores | Es un resultado operativo de Caja, no utilidad contable: todavía no incorpora impuestos, costo de inventario ni depreciaciones. |

### Plan de las demás opciones de Reportes

| Opción                             | Estado e integración definida                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Historial de caja                  | Disponible mediante la pestaña Historial de Wallet: cierres, efectivo esperado, contado y diferencia.                                                          |
| Historial de gastos                | Disponible: listado paginado de movimientos `EXPENSE`, filtros por fecha/sucursal/método y CSV.                                                                |
| Historial de depósitos             | Disponible: `DEPOSIT` y `OTHER_INCOME` paginados, con filtros por fecha/sucursal/método y CSV; no reutiliza `SALE`.                                            |
| Pagar a colaboradores              | Disponible mediante Wallet/Comisiones y sus liquidaciones auditables.                                                                                          |
| Historial de pagos a colaboradores | Disponible inicialmente en Wallet/Comisiones; luego tendrá filtros y exportación propios.                                                                      |
| Alerta de inventario               | Disponible: catálogo, stock por sucursal, movimientos auditables, ajustes y filtro por umbral mínimo.                                                          |
| Historial de ventas                | Disponible: detalle paginado de `SALE` por método, servicio, profesional, cita y cliente.                                                                      |
| Préstamos a clientes               | Pendiente de definición. No se desarrollará hasta validar una funcionalidad y reglas adecuadas para el MVP; no debe confundirse con anticipos a colaboradores. |
| Reseñas de clientes                | Disponible mediante Gestión de reseñas.                                                                                                                        |

### Verificación de este corte

- [x] Typecheck de API, móvil y cliente compartido; ESLint de los archivos
      modificados.
- [x] Suite API/PostgreSQL: 26/26 pruebas aprobadas, incluidos totales del
      resumen y denegación del reporte global al profesional.
- [x] Suite móvil: 3 archivos y 5/5 pruebas aprobadas.
- [x] Exportación Web de Expo completada con la nueva ruta.
- [ ] Recorrido visual del resumen en viewport móvil: diferido porque el
      navegador integrado del entorno no pudo inicializar sus recursos
      internos; requiere validación manual en dispositivo o navegador.

## Cierre de sesión y eliminación de cuenta — 1 de agosto de 2026

### Cierre de sesión

- [x] `Cerrar sesión` solicita confirmación y muestra estado de progreso para
      evitar acciones repetidas.
- [x] `POST /v1/auth/logout` revoca la sesión actual en el servidor; el cliente
      elimina el token local y limpia la caché privada de React Query.
- [x] Una sesión revocada ya no puede consultar `GET /v1/auth/session`.

### Eliminación segura y auditable

- [x] Nueva operación autenticada `DELETE /v1/account`, protegida por la
      contraseña actual y la confirmación literal `ELIMINAR`.
- [x] La eliminación revoca todas las sesiones, elimina datos transitorios del
      perfil y anonimiza correo, nombre, teléfono, contraseña, biografía y foto.
- [x] Se incorporó `users.deleted_at`; autenticación y sesiones rechazan cuentas
      eliminadas, aunque quedara un token anterior en otro dispositivo.
- [x] No se destruyen citas, movimientos de Caja, comisiones, liquidaciones ni
      auditorías. Esos registros se conservan con la referencia técnica del
      usuario anonimizado para mantener integridad financiera y trazabilidad.
- [x] Cada organización vinculada recibe el evento auditable
      `account.deleted`, sin copiar datos personales originales al evento.
- [x] Si quien elimina es colaborador, se suspenden sus membresías, reglas de
      comisión y asignaciones de servicios; el negocio del propietario continúa.
- [x] Si quien elimina es propietario, se cancelan su organización, suscripción,
      servicios y enlace público, y se revocan invitaciones pendientes.
- [x] El propietario debe retirar primero colaboradores activos, cerrar Caja y
      resolver citas futuras. Cada bloqueo devuelve un conflicto explícito y la
      cuenta permanece intacta.
- [x] Migración `20260801223000_user_account_deletion` aplicada en desarrollo y
      pruebas.

### Verificación de este corte

- [x] Typecheck de base de datos, validaciones, API y aplicación móvil.
- [x] ESLint de API, prueba de integración, validación y pantalla de Ajustes.
- [x] Build de API y exportación Web de Expo completados.
- [x] Prueba PostgreSQL específica: cierre de sesión, contraseña incorrecta,
      bloqueos por Caja y colaboradores, anonimización, cancelación del negocio
      e invalidación definitiva del token.
- [x] Suite móvil: 3 archivos y 5/5 pruebas aprobadas.
- [x] Las dos pruebas de liquidación calculan «hoy» en `America/Guayaquil` y ya
      no dependen del cambio de fecha UTC de las 19:00 en Ecuador. La suite
      completa de API/PostgreSQL aprobó 31/31 pruebas después del ajuste.

## Cierre de funcionalidades parcialmente implementadas — 3 de agosto de 2026

### Clientes

- [x] Se confirmó que edición, notas operativas y fotografías privadas ya están
      implementadas en Prisma, API y la ficha móvil autenticada.
- [x] Las fotografías permanecen dentro del recurso privado autenticado del
      cliente y no se publican mediante una URL abierta.

### Comisiones y concurrencia

- [x] Endpoint auditable `POST /v1/commissions/entries/:id/reverse` para crear
      un ajuste compensatorio sin eliminar la entrada original.
- [x] El reverso exige propietario o administrador, deriva la organización de
      la sesión, conserva el snapshot original y es idempotente bajo concurrencia.
- [x] Nava Wallet muestra entradas y reversos y solicita confirmación antes de
      registrar el ajuste.
- [x] Las creaciones y reprogramaciones de citas se serializan por profesional
      con un bloqueo transaccional PostgreSQL; la doble reserva concurrente
      devuelve de forma estable `409 APPOINTMENT_CONFLICT`.

### Reportes de movimientos

- [x] Historial paginado de gastos y ventas desde la pantalla de Reportes.
- [x] Filtros por período, sucursal y método de pago.
- [x] Ventas enriquecidas con cliente, servicio y profesional cuando existen.
- [x] Exportación CSV autenticada con protección por organización y alcance de
      sucursal.
- [x] Tipos contables auditables `DEPOSIT` y `OTHER_INCOME`, separados de
      `SALE`, disponibles para registro desde Caja.
- [x] Historial paginado de depósitos y otros ingresos con filtros por período,
      sucursal y método de pago, además de exportación CSV autenticada.
- [x] Depósitos y otros ingresos actualizan el efectivo esperado cuando el
      método es efectivo y alimentan `Otros ingresos` y el resultado neto del
      resumen del negocio.

### Notificaciones

- [x] Las notificaciones de reservas se persisten antes de intentar SMTP o Expo
      Push y conservan por canal su estado y número de intentos.
- [x] Reintentos automáticos con backoff y máximo de cinco intentos; el proceso
      se ejecuta cada minuto y evita ejecuciones simultáneas dentro de la instancia.
- [x] La confirmación, cancelación o reprogramación de una cita no se revierte
      si falla un proveedor externo.
- [x] Los recordatorios configurables y sus plantillas continúan procesándose
      mediante el ciclo de vida idempotente de reservas públicas.

### Verificación

- [x] Migraciones verificadas en desarrollo y `postgres-test`: 37 aplicadas,
      ninguna pendiente.
- [x] Suite API/PostgreSQL: 28/28 pruebas aprobadas, incluidas concurrencia de
      citas, concurrencia de reversos, autorización, auditoría, reportes y CSV.
- [x] Typecheck de API, móvil y cliente compartido; ESLint de los archivos
      modificados y bundle de API aprobados.
- [x] Suite móvil: 3 archivos y 5/5 pruebas aprobadas; exportación Expo Web
      completada.
- [ ] Los textos legales definitivos y el dominio público de producción
      requieren una decisión externa antes del despliegue.

## Inventario básico — 3 de agosto de 2026

### Modelo y reglas de stock

- [x] Catálogo de productos por organización con SKU, código de barras, costo,
      precio de venta, moneda, activación, control de stock y umbral mínimo.
- [x] Existencias independientes por sucursal y libro inmutable de movimientos
      `OPENING`, `PURCHASE`, `SALE`, `ADJUSTMENT`, `RETURN` y `LOSS`.
- [x] Altas, ediciones y ajustes limitados a propietario o administrador, con
      alcance por sucursal y eventos en `AuditLog`.
- [x] Ajustes y ventas se serializan mediante bloqueo transaccional PostgreSQL;
      no se admite inventario negativo ni sobreventa concurrente.
- [x] Migración `20260803220000_basic_inventory` aplicada en desarrollo y
      `postgres-test`; existen 38 migraciones y ninguna está pendiente.

### Caja, reportes y aplicación móvil

- [x] Caja permite elegir un producto y cantidad, calcula el importe desde el
      precio persistido y descuenta stock en la misma transacción que la venta.
- [x] La reversión conserva la venta original, la marca como revertida, repone
      las unidades, crea un movimiento `RETURN` y deja auditoría; solo se admite
      mientras la sesión de Caja siga abierta.
- [x] El resumen del negocio separa ventas de productos y omite ventas
      revertidas; el historial de ventas y su CSV incluyen el producto.
- [x] Nueva pantalla de Inventario con filtros por sucursal y stock bajo,
      creación y edición de productos, ajustes y consulta del historial.
- [x] La opción Alerta de inventario en Reportes abre directamente el catálogo
      filtrado por productos cuyo stock alcanzó o bajó del mínimo.

### Verificación

- [x] Esquema Prisma válido; typecheck de base de datos, cliente compartido,
      API y móvil, además de ESLint sobre los archivos modificados.
- [x] Suite API/PostgreSQL: 29/29 pruebas aprobadas, incluida una prueba de dos
      ventas concurrentes que confirma un solo descuento, bloqueo de sobreventa,
      alerta de stock bajo, separación en reportes y reposición por reversión.
- [ ] Las comisiones específicas sobre productos no forman parte de los
      criterios de aceptación de Fase 8 y permanecen como ampliación de la Fase 7.
- [ ] Validación visual final en dispositivo físico pendiente del cierre
      integral del MVP.

## Panel interno del SaaS — 3 de agosto de 2026

### Frontera segura de plataforma

- [x] Nuevas rutas `/v1/platform/*` protegidas por sesión opaca y una allowlist
      exclusiva del servidor. `PLATFORM_ADMIN_EMAILS` admite varios operadores
      y `ADMIN_EMAIL` funciona como bootstrap compatible con el entorno actual.
- [x] Una cuenta autenticada que no está en la allowlist recibe
      `403 PLATFORM_ADMIN_REQUIRED`; no basta con ser propietario de un negocio.
- [x] El operador autorizado debe superar una segunda verificación por correo:
      el OTP de seis dígitos se vincula a la sesión opaca, vence en cinco minutos,
      se consume una sola vez y no se devuelve nunca por HTTP.
- [x] Los códigos del panel se almacenan únicamente como hash; cinco intentos
      erróneos los invalidan y las rutas operativas devuelven
      `403 PLATFORM_ACCESS_CODE_REQUIRED` hasta confirmar el código.
- [x] Listado paginado con búsqueda y filtro por estado, plan, fin de trial y
      contadores de sucursales, equipo, servicios y citas.
- [x] Métricas de activación para servicio configurado, primera cita y primera
      atención, además de trials próximos a vencer y fallos de notificación.
- [x] Consulta de fallos por canal sin exponer cuerpo del mensaje, payload de
      entrega, contraseñas, tokens ni correo completo del propietario.

### Operación y soporte

- [x] Suspensión, reactivación y cambio de plan ejecutados transaccionalmente
      por backend, con motivo obligatorio y evento `platform.*` en `AuditLog`.
- [x] La suspensión activa el mismo modo de solo lectura de Fase 11 y la
      reactivación restaura las operaciones y un período de 30 días.
- [x] Diagnóstico de soporte limitado a contadores operativos y contacto
      enmascarado. Cada acceso exige motivo, queda auditado y no crea una sesión
      del negocio ni suplanta al propietario.
- [x] No existe acceso a contraseñas, `service_role`, cliente Prisma ni secretos
      desde el navegador; todas las capacidades viven detrás de la API.

### Consola administrativa

- [x] El placeholder de `apps/admin` fue reemplazado por una consola responsive
      con inicio de sesión propio. La sesión opaca se conserva únicamente durante
      la pestaña del navegador y se valida contra `/v1/platform/session` antes de
      habilitar el panel.
- [x] Tras la contraseña, el panel solicita y valida el OTP por correo, muestra
      su cuenta regresiva de cinco minutos, permite reemplazar un código vencido
      y revoca la sesión temporal si se cancela el acceso.
- [x] La consola reutiliza el lenguaje visual de Nava: fondo marfil, texto
      oscuro, controles redondeados, acciones azul marino, acentos dorados y
      sombras suaves consistentes con la aplicación móvil.
- [x] Resumen operativo con distribución de suscripciones, trials próximos a
      vencer, fallos de notificación y embudo de activación.
- [x] Directorio paginado de organizaciones con búsqueda, filtro por estado,
      plan, trial, propietario enmascarado y contadores de uso.
- [x] Suspensión, reactivación y cambio de plan disponibles desde la consola con
      motivo obligatorio, confirmación explícita y actualización de los datos.
- [x] Diagnóstico de soporte sin suplantación, fallos de notificación minimizados
      y bitácora de auditoría accesibles desde secciones independientes.
- [x] La interfaz no incorpora controles para contraseñas, tokens, payloads de
      entrega, acceso directo a Prisma ni secretos de servidor.

### Verificación

- [x] Migración `20260803235900_platform_admin_email_otp` aplicada en desarrollo
      y `postgres-test`: 40 migraciones, ninguna pendiente.
- [x] Suite API/PostgreSQL: 31/31 pruebas aprobadas. El caso de plataforma
      comprueba denegación a usuarios normales, minimización de datos, filtros,
      errores de notificación, cambio de plan, suspensión, bloqueo de escritura,
      soporte auditado, reactivación, OTP vencido, rechazo de código incorrecto,
      uso único y recuperación del acceso tras la verificación.
- [x] Esquema Prisma válido y typecheck de base de datos, API y aplicación
      administrativa aprobados.
- [x] Typecheck y ESLint de la consola aprobados; pruebas unitarias del cliente
      HTTP 4/4 y build optimizado de Next.js completados.

## Planes y límites — 3 de agosto de 2026

### Trial, capacidades y límites

- [x] Toda organización crea su suscripción `TRIAL` junto con el onboarding;
      la prueba dura 14 días y la gracia posterior siete días.
- [x] El ciclo de vida actualiza `TRIAL → PAST_DUE → SUSPENDED` al consultar o
      intentar una operación, sin depender de que la persona abra la pantalla.
- [x] Definiciones Esencial y Multi centralizadas en backend con límites,
      funciones descriptivas y `featureFlags` de máquina persistidos en `Plan`.
- [x] Esencial limita a una sucursal y Multi queda definido para cinco, pero se
      mantiene no disponible y visible como **Próximamente**.
- [x] Nuevo `POST /v1/locations` valida el límite dentro de la transacción; una
      llamada directa devuelve `409 PLAN_LIMIT_REACHED`, por lo que modificar
      la interfaz no permite eludir el plan.

### Modo lectura y simulación

- [x] Las suscripciones `SUSPENDED` o `CANCELLED` bloquean mutaciones
      operativas con `423 SUBSCRIPTION_READ_ONLY` desde una política central.
- [x] Consultas y exportaciones permanecen disponibles y no se eliminan datos.
      Cerrar una Caja ya abierta también se permite para conservar integridad.
- [x] `POST /v1/subscription/simulate`, disponible fuera de producción y solo
      para el propietario, permite suspender y reactivar con auditoría.
- [x] La reactivación restaura inmediatamente las operaciones sin recrear ni
      migrar información del negocio.
- [x] La pantalla `/subscription` muestra uso frente a límites, capacidades,
      estado de solo lectura y controles de simulación cuando corresponden.
- [x] No existe integración de cobro, tarjeta ni reutilización de las
      credenciales PayPhone del negocio.

### Verificación

- [x] Migración `20260803233000_subscription_feature_flags` aplicada en
      desarrollo y `postgres-test`: 39 migraciones, ninguna pendiente.
- [x] Suite API/PostgreSQL: 30/30 pruebas aprobadas; el caso de suscripción
      comprueba trial automático, límite directo, suspensión, lectura con datos
      conservados, bloqueo de escritura, auditoría y reactivación.
- [x] Esquema Prisma válido; typecheck de base de datos, API, cliente compartido
      y móvil; ESLint de los archivos modificados.
- [ ] El panel seguro para operadores de plataforma se implementará en Fase 12;
      la Fase 11 solo expone simulación no productiva al propietario.
- [ ] Validación visual final en dispositivo físico pendiente del cierre
      integral del MVP.

## Reportes esenciales — 3 de agosto de 2026

### Control operativo diario

- [x] Nuevo endpoint `GET /v1/reports/daily` con períodos Hoy, últimos 7 días,
      este mes, últimos 30 días y rangos personalizados de hasta 366 días.
- [x] El reporte consolida citas del período, atendidas, canceladas, no-show,
      citas pagadas, ventas cobradas, ticket promedio y cobros por método.
- [x] Desglose de ventas y comisiones por profesional, productos vendidos con
      unidades e ingreso, y cierres de Caja con esperado, contado y diferencia.
- [x] Las ventas revertidas y reservas expiradas o pendientes de verificación
      no alteran los indicadores operativos.
- [x] Filtro por sucursal con alcance de propietario o administrador; un
      profesional recibe `403` y no puede consultar datos globales.
- [x] Cada sucursal convierte su día local a UTC con su zona horaria antes de
      consultar; no se consolidan monedas diferentes sin elegir una sucursal.
- [x] Exportación CSV autenticada con citas, ventas, cobros, profesionales,
      comisiones, productos y cierres de Caja.

### Aplicación móvil

- [x] Nueva opción **Control diario** en Estadísticas e informes.
- [x] Pantalla con filtros de período y sucursal, indicadores de citas, ventas,
      métodos de cobro, profesionales, productos y cierre de Caja.
- [x] El CSV puede compartirse desde la pantalla mediante el diálogo nativo.

### Verificación

- [x] Suite API/PostgreSQL: 30/30 pruebas aprobadas.
- [x] Prueba específica con corte `America/Guayaquil`: un registro de las
      04:30 UTC queda fuera del 3 de agosto local, mientras los registros desde
      las 05:00 UTC se agregan correctamente.
- [x] La misma prueba valida totales, venta revertida, método de pago,
      profesional, comisión, producto, cierre de Caja, CSV y denegación al
      profesional.
- [x] Typecheck y ESLint de API, cliente compartido y aplicación móvil.
- [ ] Validación visual final en dispositivo físico pendiente del cierre
      integral del MVP.
