# Restablecimiento web de contraseña — Diseño

## Objetivo

Permitir que cualquier persona que reciba un correo de recuperación pueda abrir un enlace HTTPS seleccionable en el navegador y crear una nueva contraseña, sin requerir que la aplicación móvil esté instalada.

## Alcance

- El enlace enviado por correo será `https://reservas.navacloud.app/reset-password?token=<token>`.
- La aplicación web expondrá la ruta pública `/reset-password`.
- La ruta validará el token recibido, solicitará contraseña y confirmación, y usará el endpoint existente `POST /v1/auth/reset-password`.
- La app móvil mantendrá la compatibilidad con el mismo enlace HTTPS mediante su configuración actual de App Links y Universal Links.

## Arquitectura

El API seguirá siendo la única autoridad para emitir, validar y consumir los tokens. Su configuración `MOBILE_RESET_URL` pasa a tener como valor predeterminado el URL HTTPS canónico; la generación del token y el endpoint de actualización de contraseña no cambian.

La web incorporará un formulario de cliente aislado bajo `apps/web/app/reset-password`. La página obtiene el token de la consulta y lo entrega al formulario. El formulario aplica las reglas de contraseña compartidas, llama al API configurado por `api-url.ts` y, cuando recibe una respuesta exitosa, confirma que la contraseña fue actualizada. Los errores del API se muestran sin revelar datos de la cuenta.

## Componentes y flujo

1. La persona solicita recuperar el acceso desde la app móvil.
2. `POST /v1/auth/recover` crea un token opaco temporal y forma la URL HTTPS canónica.
3. El correo de texto plano contiene esa URL, seleccionable por los clientes de correo.
4. El navegador abre `/reset-password?token=...` en la web.
5. El formulario valida presencia de token, nueva contraseña y coincidencia de confirmación.
6. La web envía `{ token, password }` a `POST /v1/auth/reset-password`.
7. El API actualiza la contraseña, invalida el token y revoca sesiones activas; la web muestra el resultado y un acceso para iniciar sesión en la app.

## Manejo de errores

- Sin token o token con formato inválido: no se permite enviar el formulario y se indica solicitar un enlace nuevo.
- Contraseñas inválidas o distintas: se muestran las reglas o el error de confirmación antes de llamar al API.
- Token vencido, utilizado o desconocido: se muestra el mensaje controlado del API y una acción para solicitar otro enlace desde la app.
- Error de red o servidor: se muestra una explicación genérica y se conserva el formulario para reintentar.

## Pruebas

- Configuración del API: el valor predeterminado de recuperación es el URL HTTPS y, en producción, solo se aceptan URLs HTTPS seguras para ese destino.
- API: la recuperación construye una URL con el token como parámetro de consulta sobre el destino configurado.
- Web: pruebas del formulario para token ausente, contraseñas distintas, envío correcto y error del API.
- Móvil: se ejecutan las pruebas existentes que aseguran que el enlace HTTPS canónico se traduce a la ruta de restablecimiento.

## Restricciones

- No se envían tokens por registros ni se exponen en mensajes de error.
- El token continúa teniendo vigencia de 30 minutos y uso único.
- No se introducen dependencias nuevas.
