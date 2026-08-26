# Prompt para Codex — corregir definitivamente autenticación Admin y CLI de operadores

Necesito corregir definitivamente el problema de autenticación del panel Admin de Nava que acabamos de diagnosticar en producción.

## Contexto confirmado

El problema ya fue resuelto manualmente en la VPS y conocemos la causa raíz.

El usuario administrador:

* existe en `users`;
* tiene correo verificado;
* no está suspendido;
* no está eliminado;
* tiene contraseña Mobile en `users.password_hash`;
* tiene un `PlatformOperator`;
* el `PlatformOperator` está activo;
* pero inicialmente tenía `platform_operators.admin_password_hash = NULL`.

El endpoint:

```text
POST /v1/platform/login
```

utiliza actualmente esta lógica:

```ts
const authorized = user?.platformOperator
  ? user.platformOperator.isActive
  : configuredPlatformEmails(config).has(email);

const passwordHash = user?.platformOperator
  ? user.platformOperator.adminPasswordHash
  : config.PLATFORM_ADMIN_PASSWORD_HASH;
```

Esto provocaba que, al existir `platformOperator`, el sistema dejara de utilizar completamente:

```text
PLATFORM_ADMIN_EMAILS
PLATFORM_ADMIN_PASSWORD_HASH
```

aunque el operador todavía no tuviera contraseña administrativa.

Por tanto:

```text
PlatformOperator existe
        ↓
adminPasswordHash = NULL
        ↓
passwordHash = NULL
        ↓
!passwordHash
        ↓
401 INVALID_PLATFORM_CREDENTIALS
```

Cambiar `PLATFORM_ADMIN_PASSWORD_HASH` no podía solucionar ese caso.

---

# SEGUNDO PROBLEMA CONFIRMADO — CLI

El comando:

```text
platform:operator:password
```

tiene actualmente algo equivalente a:

```ts
const email = process.argv[2]?.trim().toLowerCase();
```

pero el propio mensaje de ayuda indicaba:

```bash
pnpm --filter @barber-saas/api platform:operator:password -- correo@ejemplo.com
```

Al ejecutarlo así, el proceso terminaba recibiendo algo equivalente a:

```text
process.argv[2] = "--"
process.argv[3] = "correo@ejemplo.com"
```

y por eso devolvía falsamente:

```text
No existe un operador de plataforma activo con ese correo.
```

La ejecución que funcionó finalmente fue sin `--`:

```bash
pnpm --filter @barber-saas/api platform:operator:password correo@ejemplo.com
```

Además el script necesita en producción:

```bash
API_ENV_FILE=/etc/nava/api.env
```

o que esa variable esté previamente exportada.

---

# OBJETIVO

Corregir el código para que este problema no pueda volver a producir el mismo bucle operativo.

No quiero eliminar la separación de credenciales Admin/Mobile.

Debe mantenerse obligatoriamente:

```text
users.password_hash
```

para Nava Mobile

y:

```text
platform_operators.admin_password_hash
```

para el panel Admin.

La contraseña Admin debe seguir siendo distinta de la contraseña Mobile.

---

# 1. CORREGIR EL CLI `platform:operator:password`

Revisar:

```text
apps/api/src/configure-platform-operator-password.ts
```

y su script correspondiente en `package.json`.

El comando debe aceptar de forma robusta cualquiera de estas variantes, preferiblemente ambas:

```bash
pnpm --filter @barber-saas/api platform:operator:password correo@ejemplo.com
```

y:

```bash
pnpm --filter @barber-saas/api platform:operator:password -- correo@ejemplo.com
```

No debe interpretar `--` como correo.

Implementar parsing explícito de argumentos.

Por ejemplo, ignorar `--` y tomar el primer argumento no vacío restante.

No hacer simplemente:

```ts
process.argv[2]
```

si eso vuelve a dejar el mismo bug.

Si no hay correo válido, mostrar un uso correcto.

---

# 2. VALIDAR EL CORREO

Normalizar:

```text
trim()
toLowerCase()
```

y validar formato de email antes de consultar la base.

El CLI debe distinguir claramente estos casos:

```text
USER_NOT_FOUND
PLATFORM_OPERATOR_NOT_FOUND
PLATFORM_OPERATOR_INACTIVE
```

El mensaje actual:

```text
No existe un operador de plataforma activo con ese correo.
```

es demasiado ambiguo porque mezcla:

* usuario inexistente;
* operador inexistente;
* operador inactivo.

Mejorar los mensajes CLI sin exponer información sensible fuera de una herramienta administrativa ejecutada directamente en servidor.

---

# 3. CORREGIR EL CASO `PlatformOperator` SIN CONTRASEÑA

Revisar la lógica de:

```text
POST /v1/platform/login
```

No quiero debilitar seguridad ni hacer fallback indiscriminado al bootstrap.

Pero sí quiero que el estado:

```text
PlatformOperator existente
isActive = true
adminPasswordHash = NULL
```

sea un estado explícitamente contemplado.

Evaluar y aplicar una solución segura.

Preferencia:

## Opción recomendada

El bootstrap (`PLATFORM_ADMIN_PASSWORD_HASH`) se utiliza únicamente para una transición inicial controlada cuando:

```text
platformOperator existe
isActive = true
adminPasswordHash = NULL
correo ∈ PLATFORM_ADMIN_EMAILS
```

En ese caso:

1. validar la contraseña bootstrap;
2. rechazarla si coincide con la contraseña Mobile;
3. permitir el OTP;
4. obligar posteriormente a configurar contraseña administrativa propia;
5. una vez exista `adminPasswordHash`, nunca volver a usar bootstrap para ese operador.

Si este flujo complica innecesariamente el dominio, puede mantenerse la configuración obligatoria mediante CLI, pero entonces:

* el panel debe detectar el estado;
* el backend debe devolver un error interno diferenciable;
* debe documentarse claramente el procedimiento de inicialización.

No quiero volver a tener un `401` genérico que haga parecer que la contraseña simplemente está mal cuando en realidad falta configurar `adminPasswordHash`.

---

# 4. NO ELIMINAR LA SEPARACIÓN ADMIN / MOBILE

Mantener obligatoriamente esta protección:

```ts
await verifyPassword(input.password, user.passwordHash)
```

La contraseña utilizada para Admin no puede ser la misma que la contraseña Nava Mobile.

Casos obligatorios:

```text
Admin password != Mobile password
```

La contraseña Mobile debe seguir funcionando solamente para Nava.

La contraseña Admin debe seguir funcionando solamente para el panel.

---

# 5. REVISAR SCRYPT

Actualmente producción utiliza hashes con formato semejante a:

```text
scrypt$32768$8$1$...
```

Revisar:

```text
hashPassword
verifyPassword
passwordHashNeedsUpgrade
```

y garantizar que:

```text
hashPassword(password)
        ↓
verifyPassword(password, hash)
        ↓
true
```

Añadir pruebas de regresión.

No cambiar el algoritmo o parámetros sin una razón técnica demostrada.

Si existe compatibilidad con hashes históricos como:

```text
scrypt$16384$8$1$...
```

mantenerla o documentar claramente la migración.

---

# 6. CORREGIR MANEJO DE `API_ENV_FILE`

El CLI carga actualmente algo similar a:

```ts
loadEnvironment({
  path: process.env.API_ENV_FILE ?? '.env'
});
```

Mantener soporte para:

```text
API_ENV_FILE
```

pero mejorar el mensaje de ayuda para producción.

Por ejemplo:

```bash
export API_ENV_FILE=/etc/nava/api.env
pnpm --filter @barber-saas/api platform:operator:password correo@ejemplo.com
```

No imprimir:

* `DATABASE_URL`;
* contraseñas;
* hashes;
* tokens;
* secretos.

---

# 7. PRUEBAS OBLIGATORIAS DEL CLI

Añadir pruebas al parsing del comando:

### Caso A

```text
argv:
platform:operator:password correo@ejemplo.com
```

Resultado:

```text
correo@ejemplo.com
```

### Caso B

```text
argv:
platform:operator:password -- correo@ejemplo.com
```

Resultado:

```text
correo@ejemplo.com
```

### Caso C

Sin email:

```text
error de uso
```

### Caso D

Email inválido:

```text
error de validación
```

---

# 8. PRUEBAS DEL LOGIN

Agregar pruebas como mínimo para:

### Bootstrap sin operador

```text
User existe
correo ∈ PLATFORM_ADMIN_EMAILS
PlatformOperator = null
bootstrap password correcta
password != Mobile password
```

Resultado:

```text
OTP permitido
```

### Operador activo con contraseña propia

```text
PlatformOperator.isActive = true
adminPasswordHash presente
password correcta
password != Mobile password
```

Resultado:

```text
OTP permitido
```

### Operador activo sin contraseña

Probar explícitamente el comportamiento que finalmente definamos.

No dejar este estado dependiendo accidentalmente de:

```ts
passwordHash = null
```

y un `401` genérico.

### Operador inactivo

Resultado:

```text
401
```

### Contraseña Admin incorrecta

Resultado:

```text
401
```

### Contraseña Admin igual a Mobile

Resultado:

```text
401
```

### Usuario suspendido

Resultado:

```text
401
```

### Usuario eliminado

Resultado:

```text
401
```

### Usuario no verificado

Resultado:

```text
401
```

---

# 9. REVISAR CREACIÓN DE OPERADORES

Investigar cómo se crea actualmente un `PlatformOperator`.

Quiero evitar que vuelva a crearse un operador activo con:

```text
adminPasswordHash = NULL
```

sin que exista un flujo claro para completar su configuración.

Evaluar:

* exigir contraseña administrativa durante creación;
* crear operador inicialmente inactivo;
* estado `PENDING_PASSWORD_SETUP`;
* o flujo explícito de activación.

No modificar esquema Prisma salvo que realmente sea necesario.

Si puede resolverse solo mediante lógica y validaciones, preferir no crear migración.

---

# 10. AUDITORÍA

Mantener o mejorar auditoría para eventos como:

```text
platform.operator.password_configured
platform.operator.password_changed
platform.operator.activated
platform.operator.deactivated
platform.login.failed
platform.login.challenge_requested
```

No guardar:

* contraseña;
* hash completo;
* OTP;
* secretos.

---

# 11. DOCUMENTACIÓN

Actualizar:

```text
prompt.md
DESPLIEGUE_PANEL_ADMIN.md
```

con la causa raíz confirmada.

Documentar claramente:

## Bootstrap

```text
PLATFORM_ADMIN_PASSWORD_HASH
```

solo corresponde al acceso bootstrap.

## Operadores persistentes

Una vez existe un `PlatformOperator` con contraseña administrativa:

```text
platform_operators.admin_password_hash
```

es la fuente de credencial Admin para ese operador.

## Mobile

```text
users.password_hash
```

continúa siendo exclusivamente la credencial Nava.

---

# 12. ACTUALIZAR RUNBOOK

El comando operativo correcto debe quedar documentado.

Por ejemplo:

```bash
cd /opt/nava/app

export API_ENV_FILE=/etc/nava/api.env

pnpm --filter @barber-saas/api \
  platform:operator:password \
  soporte@navacloud.app

unset API_ENV_FILE
```

Si se mantiene soporte para `--`, documentar también:

```bash
pnpm --filter @barber-saas/api \
  platform:operator:password -- \
  soporte@navacloud.app
```

pero solo si realmente funciona después de la corrección.

---

# 13. VERIFICACIÓN

Ejecutar como mínimo:

```bash
pnpm --filter @barber-saas/api typecheck
```

pruebas relevantes de autenticación:

```bash
pnpm --filter @barber-saas/api test
```

o los tests específicos correspondientes.

Después:

```bash
pnpm --filter @barber-saas/api build
```

No declarar terminado si las pruebas nuevas no pasan.

---

# 14. NO HACER

No:

* cambiar contraseñas reales;
* imprimir hashes;
* imprimir `DATABASE_URL`;
* modificar credenciales productivas;
* tocar Neon productivo;
* crear migraciones innecesarias;
* eliminar la comparación con la contraseña Mobile;
* eliminar OTP;
* reducir seguridad para hacer pasar el login.

---

# 15. INFORME FINAL

Al terminar quiero que me indiques:

1. causa raíz encontrada;
2. por qué el bootstrap no funcionaba;
3. por qué el CLI decía que el operador no existía;
4. cómo quedó corregido el parsing de `--`;
5. cómo queda ahora el caso `PlatformOperator` sin `adminPasswordHash`;
6. archivos modificados;
7. pruebas agregadas;
8. resultado de tests;
9. resultado de typecheck;
10. resultado de build;
11. si hubo o no cambio de esquema;
12. comandos exactos que debo ejecutar posteriormente en la VPS;
13. si necesito o no reiniciar `nava-api.service`;
14. actualización realizada en `prompt.md`;
15. actualización realizada en `DESPLIEGUE_PANEL_ADMIN.md`.

No hagas cambios especulativos adicionales fuera de este problema.

---

# Implementación realizada

## Causa raíz y decisión de seguridad

La causa raíz fue que `POST /v1/platform/login` priorizaba un
`PlatformOperator` existente y, si su `admin_password_hash` era `NULL`, dejaba
de considerar por completo `PLATFORM_ADMIN_EMAILS` y
`PLATFORM_ADMIN_PASSWORD_HASH`. El resultado era el `401` genérico, aunque no
existía una contraseña administrativa que verificar.

La corrección no introduce fallback bootstrap para operadores persistentes. El
bootstrap queda limitado a cuentas configuradas en `PLATFORM_ADMIN_EMAILS` que
no tienen `PlatformOperator`. Un operador activo sin hash administrativo ahora
recibe `409 PLATFORM_OPERATOR_PASSWORD_NOT_CONFIGURED`, con auditoría sin
secretos y el procedimiento explícito de configuración por CLI.

## CLI y ciclo de vida del operador

`platform:operator:password` ignora `--`, toma el primer argumento útil,
normaliza `trim().toLowerCase()` y valida el formato de correo antes de abrir la
base. Acepta tanto:

```bash
API_ENV_FILE=/etc/nava/api.env \
  pnpm --filter @barber-saas/api platform:operator:password soporte@navacloud.app

API_ENV_FILE=/etc/nava/api.env \
  pnpm --filter @barber-saas/api platform:operator:password -- soporte@navacloud.app
```

El CLI diferencia `USER_NOT_FOUND`, `PLATFORM_OPERATOR_NOT_FOUND` y
`PLATFORM_OPERATOR_INACTIVE`. Puede configurar la contraseña de un operador
inactivo para permitir el orden seguro: crear operador inactivo, configurar su
clave Admin, activarlo desde el panel.

No hubo cambio de esquema Prisma. Se conserva `users.password_hash` para
Mobile, `platform_operators.admin_password_hash` para Admin, OTP y el rechazo
de una contraseña Admin que coincida con la de Mobile. Scrypt permanece en
`32768/8/1` y conserva la compatibilidad verificada con `16384/8/1`.
