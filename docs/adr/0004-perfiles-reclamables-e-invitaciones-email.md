# ADR 0004: perfiles reclamables e invitaciones verificadas por email

- Estado: Aceptada
- Fecha: 2026-07-23

## Contexto

El propietario necesita configurar servicios, horarios y reservas de un barbero
antes de que este instale la aplicación. El modelo anterior creaba la membresía
únicamente al aceptar una invitación manual, por lo que el onboarding operativo
quedaba bloqueado por una acción externa.

Al mismo tiempo, una persona invitada no debe acceder ni operar dentro del equipo
sin demostrar acceso al correo destinatario y aceptar explícitamente la invitación.

## Decisión

- Crear la cuenta personal y la membresía `INVITED` al emitir la invitación.
- Una cuenta reclamable no tiene contraseña hasta que la persona se registra con
  el mismo correo.
- El propietario puede configurar servicios, horarios, bloqueos y citas para
  membresías `BARBER` en estado `INVITED` o `ACTIVE`.
- Solamente una membresía `ACTIVE` autoriza a iniciar operaciones como integrante.
- El token original nunca se persiste ni se devuelve al cliente. Se envía dentro
  de un enlace profundo por SMTP y PostgreSQL conserva únicamente SHA-256.
- Aceptar el token autenticado y con el mismo correo cambia la membresía a
  `ACTIVE`. El enlace vence en siete días y una nueva invitación revoca la anterior.
- En producción y en el flujo móvil, SMTP es obligatorio para crear invitaciones.
  Las variables heredadas `EMAIL_*` se aceptan temporalmente y se normalizan a la
  configuración `SMTP_*`.

## Consecuencias

- El propietario completa la configuración inicial sin esperar al barbero.
- La invitación continúa siendo la frontera de autorización del integrante.
- `users.password_hash` es nullable únicamente para cuentas todavía no reclamadas.
- El fallo de entrega revoca el token emitido y permite reintentar el envío sin
  perder el perfil operativo creado.
