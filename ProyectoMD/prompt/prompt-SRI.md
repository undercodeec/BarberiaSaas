Necesito corregir definitivamente el sistema de configuración y despliegue de producción del proyecto Nava.

Actualmente el proyecto funciona, pero los despliegues en VPS están fallando debido a configuración inconsistente de variables de entorno.

## Contexto de producción

La arquitectura real es:

```text
https://admin.navacloud.app
    -> Nginx
    -> http://127.0.0.1:3001
    -> apps/admin

https://api.navacloud.app
    -> Nginx
    -> http://127.0.0.1:4000
    -> apps/api

https://reservas.navacloud.app
    -> Nginx
    -> http://127.0.0.1:3000
    -> apps/web
```

Por lo tanto, la URL pública que deben utilizar los frontends para comunicarse con la API es:

```env
NEXT_PUBLIC_API_URL=https://api.navacloud.app
```

NO debe utilizarse en producción:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000
```

porque `NEXT_PUBLIC_*` puede ejecutarse en el navegador y `127.0.0.1` representaría el equipo del usuario.

## Problema actual

El build del Admin falla:

```text
Error: NEXT_PUBLIC_API_URL is required for the Admin production build.
```

El código actual de:

```text
apps/admin/app/api-url.ts
```

correctamente exige:

* que exista `NEXT_PUBLIC_API_URL`
* que sea una URL absoluta
* HTTPS en producción
* que no sea localhost en producción

NO elimines ni debilites estas validaciones.

El problema es que el procedimiento de despliegue no garantiza que la variable esté disponible cuando se ejecuta:

```bash
pnpm build
```

También se detectó:

```text
apps/web/.env.production
```

con un valor incorrecto:

```env
NEXT_PUBLIC_API_URL=https://api.navaclouda.app
```

cuando debería ser:

```env
NEXT_PUBLIC_API_URL=https://api.navacloud.app
```

Además, en el `.env` raíz existe o existió:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000
```

lo cual puede provocar confusión entre desarrollo y producción.

---

# Objetivo

Quiero que prepares el proyecto para que los despliegues de producción sean repetibles y no requieran recordar manualmente dónde crear variables cada vez que hago:

```bash
git pull
pnpm install --frozen-lockfile
pnpm db:migrate:deploy
pnpm build
```

Debes investigar primero cómo están cargando variables:

* workspace raíz
* `apps/api`
* `apps/web`
* `apps/admin`
* scripts de build
* scripts de start
* systemd si existe documentación/configuración versionada
* Next.js
* pnpm workspace

No asumas una solución antes de revisar el proyecto.

---

# Requisitos

## 1. Separar correctamente desarrollo y producción

Desarrollo puede utilizar:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000
```

Producción debe utilizar:

```env
NEXT_PUBLIC_API_URL=https://api.navacloud.app
```

No hardcodees la URL de producción dentro del código TypeScript/React.

La URL debe seguir siendo una variable de entorno.

---

## 2. No depender de `.env.production` sin documentarlo

Determina cuál es la estrategia más correcta para este monorepo.

Quiero evitar tener que crear manualmente después de cada despliegue:

```text
apps/admin/.env.production
apps/web/.env.production
```

si existe una forma más robusta de centralizar la configuración de producción.

Si Next.js requiere que las variables estén disponibles dentro de cada aplicación durante `next build`, crea una solución explícita y mantenible.

Por ejemplo, evalúa si conviene:

* un script de build que cargue `/etc/nava/frontend.env`
* variables exportadas por un script de despliegue
* un archivo de entorno de producción externo al repositorio
* variables compartidas correctamente entre los workspaces

Elige la solución más segura y sencilla para producción.

---

## 3. Los secretos y configuración VPS no deben entrar a Git

No quiero subir secretos reales al repositorio.

Los archivos versionados pueden contener únicamente ejemplos:

```text
.env.example
.env.production.example
```

Los valores reales de producción deben mantenerse fuera de Git.

`NEXT_PUBLIC_API_URL` no es secreto, pero quiero mantener un procedimiento coherente con el resto de la configuración.

---

## 4. Crear validación previa al despliegue

Quiero que exista un comando, por ejemplo:

```bash
pnpm env:check:production
```

o equivalente.

Debe comprobar antes del build:

```text
NEXT_PUBLIC_API_URL existe
NEXT_PUBLIC_API_URL es URL válida
usa https
no utiliza localhost
no utiliza 127.0.0.1
no contiene errores evidentes de dominio
```

Para este proyecto debería aceptar:

```text
https://api.navacloud.app
```

No quiero que el build avance hasta varios minutos después para descubrir que falta una variable.

Debe fallar inmediatamente con un mensaje claro.

---

## 5. Crear un comando de build de producción robusto

Evalúa crear algo como:

```bash
pnpm build:production
```

que realice en orden:

```text
validación de entorno
build API
build Web
build Admin
```

y que todos los workspaces reciban correctamente las variables necesarias.

No dupliques innecesariamente scripts.

---

## 6. Revisar todos los usos de NEXT_PUBLIC_API_URL

Busca:

```bash
rg "NEXT_PUBLIC_API_URL"
```

en todo el repositorio.

Revisa especialmente:

```text
apps/web
apps/admin
packages
scripts
```

Comprueba que:

* Admin usa `https://api.navacloud.app` en producción
* Web usa `https://api.navacloud.app` en producción
* ningún frontend utiliza localhost en producción
* ninguna URL tenga el typo `navaclouda.app`
* los tests sigan pudiendo utilizar localhost cuando corresponda

Los tests pueden utilizar:

```text
http://127.0.0.1:4000
```

porque no son producción.

---

## 7. No modificar la arquitectura de Nginx

No cambies conceptualmente:

```text
admin.navacloud.app -> 127.0.0.1:3001
api.navacloud.app -> 127.0.0.1:4000
reservas.navacloud.app -> 127.0.0.1:3000
```

Esto es correcto.

Recuerda la diferencia:

```text
127.0.0.1:4000
```

es comunicación interna VPS/Nginx.

Mientras:

```text
https://api.navacloud.app
```

es la API pública utilizada por los navegadores.

---

## 8. Actualizar documentación

Crea o actualiza documentación de despliegue indicando exactamente qué debe existir en el VPS.

Quiero que después de un:

```bash
git pull --ff-only origin main
```

pueda seguir un procedimiento claro.

Documenta:

* dónde viven las variables reales de producción;
* qué variables requiere Admin;
* qué variables requiere Web;
* cuál es la URL pública de la API;
* cómo validar la configuración;
* cómo compilar;
* cómo reiniciar los servicios;
* cómo comprobar que API, Web y Admin funcionan.

---

# Importante

NO hagas estas soluciones:

```text
❌ quitar la validación de api-url.ts
❌ permitir localhost en producción
❌ fallback silencioso a localhost
❌ hardcodear https://api.navacloud.app en TypeScript
❌ guardar secretos reales en Git
❌ ignorar la variable si falta
```

Quiero conservar el comportamiento seguro actual.

---

# Tests

Añade o actualiza tests para comprobar al menos:

```text
producción sin NEXT_PUBLIC_API_URL -> falla
producción con localhost -> falla
producción con 127.0.0.1 -> falla
producción con http -> falla
producción con https://api.navacloud.app -> funciona
desarrollo con localhost -> funciona cuando corresponda
URL inválida -> falla
```

No rompas los tests existentes.

---

# Validación final

Ejecuta:

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm test
pnpm build
```

o los tests equivalentes apropiados del monorepo.

Para simular producción puedes proporcionar temporalmente:

```env
NEXT_PUBLIC_API_URL=https://api.navacloud.app
```

mediante variables de proceso.

Revisa también:

```bash
git diff
git status
```

antes de finalizar.

---

# Entrega final

Cuando termines explícame:

1. cuál era la causa exacta;
2. por qué el código del Admin no era el problema principal;
3. qué cambiaste para hacer el despliegue repetible;
4. dónde deben almacenarse ahora las variables de producción;
5. qué archivos modificaste;
6. qué tests agregaste;
7. cómo evitaste que producción pueda utilizar localhost;
8. los comandos exactos que debo ejecutar en el VPS después de hacer `git pull`;
9. si debo eliminar los antiguos `.env.production` manuales del VPS;
10. si debo modificar `/etc/nava/api.env` o crear un archivo independiente para las variables públicas de Web/Admin.

No tienes acceso al VPS. Solo debes modificar, probar y documentar el proyecto local.
