# Aceptación web de invitaciones

## Objetivo

Permitir que una persona invitada acepte su incorporación al equipo desde
`reservas.navacloud.app`, sin instalar Nava. Tras aceptar, la web confirma que
el acceso quedó activo e indica que instale la aplicación móvil e inicie sesión
con el mismo correo para operar.

## Alcance

- Sustituir el lanzador automático `barbersaas://` de la página web de
  invitaciones por una experiencia de autenticación y aceptación en web.
- Reutilizar las rutas de autenticación existentes de la API: registro,
  verificación de correo e inicio de sesión.
- Usar el endpoint existente `POST /v1/team/invitations/accept` como única
  autoridad para aceptar una invitación.
- No crear un dashboard operativo web para colaboradores.
- Conservar la experiencia móvil actual para enlaces profundos recibidos
  directamente por la aplicación.

## Flujo de usuario

1. El correo contiene el enlace HTTPS
   `/accept-invitation?token=<token-opaco>`.
2. La página valida que el token tenga formato válido y muestra la pantalla
   “Únete al equipo de Nava”. No muestra datos del negocio ni del invitador.
3. Si no hay una sesión web de invitación, la persona elige iniciar sesión o
   crear una cuenta. El token de la invitación se conserva en el estado de la
   página durante ambos flujos.
4. Registro requiere verificar el correo. Al verificarse, o al iniciar sesión,
   el cliente solicita aceptar la invitación mediante el proxy web.
5. El proxy adjunta la sesión en una cookie HTTP-only y llama a la API con el
   bearer token; la API comprueba correo, vencimiento, uso único y reglas de
   membresía antes de aceptar.
6. Con éxito se muestra “Tu acceso está activo” y enlaces de instalación de
   Nava. La persona usará luego la app móvil con ese mismo correo.

## Arquitectura

Se crea un grupo de rutas Next.js específico, por ejemplo
`/api/invitations/[...path]`, separado del proxy de checkout.

| Ruta web | API de destino | Autenticación |
| --- | --- | --- |
| `auth/login` | `POST /v1/auth/login` | Pública; guarda el token de respuesta en cookie temporal. |
| `auth/register` | `POST /v1/auth/register` | Pública. |
| `auth/verify-email` | `POST /v1/auth/verify-email` | Pública; guarda la sesión devuelta en cookie temporal. |
| `accept` | `POST /v1/team/invitations/accept` | Requiere la cookie; reenvía el token opaco en el cuerpo. |
| `auth/logout` | `POST /v1/auth/logout` | Borra cookie y revoca la sesión, si aplica. |

La cookie `nava_invitation_session` tendrá `HttpOnly`, `Secure` en producción,
`SameSite=Lax`, `Path=/api/invitations` y un tiempo de vida no mayor a la
sesión emitida por la API. No se reutiliza la cookie de checkout para no
convertir ese módulo en la autenticación general de Nava.

El token de la invitación permanece en la URL y en memoria de la página; no se
persiste en cookies ni se registra. La página elimina el token de la URL con
`history.replaceState` después de cargarlo, conservándolo solo en estado de
memoria para reducir filtraciones por historial o navegación posterior.

## Pantallas y estados

- **Token inválido:** solicitar una invitación nueva.
- **Autenticación:** pestañas o pasos para iniciar sesión y crear cuenta.
- **Verificación:** ingresar el código enviado al correo y volver al flujo sin
  perder la invitación.
- **Confirmación:** acceso activo, instrucciones de instalar Nava y botones a
  las tiendas; sin redirección automática a la app.
- **Error recuperable:** mostrar los mensajes de API para correo no verificado,
  invitación vencida/usada, correo no coincidente o pertenencia a otra
  organización. No revelar información adicional.

## Reglas de seguridad

No se replicará ninguna regla de aceptación en la web. La API conserva las
comprobaciones actuales: hash del token, estado pendiente, vencimiento, correo
normalizado coincidente, correo verificado, una organización activa por cuenta,
actualización atómica y auditoría. El proxy únicamente transporta la sesión de
forma segura.

Las rutas de autenticación usarán límites de tasa existentes de la API. La
ruta `accept` no expondrá el bearer token al JavaScript del navegador y nunca
devolverá el token en respuestas.

## Pruebas y criterio de aceptación

- Pruebas de rutas web: cookie creada tras login/verificación, cookie ausente
  rechazada, reenvío correcto a la API y borrado al cerrar sesión.
- Pruebas del componente: registro, inicio de sesión, verificación y
  conservación del token entre pasos.
- Prueba de integración: invitado con correo verificado acepta; su membresía
  queda activa y la invitación ya no se puede reutilizar.
- Pruebas negativas: token inválido o vencido, correo distinto, correo sin
  verificar y usuario con membresía activa en otra organización.
- Prueba manual en móvil y escritorio: el enlace completa la aceptación desde
  web sin requerir que esté instalada la app.

## Despliegue

El valor de producción de `MOBILE_INVITATION_URL` se mantiene como URL HTTPS de
la página web. Antes de publicar se deben configurar los enlaces reales a las
tiendas, desplegar web y API juntas, y probar una invitación nueva en un
navegador sin Nava instalada.
