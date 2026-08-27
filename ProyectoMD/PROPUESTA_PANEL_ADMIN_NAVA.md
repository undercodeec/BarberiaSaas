# Despliegue del panel Admin de Nava

> Estado: desplegado y validado el 21 de agosto de 2026 en
> `https://admin.navacloud.app`.

## Registro de ejecución

- Commit desplegado: `0ead479`.
- Base Neon: 58 migraciones aplicadas; la última fue
  `20260821100000_subscription_billing_period_days`.
- Servicio: `nava-admin.service` activo y atendiendo localmente en el puerto
  `3001`.
- Publicación: Nginx y Certbot entregan `https://admin.navacloud.app` con
  respuesta `HTTP/2 200`.
- Acceso: bootstrap protegido con contraseña derivada mediante scrypt y OTP por
  correo. `PLATFORM_ADMIN_PASSWORD_HASH` debe comenzar por
  `scrypt$32768$8$1$`; no admite hashes bcrypt ni se pega en el formulario.

La plantilla systemd inicia el binario local de Next directamente. Así conserva
`ProtectHome=true` sin depender de la caché de Corepack/pnpm en `/home/nava`.

## Requisitos

- DNS y TLS para el dominio elegido, por ejemplo `admin.navacloud.app`.
- API y migraciones actualizadas, incluida `20260820190000_platform_operations_center`.
- `PLATFORM_ADMIN_EMAILS`, `PLATFORM_ADMIN_PASSWORD_HASH` y SMTP configurados en la API.
- `NEXT_PUBLIC_API_URL` con la URL pública HTTPS de la API durante el build del Admin.

Genere el hash bootstrap en una terminal interactiva y copie únicamente la salida
en el gestor de secretos:

```bash
pnpm --filter @barber-saas/api password:hash
```

El comando no muestra ni guarda la contraseña y genera el formato
`scrypt$32768$8$1$` exigido en producción.

## Preparación

Desde `/opt/nava/app`, después de revisar el commit que se va a publicar:

```bash
git pull --ff-only origin main
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate:deploy
pnpm db:status
NEXT_PUBLIC_API_URL=https://api.navacloud.app pnpm --filter @barber-saas/admin build
```

No usar `prisma migrate dev` ni modificar manualmente la base productiva.

## Servicio

1. Copiar `deploy/systemd/nava-admin.service.example` a `/etc/systemd/system/nava-admin.service`.
2. Verificar que `/usr/bin/node` y
   `apps/admin/node_modules/next/dist/bin/next` existan.
3. Ejecutar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nava-admin.service
sudo systemctl status nava-admin.service --no-pager
curl -fsS http://127.0.0.1:3001/ >/dev/null
```

## Nginx y TLS

Usar `deploy/nginx/nava-admin.conf.example` como base, instalarlo en el directorio de sitios de Nginx, validar con `nginx -t` y recargar. Las rutas de certificado del ejemplo deben existir antes de activar el sitio. En la VPS se emitió el certificado de `admin.navacloud.app` con Certbot; su renovación quedó programada automáticamente.

## Aceptación obligatoria

- Login con operador bootstrap y segundo factor OTP.
- Alta de un operador de soporte, acceso con su contraseña individual y verificación de que no puede suspender ni cambiar planes.
- Ficha 360° sin correo completo del propietario ni secretos PayPhone.
- Creación/seguimiento de incidencia, reconocimiento de alerta y reintento de notificación.
- Exportación CSV de auditoría y aparición de `platform.export.downloaded` en la bitácora.
- Revisión responsive y Axe en escritorio/móvil.
- Revisión de logs de API/Admin sin contraseñas, OTP, tokens ni secretos.

El despliegue quedó completado con URL, commit, migraciones, servicio y HTTPS
verificados. La aceptación funcional restante se limita a las comprobaciones de
roles, PII y flujos operativos enumeradas arriba cuando se incorporen operadores
adicionales.

---

# Continuación de construcción — Nava Super Admin

> Este bloque define el trabajo siguiente sobre el panel administrativo interno
> de Nava.
>
> Debe utilizarse como contexto e instrucción de trabajo para Codex antes de
> modificar `apps/admin`, `apps/api`, Prisma o cualquier paquete compartido.
>
> El objetivo no es reconstruir el panel existente, sino continuar desde el
> estado actual y convertir `Nava Control Center` en una consola Super Admin
> completa para administrar la plataforma SaaS.

## Regla principal para Codex

Antes de implementar cualquier funcionalidad:

1. Leer completamente:

   - `ESTADO_PROYECTO.md`
   - `DESPLIEGUE_PANEL_ADMIN.md`
   - `packages/database/prisma/schema.prisma`
   - rutas existentes de `apps/api`
   - estructura actual de `apps/admin`
   - paquetes compartidos de autenticación, permisos, validación y cliente HTTP.

2. Inspeccionar primero qué funcionalidades ya existen.

3. No duplicar:

   - modelos;
   - endpoints;
   - componentes;
   - permisos;
   - tipos;
   - validadores;
   - servicios;
   - eventos de auditoría.

4. Reutilizar la arquitectura y convenciones existentes.

5. No asumir que una función documentada como pendiente está necesariamente
   ausente. Confirmarlo en el código antes de crearla.

6. Si el código actual contiene una implementación parcial, completarla en lugar
   de reemplazarla innecesariamente.

7. Mantener:

   - TypeScript estricto;
   - Prisma;
   - PostgreSQL;
   - Fastify;
   - Next.js;
   - API propia como única frontera de datos;
   - aislamiento multi-tenant;
   - sesiones existentes;
   - OTP administrativo;
   - esquema actual de auditoría;
   - diseño visual existente de `Nava Control Center`.

8. No introducir Supabase Auth, Firebase Auth u otro proveedor de autenticación.

9. No modificar directamente datos productivos.

10. Toda modificación de esquema debe realizarse mediante una nueva migración
    Prisma.

11. No ejecutar `prisma migrate dev` contra producción.

12. No desplegar automáticamente a producción como parte de estas tareas.

---

# Objetivo funcional

El panel actualmente administra principalmente:

- organizaciones;
- planes;
- trial;
- uso;
- suspensión/reactivación;
- operadores administrativos;
- incidencias;
- alertas;
- notificaciones;
- soporte;
- auditoría.

El siguiente objetivo es agregar una verdadera capa de administración de
plataforma que permita gestionar:

1. usuarios Nava;
2. relación usuarios ↔ organizaciones;
3. seguridad y sesiones;
4. operadores Super Admin;
5. observabilidad;
6. suscripciones y facturación;
7. auditoría avanzada;
8. configuración operativa de plataforma.

La prioridad inmediata es **Usuarios Nava**.

## Registro de avance — 23 de agosto de 2026

La primera entrega de la prioridad P0 está implementada localmente y pendiente
de aplicar en producción junto con su migración:

- se añadió la navegación **Usuarios** y un listado global paginado;
- la búsqueda por nombre, correo, teléfono o ID y los filtros de estado y
  verificación se ejecutan en backend;
- el listado y la ficha exponen únicamente correo, teléfono y nombre
  enmascarados;
- la ficha consulta Memberships, sesiones activas, dispositivos push y casos
  de soporte relacionados sin exponer tokens ni secretos;
- `suspend`, `reactivate`, `revoke_sessions` y
  `request_password_recovery` están protegidas por RBAC de backend, requieren
  motivo y generan auditoría;
- la suspensión se persiste en `User.suspendedAt`, revoca las sesiones activas
  e impide el login y la autenticación de la cuenta;
- se creó la migración
  `20260823160000_platform_user_administration`.

La entrega no completa todavía SA-1 a SA-7: faltan la navegación explícita
Usuario→Organización, la administración segura de Memberships, pruebas de
integración PostgreSQL y revisión visual responsive autenticada. Por ello SRI
continúa fuera de alcance hasta terminar el panel conforme a los criterios de
aceptación de este documento.

---

# Fase SA-1 — Gestión global de usuarios Nava

## Objetivo

Crear una sección de administración global de las cuentas que tienen acceso
autenticado a Nava.

No confundir:

- `User`: cuenta de acceso a Nava.
- `Membership`: relación del usuario con una organización.
- `Client`: cliente de una barbería.

El Super Admin debe trabajar principalmente con `User` y `Membership`.

## Navegación

Agregar una entrada principal:

```text
Dashboard
Organizaciones
Usuarios
Operadores
Incidencias
Auditoría
Sistema
```

Adaptar la navegación a la estructura actual si los nombres existentes son
diferentes.

No duplicar entradas existentes.

---

## Página `/users`

Crear una vista global paginada y segura.

Debe permitir visualizar como mínimo:

- nombre;
- email enmascarado;
- teléfono enmascarado;
- estado de cuenta;
- estado de verificación;
- fecha de registro;
- último acceso si existe información fiable;
- número de organizaciones asociadas;
- roles principales;
- estado de seguridad relevante;
- cantidad de sesiones activas si el modelo actual permite obtenerla.

### Búsqueda

Permitir búsqueda por:

- nombre;
- email;
- teléfono;
- identificador interno.

La búsqueda debe resolverse en backend.

No descargar todos los usuarios y filtrar únicamente en frontend.

### Filtros

Implementar cuando los datos existentes lo permitan:

- activo;
- suspendido;
- eliminado/baja lógica;
- verificado/no verificado;
- rol;
- organización;
- fecha de registro.

Los filtros deben poder combinarse.

### Paginación

Debe ser real en backend.

No consultar el universo completo de usuarios para posteriormente paginar en
cliente.

---

# Fase SA-2 — Ficha 360° de usuario

Crear una vista:

```text
/users/:userId
```

La ficha debe centralizar la información necesaria para soporte y administración
sin exponer secretos.

## Secciones

### Resumen

Mostrar:

- identificador;
- nombre;
- estado;
- fecha de registro;
- última actividad disponible;
- número de organizaciones;
- número de sesiones;
- estado de verificación.

### Cuenta

Mostrar información administrativa sobre:

- correo;
- teléfono;
- verificación;
- estado de cuenta;
- fecha de creación;
- fecha de actualización;
- baja lógica si existe.

Los datos sensibles deben seguir las reglas de enmascaramiento del panel.

No mostrar más PII de la estrictamente necesaria.

### Organizaciones

Mostrar todos los `Membership` asociados al usuario.

Por cada organización:

- nombre;
- ID;
- rol;
- estado del Membership;
- sede/al alcance si aplica;
- fecha de asociación.

Debe existir navegación:

```text
Usuario → Organización
```

y desde la ficha de organización:

```text
Organización → Usuario
```

---

# Fase SA-3 — Acciones administrativas de usuario

Implementar exclusivamente acciones seguras y auditadas.

## Suspender cuenta

Permitir al rol autorizado suspender el acceso de un usuario.

Antes de ejecutar:

- mostrar confirmación;
- exigir motivo;
- identificar consecuencias.

Registrar auditoría.

Evento recomendado:

```text
platform.user.suspended
```

La suspensión debe actuar en backend.

No implementar una suspensión únicamente visual en Admin.

---

## Reactivar cuenta

Permitir reactivar una cuenta suspendida.

Exigir motivo.

Registrar:

```text
platform.user.reactivated
```

---

## Revocar sesiones

Agregar:

```text
Revocar todas las sesiones
```

Debe invalidar sesiones existentes de forma efectiva.

Confirmar la acción antes de ejecutarla.

Registrar:

```text
platform.user.sessions_revoked
```

No mostrar tokens de sesión.

No devolver hashes de tokens al Admin.

---

## Recuperación de contraseña

El Super Admin NO debe:

- conocer la contraseña;
- visualizar la contraseña;
- escribir directamente una contraseña nueva;
- recibir hashes de contraseña.

Debe existir una acción:

```text
Enviar recuperación de contraseña
```

que reutilice el flujo seguro existente.

Registrar:

```text
platform.user.password_recovery_requested
```

No registrar el token generado.

---

## Reenviar verificación

Si la arquitectura vigente lo permite de forma segura, incorporar una acción
para reenviar el proceso de verificación correspondiente.

No exponer OTP.

No mostrar códigos OTP dentro del panel.

---

# Fase SA-4 — Memberships

## Objetivo

Permitir comprender y administrar la relación entre una cuenta Nava y las
organizaciones a las que pertenece.

La UI debe mostrar claramente:

```text
Usuario
 ├── Organización A — owner
 ├── Organización B — manager
 └── Organización C — barber
```

## Operaciones

Evaluar e implementar, únicamente si son coherentes con las reglas actuales:

- visualizar Membership;
- cambiar rol;
- desactivar Membership;
- reactivar Membership;
- retirar al usuario de una organización.

Todas las acciones deben respetar invariantes existentes.

No introducir una vía administrativa que permita:

- dejar una organización activa sin propietario válido;
- romper el onboarding;
- violar restricciones de roles;
- saltarse reglas multi-tenant.

---

# Fase SA-5 — Transferencia de propietario

Analizar la arquitectura existente antes de implementar.

Si actualmente `owner` depende de un `Membership`, crear un flujo explícito para:

```text
Transferir propiedad de organización
```

Requisitos:

1. solo Super Admin autorizado;
2. propietario destino válido;
3. confirmación explícita;
4. motivo obligatorio;
5. transacción de base de datos;
6. auditoría;
7. evitar organización sin owner;
8. impedir transferencias a usuarios inválidos/suspendidos.

Evento recomendado:

```text
platform.organization.owner_transferred
```

No implementar hasta confirmar las invariantes exactas actuales.

---

# Fase SA-6 — Baja administrativa

Diferenciar claramente:

```text
Suspensión
```

de:

```text
Eliminación / cierre de cuenta
```

No realizar `DELETE` físico salvo que el diseño actual lo exija expresamente.

Reutilizar la baja lógica y reglas existentes de cierre de cuenta.

Una operación destructiva debe mostrar antes:

- cuenta afectada;
- organizaciones;
- Memberships;
- posibles consecuencias;
- motivo;
- confirmación adicional.

Registrar auditoría.

---

# Fase SA-7 — Seguridad de usuario

Agregar en la ficha 360°, si existen datos fiables:

## Sesiones

Mostrar:

- cantidad;
- creación;
- última actividad;
- dispositivo aproximado si actualmente se registra;
- estado.

No introducir fingerprinting invasivo exclusivamente para esta pantalla.

No mostrar:

- token;
- token hash;
- refresh token;
- secretos.

## Dispositivos / FCM

Si existen registros de dispositivos relacionados con el usuario, permitir
visualizar metadatos operativos mínimos.

Nunca mostrar el token FCM completo.

Utilizar enmascaramiento o simplemente indicar:

```text
Dispositivo registrado
Push activo
Última actualización
```

---

# Fase SA-8 — Gestión de operadores del Super Admin

Revisar primero la implementación actual de operadores.

No sustituir el modelo existente si ya resuelve las necesidades.

Formalizar la separación entre:

```text
Super Admin
Operations Admin
Support
Auditor
```

Los nombres definitivos deben adaptarse a los roles realmente existentes en el
repositorio.

## Matriz esperada

### Super Admin

Puede:

- administrar operadores;
- gestionar usuarios;
- gestionar organizaciones;
- suspender/reactivar;
- cambiar planes;
- realizar acciones sensibles;
- acceder a auditoría;
- acceder a diagnóstico.

### Operations Admin

Puede administrar operación general pero no necesariamente:

- operadores Super Admin;
- configuración crítica;
- secretos;
- cambios de máxima sensibilidad.

### Support

Debe poder:

- consultar usuarios;
- consultar organizaciones;
- abrir incidencias;
- revisar diagnóstico;
- reintentar acciones operativas permitidas.

No debe:

- suspender organización si la política actual lo impide;
- cambiar plan;
- realizar transferencias de propiedad;
- administrar operadores;
- visualizar secretos.

### Auditor

Solo lectura.

Debe poder consultar auditoría y estado operacional sin capacidad de mutación.

---

# Fase SA-9 — Auditoría administrativa

Toda acción sensible nueva debe registrarse.

No crear una segunda bitácora si ya existe un sistema de auditoría central.

Reutilizar el servicio/modelo/eventos existentes.

Como mínimo contemplar:

```text
platform.user.viewed
platform.user.suspended
platform.user.reactivated
platform.user.sessions_revoked
platform.user.password_recovery_requested
platform.user.membership_changed
platform.organization.owner_transferred
platform.operator.created
platform.operator.updated
platform.operator.disabled
```

No es obligatorio registrar `platform.user.viewed` si generaría ruido excesivo;
evaluar primero la convención actual del proyecto.

Para mutaciones registrar cuando sea compatible con el modelo:

- operador;
- acción;
- recurso;
- resourceId;
- timestamp;
- resultado;
- motivo;
- metadatos estrictamente necesarios.

Nunca guardar en auditoría:

- contraseñas;
- hashes de contraseña;
- OTP;
- tokens;
- PayPhone secrets;
- credenciales SMTP;
- claves FCM;
- `DATABASE_URL`;
- otros secretos.

---

# Fase SA-10 — Mejorar ficha 360° de organización

Revisar primero la ficha actualmente implementada.

Agregar únicamente lo que falte.

La ficha debería permitir consultar:

## Identidad

- ID;
- nombre;
- fecha de creación;
- estado.

## Propiedad

- owner actual;
- enlace a ficha del usuario.

## Equipo

- cantidad de Members;
- roles;
- usuarios relacionados.

## Sedes

- cantidad;
- estado.

## Suscripción

- plan;
- estado;
- trial;
- fecha de inicio;
- fecha de expiración;
- periodo;
- límites.

## Uso

Según métricas disponibles:

- profesionales;
- clientes;
- reservas;
- sedes;
- otros límites del plan.

## Operación

Información resumida de:

- agenda;
- Caja;
- inventario;
- pedidos;
- notificaciones.

Evitar convertir la ficha Super Admin en una réplica completa de la aplicación
de la barbería.

Debe ser una herramienta de operación y diagnóstico.

---

# Fase SA-11 — Billing y suscripciones

## Avance local — 26 de agosto de 2026

Se implementó una primera sección global de **Suscripciones**, restringida a
los roles Billing y Super Admin. Obtiene de la API la suscripción vigente, la
última factura, el último intento de pago y hasta tres cambios recientes por
organización, con filtros backend. No expone URLs, referencias de proveedor ni
secretos, y no genera cobros simulados. La vista sigue pendiente de despliegue
y del historial transaccional íntegro por organización.

No implementar un sistema de pagos nuevo hasta revisar el estado real de la
integración de suscripciones Nava.

Preparar la arquitectura del Admin para soportar una sección:

```text
Suscripciones
```

Cuando existan datos fiables, mostrar:

- organización;
- plan;
- estado;
- inicio;
- trial;
- periodo;
- próxima renovación;
- proveedor;
- último pago;
- estado del último pago;
- historial.

Separar:

```text
Plan configurado
```

de:

```text
Suscripción cobrada
```

Nunca inferir que una organización pagó únicamente porque tiene asignado un
plan.

## Acciones administrativas posibles

Evaluar:

- cambiar plan;
- extender trial;
- conceder días;
- suspender;
- reactivar;
- cancelar renovación;
- registrar ajuste administrativo.

Toda modificación debe quedar auditada.

No implementar cobros simulados como si fueran pagos reales.

---

# Fase SA-12 — Sistema y observabilidad

Agregar una sección:

```text
Sistema
```

El objetivo es diagnóstico, no administración directa del servidor.

Mostrar estado cuando exista una fuente real para determinarlo.

Posibles bloques:

```text
API
Admin
Base de datos
SMTP
FCM
PayPhone
Cola de notificaciones
Web pública
```

No mostrar `Healthy` de forma ficticia.

Un servicio solo debe aparecer saludable si existe una comprobación real.

## Métricas operativas

Añadir progresivamente:

- errores recientes;
- notificaciones fallidas;
- reintentos agotados;
- tamaño de colas;
- pagos fallidos cuando exista billing real;
- pedidos expirados;
- incidencias abiertas;
- reservas recientes;
- usuarios registrados;
- organizaciones activas;
- trials próximos a vencer.

No convertir consultas costosas en peticiones ejecutadas constantemente.

Diseñar agregaciones eficientes.

---

# Fase SA-13 — Dashboard ejecutivo del Super Admin

Revisar las métricas actuales y complementar solo lo necesario.

El dashboard principal debería responder rápidamente:

```text
¿Cuántas organizaciones tengo?
¿Cuántos usuarios tengo?
¿Cuántos están activos?
¿Cuántos trials están activos?
¿Cuántos trials vencen pronto?
¿Cuántas organizaciones están suspendidas?
¿Cuántas incidencias requieren atención?
¿Existen errores operativos relevantes?
```

Cuando exista billing real:

```text
¿Cuántas suscripciones están activas?
¿Cuántos pagos fallaron?
¿Cuánto MRR existe?
¿Cuántas cancelaciones ocurrieron?
```

No mostrar métricas financieras inventadas antes de disponer de una fuente
transaccional real.

---

# Fase SA-14 — Incidencias y soporte

Mantener el sistema actual de incidencias.

Mejorar su integración con usuarios y organizaciones.

Desde una incidencia debería poder navegar a:

```text
Incidencia → Usuario
Incidencia → Organización
```

Desde una ficha de usuario:

```text
Usuario → Incidencias relacionadas
```

Desde organización:

```text
Organización → Incidencias relacionadas
```

No introducir suplantación de usuario para resolver soporte.

La política actual de diagnóstico sin impersonation debe conservarse.

---

# Fase SA-15 — Protección de PII

Mantener la filosofía actual de mínima exposición.

En listados globales utilizar enmascaramiento.

Ejemplos:

```text
ch***@gmail.com
+593 9** *** 421
```

Una vista detallada puede ampliar información únicamente cuando sea necesario y
el rol tenga permiso.

Nunca mostrar en UI:

- contraseña;
- hash de contraseña;
- OTP;
- session token;
- refresh token;
- API secrets;
- PayPhone secrets;
- claves SMTP;
- claves FCM;
- claves de cifrado.

Tampoco registrar estos valores en logs del navegador o servidor.

---

# Fase SA-16 — Acciones peligrosas

Crear un patrón uniforme para acciones sensibles.

Ejemplos:

```text
Suspender usuario
Suspender organización
Transferir owner
Revocar sesiones
Eliminar cuenta
Deshabilitar operador
```

Requisitos:

1. modal de confirmación;
2. descripción del impacto;
3. motivo obligatorio cuando corresponda;
4. botón claramente identificado;
5. protección backend;
6. autorización backend;
7. auditoría;
8. feedback final al operador.

No confiar en ocultar botones como mecanismo de autorización.

---

# Fase SA-17 — API Super Admin

No acceder a Prisma directamente desde `apps/admin`.

Mantener:

```text
Admin
  ↓
API Nava
  ↓
Prisma
  ↓
PostgreSQL
```

Las nuevas operaciones administrativas deben pasar por endpoints de API.

Separar claramente rutas internas de plataforma de:

- rutas públicas;
- rutas de barbería;
- rutas de reservas;
- rutas de clientes.

Reutilizar el sistema actual de autorización administrativa.

Antes de crear rutas nuevas, buscar las existentes.

---

# Fase SA-18 — Consultas y rendimiento

Los endpoints globales pueden trabajar sobre todo el SaaS y por ello requieren
más cuidado.

Obligatorio:

- paginación;
- límites máximos;
- filtros backend;
- índices cuando estén justificados;
- seleccionar solo campos necesarios;
- evitar N+1;
- evitar devolver relaciones completas innecesariamente.

Revisar `EXPLAIN` o comportamiento equivalente cuando una consulta nueva pueda
crecer significativamente.

No optimizar prematuramente consultas pequeñas, pero tampoco crear endpoints que
carguen toda la plataforma.

---

# Fase SA-19 — Estados vacíos, carga y errores

Cada nueva pantalla del Admin debe contemplar:

```text
loading
empty
error
success
permission denied
```

No dejar una página en blanco ante errores de API.

Mantener el diseño responsive actual.

No degradar la experiencia móvil aunque el uso principal sea escritorio.

---

# Fase SA-20 — Pruebas

Cada funcionalidad nueva debe tener evidencia proporcional al riesgo.

## API

Agregar pruebas para:

- autorización;
- roles;
- paginación;
- búsqueda;
- filtros;
- suspensión;
- reactivación;
- revocación de sesiones;
- Membership;
- auditoría.

## Multi-tenant

Aunque el Super Admin tenga alcance global, verificar que los endpoints normales
de usuarios/organizaciones continúen aislados por tenant.

Una ruta Super Admin no debe convertirse accidentalmente en una vía de acceso
global para usuarios normales.

## Admin

Agregar pruebas de componentes/lógica cuando corresponda.

## E2E

Agregar como mínimo un recorrido Super Admin:

```text
Login
→ OTP
→ Usuarios
→ búsqueda
→ ficha 360°
→ organización asociada
→ auditoría
```

Y un recorrido de permisos:

```text
Login Support
→ consultar usuario
→ intentar acción restringida
→ operación rechazada
```

La protección debe verificarse también contra la API, no solamente mediante
botones ocultos.

---

# Fase SA-21 — Criterios de aceptación de Usuarios

No marcar `Usuarios` como completado hasta verificar:

- [ ] Existe listado global.
- [ ] Existe búsqueda backend.
- [ ] Existe paginación backend.
- [ ] Existen filtros principales.
- [ ] Email/teléfono se muestran según política de PII.
- [ ] Existe ficha 360°.
- [ ] Se visualizan Memberships.
- [ ] Se puede navegar entre usuario y organización.
- [ ] Suspensión funciona realmente.
- [ ] Reactivación funciona realmente.
- [ ] Revocación de sesiones funciona realmente.
- [ ] Recuperación utiliza el flujo seguro existente.
- [ ] No se muestra contraseña.
- [ ] No se muestra hash de contraseña.
- [ ] No se muestran OTP.
- [ ] No se muestran tokens.
- [ ] Acciones sensibles requieren permiso backend.
- [ ] Acciones sensibles quedan auditadas.
- [ ] Support no puede ejecutar operaciones reservadas.
- [ ] Super Admin sí puede ejecutar las operaciones correspondientes.
- [ ] No existen errores TypeScript nuevos.
- [ ] Pruebas relevantes pasan.
- [ ] Vista responsive validada.

---

# Fase SA-22 — Criterio de aceptación general del Super Admin

Antes de considerar el panel administrativo terminado para producción debe
existir cobertura operacional de:

- [ ] Dashboard.
- [ ] Organizaciones.
- [ ] Usuarios.
- [ ] Memberships.
- [ ] Operadores.
- [ ] Planes.
- [ ] Trials.
- [ ] Incidencias.
- [ ] Alertas.
- [ ] Auditoría.
- [ ] Sistema/diagnóstico.
- [ ] Sesiones.
- [ ] Seguridad.
- [ ] PII.
- [ ] RBAC administrativo.
- [ ] E2E crítico.
- [ ] Responsive.
- [ ] Accesibilidad.
- [ ] Logs sin secretos.

Billing se considerará completo únicamente cuando exista el ciclo transaccional
real de suscripciones Nava.

---

# Orden recomendado de implementación

Codex debe avanzar en este orden salvo que el análisis del código revele una
dependencia técnica diferente.

## P0 — Super Admin necesario para el piloto

1. Analizar modelos actuales `User`, `Membership`, `Organization`, sesiones y
   operadores.
2. Implementar API global paginada de usuarios.
3. Implementar `/users`.
4. Implementar ficha 360°.
5. Integrar Memberships.
6. Implementar suspensión/reactivación.
7. Implementar revocación de sesiones.
8. Integrar recuperación segura.
9. Añadir auditoría.
10. Aplicar RBAC.
11. Agregar pruebas.
12. Validar responsive y seguridad.

## P1 — Operación de plataforma

1. Mejorar ficha 360° de organización.
2. Formalizar operadores y permisos.
3. Integrar incidencias con usuarios.
4. Crear sección Sistema.
5. Mejorar observabilidad.
6. Mejorar dashboard ejecutivo.

## P2 — Escalabilidad comercial

1. Billing.
2. Historial completo de suscripciones.
3. Renovaciones.
4. Fallos de pago.
5. Métricas financieras.
6. Automatización operativa adicional.

---

# Forma de trabajo obligatoria para Codex

No realizar todo el backlog en un único cambio gigante.

Trabajar por bloques pequeños y verificables.

Para cada bloque:

1. inspeccionar implementación existente;
2. describir brevemente qué ya existe;
3. identificar archivos que serán modificados;
4. implementar;
5. ejecutar typecheck;
6. ejecutar pruebas relacionadas;
7. ejecutar lint solo sobre archivos/paquetes pertinentes cuando el lint global
   continúe teniendo deuda conocida;
8. revisar `git diff`;
9. verificar que no aparezcan secretos;
10. actualizar documentación;
11. reportar exactamente qué quedó terminado y qué sigue pendiente.

No afirmar que algo funciona únicamente porque compila.

Cuando una función cambie datos:

- verificar backend;
- verificar autorización;
- verificar persistencia;
- verificar auditoría;
- verificar UI.

---

# Restricciones

No hacer durante estas fases:

- impersonation/suplantación de usuarios;
- visualizar contraseñas;
- visualizar OTP;
- visualizar tokens;
- exponer secretos PayPhone;
- editar Neon manualmente;
- eliminar restricciones multi-tenant;
- confiar en permisos frontend;
- crear APIs administrativas públicas;
- introducir datos ficticios en métricas productivas;
- introducir pagos simulados como billing real;
- sustituir arquitectura existente sin necesidad;
- eliminar auditoría existente;
- desplegar automáticamente a producción.

---

# Resultado esperado

Al terminar estas fases, `Nava Control Center` debe permitir que un Super Admin
pueda responder desde una sola consola:

```text
¿Quién es este usuario?
¿A qué organizaciones pertenece?
¿Qué rol tiene?
¿Su cuenta está activa?
¿Puede iniciar sesión?
¿Hay que revocar sus sesiones?
¿Su organización está activa?
¿Qué plan utiliza?
¿Cuándo termina su trial?
¿Qué límites está consumiendo?
¿Tiene incidencias?
¿Hay errores relacionados?
¿Qué acciones administrativas se realizaron?
¿Quién realizó esas acciones?
¿El sistema presenta problemas operativos?
```

Todo ello sin:

- acceder directamente a la base de datos;
- conocer contraseñas;
- conocer OTP;
- conocer tokens;
- revelar secretos;
- romper el aislamiento multi-tenant;
- utilizar impersonation.

---

# Instrucción inmediata para retomar el desarrollo

Codex:

Comienza revisando el estado actual real del repositorio y compara esta
especificación con la implementación existente.

No programes todavía basándote únicamente en este documento.

Primero inspecciona:

```text
apps/admin
apps/api
packages/database/prisma/schema.prisma
packages/*
tests/*
```

Localiza específicamente:

```text
User
Membership
Organization
Session
Platform Admin
Operator
Audit
Incident
Notification
Subscription
```

Después genera un breve diagnóstico indicando:

1. qué partes del Super Admin ya existen;
2. cuáles existen parcialmente;
3. cuáles faltan;
4. qué modelos actuales se reutilizarán;
5. si hace falta alguna migración;
6. qué endpoints nuevos serían necesarios;
7. qué pantallas/componentes se modificarían;
8. qué pruebas deberían agregarse.

Tras ese análisis, comienza directamente con **Fase SA-1 — Gestión global de
usuarios Nava**, reutilizando la arquitectura actual y evitando cambios que no
sean necesarios.

No reconstruyas el panel.

Continúa desde el estado actual.
