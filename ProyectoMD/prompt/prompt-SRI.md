Revisa y corrige únicamente el código del proyecto Nava relacionado con la URL que utiliza el panel Admin para conectarse a la API.

Codex NO tiene acceso a la VPS, por lo tanto:

* no ejecutes `systemctl`;
* no modifiques Nginx;
* no edites `/etc/nava/api.env`;
* no intentes conectarte por SSH;
* no hagas cambios de infraestructura;
* no ejecutes comandos sobre producción.

## Error observado en producción

El navegador muestra:

```text
Connecting to 'http://127.0.0.1:4000/v1/platform/login' violates the following Content Security Policy directive:
"connect-src 'self' https://api.navacloud.app".

Fetch API cannot load http://127.0.0.1:4000/v1/platform/login.
Refused to connect because it violates the document's Content Security Policy.
```

El comportamiento correcto en producción es que el panel Admin utilice:

```text
https://api.navacloud.app
```

y nunca:

```text
http://127.0.0.1:4000
```

desde el navegador.

## Objetivo

Determina por qué el código del Admin puede terminar generando solicitudes hacia:

```text
http://127.0.0.1:4000
```

y corrige el código para que esto no pueda ocurrir silenciosamente en producción.

## Revisión obligatoria

Busca en todo el repositorio referencias a:

```text
127.0.0.1:4000
localhost:4000
NEXT_PUBLIC_API_URL
API_URL
BASE_URL
apiBaseUrl
platform/login
```

Presta especial atención a:

```text
apps/admin
packages
clientes HTTP compartidos
configuración de Next.js
variables públicas
CSP
.env.example
turbo.json
package.json
```

Identifica cualquier lógica equivalente a:

```ts
process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000'
```

o:

```ts
process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
```

o cualquier URL local hardcodeada que pueda terminar incluida en el bundle del navegador.

## Regla esperada

### Desarrollo

Se puede mantener localhost para desarrollo local si actualmente es necesario.

Por ejemplo:

```text
http://127.0.0.1:4000
```

### Producción

En producción, el Admin debe depender explícitamente de:

```text
NEXT_PUBLIC_API_URL
```

y utilizar:

```text
https://api.navacloud.app
```

cuando esa variable sea proporcionada durante el build.

Lo importante es que producción NO tenga un fallback silencioso a localhost.

Si:

```ts
process.env.NODE_ENV === 'production'
```

y `NEXT_PUBLIC_API_URL` está ausente, inválida o apunta a localhost, la aplicación debe fallar de forma explícita durante build/inicialización.

Implementa esta validación dentro de la arquitectura existente del proyecto.

Conceptualmente puede ser similar a:

```ts
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;

if (process.env.NODE_ENV === 'production') {
  if (!configuredApiUrl) {
    throw new Error(
      'NEXT_PUBLIC_API_URL is required for the Admin production build',
    );
  }

  const url = new URL(configuredApiUrl);

  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1'
  ) {
    throw new Error(
      'NEXT_PUBLIC_API_URL cannot point to localhost in production',
    );
  }
}
```

No copies necesariamente esta implementación si existe una capa de configuración centralizada mejor.

## Centralizar configuración

Si actualmente la URL de la API se calcula en varios sitios, centralízala.

Quiero una única fuente de verdad para el Admin.

Por ejemplo, conceptualmente:

```ts
getAdminApiBaseUrl()
```

o la abstracción que mejor encaje con la arquitectura actual.

El login del Admin:

```text
POST /v1/platform/login
```

debe construir su destino a partir de esa configuración central.

No quiero URLs repetidas en componentes.

## No modificar CSP para ocultar el error

La CSP actual:

```text
connect-src 'self' https://api.navacloud.app
```

es coherente con producción.

NO agregues:

```text
http://127.0.0.1:4000
```

ni:

```text
http://localhost:4000
```

a la CSP de producción.

No elimines ni debilites CSP.

El error debe solucionarse corrigiendo la URL utilizada por el frontend.

## No modificar autenticación

No alteres:

* contraseña del Admin;
* contraseña Mobile;
* `PLATFORM_ADMIN_EMAILS`;
* operadores;
* OTP;
* autorización del endpoint;
* lógica funcional de `/v1/platform/login`;
* sesiones;
* Neon;
* Prisma;
* migraciones.

Este trabajo es exclusivamente sobre configuración de URL de API en el código del frontend Admin y sus utilidades compartidas.

## Pruebas requeridas

Agrega pruebas que eviten que este error vuelva a ocurrir.

Como mínimo valida:

1. Desarrollo puede usar localhost si corresponde.
2. Producción con `NEXT_PUBLIC_API_URL=https://api.navacloud.app` funciona.
3. Producción sin `NEXT_PUBLIC_API_URL` falla explícitamente.
4. Producción con:

```text
http://127.0.0.1:4000
```

falla explícitamente.
5. Producción con:

```text
http://localhost:4000
```

falla explícitamente.
6. El cliente utilizado por `/v1/platform/login` usa la URL configurada.
7. Ningún componente del Admin tiene `127.0.0.1:4000` hardcodeado para producción.

## Validación de build local

Haz un build local equivalente al de producción:

```bash
rm -rf apps/admin/.next

NEXT_PUBLIC_API_URL=https://api.navacloud.app \
pnpm --filter @barber-saas/admin build
```

Después inspecciona el bundle:

```bash
grep -R -n --binary-files=without-match \
'http://127.0.0.1:4000' \
apps/admin/.next/static 2>/dev/null
```

y:

```bash
grep -R -n --binary-files=without-match \
'http://localhost:4000' \
apps/admin/.next/static 2>/dev/null
```

No deberían aparecer referencias utilizadas por código de producción del Admin.

Comprueba también:

```bash
grep -R -l --binary-files=without-match \
'https://api.navacloud.app' \
apps/admin/.next/static 2>/dev/null | head
```

## Revisa también valores por defecto

Si existe alguna configuración del tipo:

```ts
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://127.0.0.1:4000';
```

no necesariamente elimines localhost por completo.

Puedes hacer que el fallback sea válido exclusivamente en desarrollo:

```ts
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://127.0.0.1:4000'
    : undefined);
```

y luego validar el valor.

La implementación final debe ser limpia, tipada y acorde con el estilo existente.

## Documentación del repositorio

Si existe `.env.example` o documentación de desarrollo del Admin, actualízala para dejar claro que:

```text
NEXT_PUBLIC_API_URL
```

es obligatoria para builds de producción.

No agregues secretos.

Puedes documentar un ejemplo como:

```text
NEXT_PUBLIC_API_URL=https://api.navacloud.app
```

## Comprobaciones finales

Ejecuta únicamente verificaciones locales relevantes, por ejemplo:

```bash
pnpm --filter @barber-saas/admin typecheck
pnpm --filter @barber-saas/admin test
NEXT_PUBLIC_API_URL=https://api.navacloud.app pnpm --filter @barber-saas/admin build
```

Adapta los comandos si el paquete usa scripts diferentes.

No hagas deploy.

## Entrega final

Al terminar dime exactamente:

1. cuál era la causa raíz en el código;
2. qué archivo generaba o permitía `127.0.0.1:4000`;
3. todos los archivos modificados;
4. cómo quedó centralizada la URL;
5. qué validación evita localhost en producción;
6. qué pruebas agregaste;
7. resultados de typecheck/tests/build;
8. resultado de buscar `127.0.0.1:4000` y `localhost:4000` en `.next/static`;
9. si todavía existe alguna referencia local legítima exclusivamente para desarrollo;
10. commit sugerido.

No realices cambios fuera del repositorio.
No intentes acceder a la VPS.
No modifiques infraestructura.
