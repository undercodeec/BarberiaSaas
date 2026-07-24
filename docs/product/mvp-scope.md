# Alcance activo del MVP

La fuente de verdad es `INSTRUCCIONES_CODEX_BARBER_SAAS.md`.

La ejecución actual cubre las fases 0–3:

- monorepositorio, calidad, CI y aplicaciones base;
- autenticación, sesiones, recuperación, organización y onboarding;
- invitaciones, profesionales, categorías, servicios, asignaciones, horarios y bloqueos;
- disponibilidad, citas, reprogramación, cancelación, estados, prevención de doble reserva y sincronización incremental de agenda.

La arquitectura vigente es PostgreSQL + Prisma + API Node/Fastify según ADR 0003.
El móvil no consume Supabase directamente.

Quedan fuera del alcance implementado las reservas web públicas, clientes e
historial, caja, comisiones, inventario, notificaciones, reportes, planes y panel
interno operativo.

El propietario puede configurar un perfil de barbero antes de su aceptación. La
invitación se entrega por SMTP y el barbero no puede operar dentro del equipo hasta
registrarse con el correo destinatario y aceptar el enlace.
