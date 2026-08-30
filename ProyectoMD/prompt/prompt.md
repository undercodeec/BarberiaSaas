 Sí. La recomendación es definir una política de notificaciones antes de añadir más envíos, porque un push debe
  requerir atención o una acción; si se usa para todo, los usuarios terminan desactivándolo.

  La matriz inicial que propongo:

   Evento                             Push a                              Prioridad    Regla
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Nueva cita / reserva               Barbero asignado, recepción y            Alta    No avisar al usuario que la creó
                                      gerente de la sede; propietario
                                      opcional
  ─────────────────────────────────  ──────────────────────────────────  ───────────  ──────────────────────────────────
   Cita cancelada o reprogramada      Mismos destinatarios                     Alta    Solo si afecta una cita futura
  ─────────────────────────────────  ──────────────────────────────────  ───────────  ──────────────────────────────────
   Cita próxima                       Solo barbero asignado                    Alta    Recordatorio configurable: 30 o
                                                                                       15 min antes
  ─────────────────────────────────  ──────────────────────────────────  ───────────  ──────────────────────────────────
   Reserva pendiente de               Recepción y gerente de la sede          Media    Evitar uno por cada intento del
   confirmar / vencida                                                                 cliente
  ─────────────────────────────────  ──────────────────────────────────  ───────────  ──────────────────────────────────
   Cobro de servicio pendiente de     Propietario y gerente de la sede         Alta    Debe pasar de aviso interno a
   confirmar                                                                           push real
  ─────────────────────────────────  ──────────────────────────────────  ───────────  ──────────────────────────────────
   Caja cerrada con diferencia        Propietario y gerente de la sede         Alta    Incluir monto de diferencia, no
                                                                                       datos del cliente
  ─────────────────────────────────  ──────────────────────────────────  ───────────  ──────────────────────────────────
   Caja abierta o cerrada sin         Propietario y gerente de la sede         Baja    Opcional; puede quedar solo en
   diferencia                                                                          el historial
  ─────────────────────────────────  ──────────────────────────────────  ───────────  ──────────────────────────────────
   Stock bajo mínimo                  Propietario y gerente de la sede        Media    Solo al cruzar el mínimo; no en
                                                                                       cada ajuste
  ─────────────────────────────────  ──────────────────────────────────  ───────────  ──────────────────────────────────
   Pedido pagado / listo para         Recepción y gerente de la sede          Media    Si el flujo de productos opera
   entregar                                                                            por sucursal
  ─────────────────────────────────  ──────────────────────────────────  ───────────  ──────────────────────────────────
   Nuevo miembro acepta invitación    Propietario y gerente                   Media    Aviso único
  ─────────────────────────────────  ──────────────────────────────────  ───────────  ──────────────────────────────────
   Cambio de rol, sede o agenda       Usuario afectado + propietario/          Alta    Importante para el colaborador
                                      gerente                                          afectado
  ─────────────────────────────────  ──────────────────────────────────  ───────────  ──────────────────────────────────
   Reseña nueva negativa              Propietario y gerente de la sede        Media    Por ejemplo, calificación 1–3;
                                                                                       positivas pueden ir al panel
  ─────────────────────────────────  ──────────────────────────────────  ───────────  ──────────────────────────────────
   Suscripción, pago rechazado o      Solo propietario                         Alta    También por correo, pues es un
   vencimiento                                                                         tema administrativo
  ─────────────────────────────────  ──────────────────────────────────  ───────────  ──────────────────────────────────
   Seguridad: cambio de               Usuario afectado y/o propietario         Alta    Push y correo; no depender solo
   contraseña, cierre de sesión,                                                       de la app
   cuenta suspendida

  Reglas de roles recomendadas:

  - owner: asuntos financieros, seguridad, suscripción y visión global; no necesariamente cada cita si hay mucho
    volumen.

  - manager: eventos operativos de las sedes asignadas, caja, inventario, equipo y citas.
  - receptionist: citas, cambios, cancelaciones, pedidos y alertas operativas de su sede; nunca pagos, suscripción o
    configuración sensible.

  - barber: solo sus propias citas, cambios, cancelaciones, recordatorios y cambios que afecten su agenda.
  - Ningún aviso debe llegar a una persona sin acceso a esa sede.
  - El actor de una acción no debe recibir su propio push.
  - Si una persona tiene varios roles, se consolida en un único envío.

  Además, separaría tres canales:

  - Push: requiere atención inmediata.
  - Bandeja dentro de Nava: historial y novedades no urgentes.
  - Correo: seguridad, facturación, invitaciones y avisos que no deben perderse.

  Hoy ya existe una buena base para citas, pero falta aplicar estas reglas por sede y completar eventos como
  confirmación de cobro, caja, inventario, equipo, reseñas y suscripción. El punto más urgente es convertir “cobro

  La siguiente fase debería ser convertir esta matriz en preferencias configurables por usuario: por ejemplo, que el
  propietario pueda apagar “nuevas citas” pero mantener activas “caja con diferencia”, “pagos pendientes” y “stock
  bajo”.
  desde la app— y cobros pendientes. Aplicaré los destinatarios por sede, evitaré notificar al autor de su propia acción
  y haré que el cobro pendiente llegue como push real.

   Primera fase implementada.

  - Las citas creadas, canceladas y reprogramadas desde Nava ahora notifican.
  - Destinatarios: profesional asignado, propietarios, gerentes y recepción de la misma sede.
  - Un cobro pendiente de confirmar ahora entra en la cola real de push para propietarios y gerentes de la sede; antes
    era solo un aviso interno.

  Cambios principales: apps/api/src/app.ts:364 y apps/api/src/agenda.ts:852.

  Validado con typecheck del API y las pruebas de FCM. No hice commit aún.

   No. Está completa la primera fase crítica de citas y cobros pendientes.

  Aún faltan por implementar:

  - Inventario: stock bajo.
  - Equipo: invitación aceptada, cambio de rol/sede/horario.
  - Reseñas negativas.
  - Suscripción y pagos rechazados.
  - Preferencias por usuario para activar o silenciar categorías.
  - Pruebas integrales con dispositivos reales y FCM configurado.

  No marqué el trabajo como completo ni hice commit de esta fase.