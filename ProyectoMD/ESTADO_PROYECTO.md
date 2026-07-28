# Estado del proyecto

Seguimiento basado en `INSTRUCCIONES_CODEX_BARBER_SAAS.md` y en la decisión posterior documentada en `docs/adr/0003-postgresql-prisma-y-api-en-vps.md`. Se marca `[x]` solo cuando la tarea está implementada y cuenta con la verificación indicada; `[ ]` significa pendiente o aún no demostrada.

Última actualización: 2026-07-28

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
- [ ] Fase 1 — Autenticación, organización y onboarding _(implementada y verificada localmente; autenticación SMTP aprobada, entrega a bandeja externa pendiente)_
- [x] Fase 2 — Equipo, servicios y horarios
- [ ] Fase 3 — Motor de agenda _(implementada y verificada contra PostgreSQL; flujo manual móvil pendiente)_
- [ ] Fase 4 — Reservas públicas
- [ ] Fase 5 — Clientes e historial _(directorio, creación e importación implementados; historial, edición y eliminación lógica pendientes)_
- [ ] Fase 6 — Caja y POS básico
- [ ] Fase 7 — Comisiones
- [ ] Fase 8 — Inventario básico
- [ ] Fase 9 — Notificaciones
- [ ] Fase 10 — Reportes esenciales
- [ ] Fase 11 — Planes y límites
- [ ] Fase 12 — Panel interno del SaaS
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
- [ ] Entrega del OTP pendiente de comprobar con el proveedor SMTP real.
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

- [ ] Reserva web pública, idempotencia, tokens de gestión y rate limiting.

### Fase 5 — Clientes e historial

- [x] Directorio autenticado, búsqueda, creación e importación de contactos.
- [x] Aislamiento por organización activa o, en su ausencia, por usuario propietario.
- [ ] Historial, edición, notas operativas, fotografías privadas y eliminación lógica.

### Fase 6 — Caja y POS básico

- [ ] Apertura, ventas, pagos, gastos, retiros, cierre y auditoría.

### Fase 7 — Comisiones

- [ ] Reglas, cálculo backend, snapshots, liquidaciones y reversión.

### Fase 8 — Inventario básico

- [ ] Productos, stock por sucursal, movimientos, ajustes y alertas.

### Fase 9 — Notificaciones

- [ ] Plantillas, cola, proveedores mock/console, reintentos y recordatorios.

### Fase 10 — Reportes esenciales

- [ ] Reportes diarios, filtros, permisos, zona horaria y CSV.

### Fase 11 — Planes y límites

- [ ] Trial, planes, límites backend, feature flags y suspensión simulada.

### Fase 12 — Panel interno del SaaS

- [ ] Operación de organizaciones, planes, uso, errores y soporte seguro.

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

- [x] Nueva pantalla protegida `/clients` con el lenguaje visual del dashboard y la referencia de `nava-new-booking-client.png`.
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

- [ ] Edicion y eliminacion logica de clientes.
- [ ] Historial de citas por cliente.
- [ ] Notas operativas y fotografias privadas.
- [ ] Importacion masiva con pantalla previa de seleccion, confirmacion y reporte individual de conflictos.
- [ ] Vincular un cliente persistido con la creacion real de una nueva reserva.

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
- [x] La pantalla muestra perfil del negocio, accesos de aprendizaje y soporte, Mi negocio, promociones, SuperLink, cierre de sesion, borrado de cuenta y version instalada.
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
