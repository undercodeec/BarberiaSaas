# Estado del proyecto

Seguimiento basado en `INSTRUCCIONES_CODEX_BARBER_SAAS.md` y en la decisión posterior documentada en `docs/adr/0003-postgresql-prisma-y-api-en-vps.md`. Se marca `[x]` solo cuando la tarea está implementada y cuenta con la verificación indicada; `[ ]` significa pendiente o aún no demostrada.

Última actualización: 2026-07-25

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
- [ ] Fase 5 — Clientes e historial
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

- [ ] Clientes, búsqueda, historial, notas, fotografías privadas y eliminación lógica.

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

## Siguiente tarea recomendada

- [ ] Verificar la entrega del proveedor SMTP y ejecutar el flujo móvil completo: crear perfil, recibir email, registrarse, aceptar y operar. Después, iniciar la Fase 4 — Reservas públicas.
