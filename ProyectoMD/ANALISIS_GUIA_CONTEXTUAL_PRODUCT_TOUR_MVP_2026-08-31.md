# Análisis: guía contextual opcional para usar Nava

Fecha: 2026-08-31  
Estado: base MVP implementada; validación visual pendiente

## Decisiones confirmadas (2026-08-31)

1. Se implementan los cuatro recorridos iniciales: primera cita, compartir enlace, crear servicio y agregar cliente.
2. La tarjeta «Primeros pasos» es la única invitación automática y solo se habilita al finalizar un onboarding nuevo.
3. Se mantiene el límite anti-spam: posponer la tarjeta la oculta durante 14 días y saltar un spotlight evita que vuelva a abrirse automáticamente.
4. El progreso se guarda localmente en el dispositivo y por usuario para este MVP. No se sincroniza aún entre teléfono y tablet. Los usuarios existentes no reciben la nueva invitación automática; pueden abrir o repetir las guías desde Ajustes → Ayuda y guías.
5. La validación con propietario de negocio y profesional independiente forma parte del cierre antes de lanzamiento.

## Implementación realizada

- Se añadió un proveedor de guías con estado persistido en `expo-secure-store`, catálogo tipado y límite de 14 días.
- Se creó un spotlight que atenúa la pantalla, mantiene pulsable el elemento destacado y permite «Saltar guía».
- Se conectaron los cuatro objetivos a Agenda, Dashboard, Servicios y Clientes.
- Se añadió la tarjeta opcional «Primeros pasos» para cuentas nuevas y la pantalla manual Ajustes → Ayuda y guías.
- Se agregaron pruebas unitarias del catálogo y almacenamiento local.

## Propósito

Nava necesita ayudar a una persona nueva a descubrir las acciones importantes —crear una cita, configurar servicios, atender clientes y compartir su enlace de reservas— sin convertir la app en una secuencia obligatoria de pantallas. La solución recomendada es una **guía contextual opcional** (`coachmarks` o `spotlights`), complementada por estados vacíos y ayuda inline.

No es un tutorial único y largo. Cada ayuda aparece solo cuando la persona llega a una función relevante, cumple las condiciones para usarla y aún no ha demostrado que conoce esa acción.

## Principios de experiencia

1. **La tarea real es primero.** Si la persona ya inició una acción, nunca se cubre la pantalla para explicarle otra cosa.
2. **Una meta por guía.** Cada guía responde a una pregunta concreta: «¿Cómo creo una cita?»; no intenta explicar toda la pantalla.
3. **Opcional y reversible.** Toda guía tiene «Saltar», cierre y un punto permanente para abrir «Ayuda de esta pantalla» después.
4. **Explicar en el momento correcto.** La explicación de una reserva llega al abrir Agenda, no al registrarse; la de caja llega al tener una cita cobrable.
5. **No competir con flujos existentes.** No se muestra sobre formularios, permisos del sistema, errores, banners, hojas modales, pagos ni confirmaciones destructivas.
6. **Progreso, no presión.** La tarjeta de inicio puede sugerir siguientes pasos, pero no bloquea navegación, no usa contadores agresivos ni vuelve a aparecer si fue descartada.
7. **Usar la interfaz antes que un tour.** Para acciones simples, un buen estado vacío, etiqueta o `accessibilityHint` es preferible a una superposición oscura.

## Patrón recomendado

### Tres niveles de ayuda

| Nivel | Cuándo se usa | Forma | Ejemplo |
| --- | --- | --- | --- |
| 1. Ayuda inline | La acción es simple o está dentro de un formulario. | Texto breve, estado vacío, ejemplo o hint. | «Agrega tu primer servicio» en Servicios. |
| 2. Sugerencia no intrusiva | La persona puede beneficiarse de una función, pero no está bloqueada. | Tarjeta descartable o chip «Ver cómo». | Dashboard: «Comparte tu enlace de reservas». |
| 3. Coachmark/spotlight | Hay un control decisivo o poco evidente y la persona eligió conocerlo, o acaba de completar el prerrequisito. | Fondo atenuado, control visible, burbuja corta y hasta 3 pasos. | Botón «Nueva cita» en Dashboard. |

### Reglas visuales del spotlight

- Atenuar el resto de la pantalla sin ocultar por completo el contexto; el objetivo conserva color, contraste y tamaño original.
- Permitir pulsar el objetivo cuando ese sea el siguiente paso. El hueco del spotlight no debe interceptar el toque.
- Burbuja de 1 a 2 líneas, título opcional y una sola acción principal: «Siguiente» o «Entendido».
- Máximo 3 pasos por objetivo. Si una tarea requiere más, abrir una guía detallada o usar ayuda inline por etapa.
- Usar un indicador «1 de 2» solo cuando existan pasos reales; no añadir pasos para rellenar el recorrido.
- Incluir «Saltar guía» siempre visible y `X` en la esquina cuando no haya una consecuencia operativa.
- Respetar área segura, teclado, orientación, tamaño de fuente y el espacio ocupado por la navegación inferior.

### Copy recomendado

El texto describe el resultado, no el nombre técnico del control:

- Bien: «Crea una cita y elige el cliente, servicio y hora.»
- Bien: «Comparte este enlace para que tus clientes reserven solos.»
- Evitar: «Presiona el FAB para ejecutar la creación de booking.»
- Evitar: «Debes completar este paso.»

## Política anti-spam

La experiencia no debe lanzar recorridos automáticos en cada página. El motor debe cumplir todas estas condiciones antes de mostrar uno:

```text
usuario autenticado
Y guía elegible para su rol, plan y categoría
Y aún no completó ni descartó esa guía
Y la acción es posible en la pantalla actual
Y no hay modal, permiso, error, banner crítico o carga activa
Y no se mostró otra guía automática en la sesión
Y se respeta el límite de frecuencia
```

### Límites iniciales

| Situación | Regla |
| --- | --- |
| Primera visita al dashboard | Mostrar solo una tarjeta de «Primeros pasos», no un spotlight automático. |
| Spotlight automático | Como máximo 1 por sesión y 2 en los primeros 7 días. |
| Guía descartada con «Ahora no» | No insistir durante 14 días; puede abrirse manualmente desde Ayuda. |
| Guía saltada | No volver a abrirla automáticamente. |
| Guía completada | Nunca volver a mostrarla automáticamente, salvo que la persona la reinicie desde Ajustes. |
| Pantalla visitada sin intención | No mostrar nada solo por navegar; esperar una señal útil, como un estado vacío o un toque en «Ver cómo». |
| Acciones de pago, eliminación, permisos o datos personales | Sin spotlight automático; usar copy inline y confirmaciones claras. |

La única excepción razonable es una **única invitación discreta** después de completar el onboarding: «¿Quieres conocer cómo crear tu primera cita?». Las opciones son «Ver guía» y «Ahora no»; ninguna debe bloquear la entrada al dashboard.

## Inventario por pantalla

La tabla cubre las rutas actuales de `apps/mobile/app`. «No guía» significa que no se debe superponer una guía; puede conservar ayuda inline, validación y accesibilidad.

| Grupo y ruta | Necesidad principal | Patrón y objetivo | Disparador seguro |
| --- | --- | --- | --- |
| `/(auth)/login` | Iniciar sesión. | No guía; enlaces claros de recuperar contraseña y registro. | Nunca automático. |
| `/(auth)/register` | Crear cuenta. | Ayuda inline para contraseña, tipo de cuenta y datos solicitados. | Al enfocar un campo con error o tocar el icono de ayuda. |
| `/(auth)/forgot-password`, `reset-password` | Recuperar acceso. | No guía; flujo corto y mensajes de estado. | Nunca automático. |
| `/(onboarding)/account-type` | Elegir negocio o profesional. | Tarjetas con ejemplo breve; sin oscurecer la pantalla. | Primera carga del paso. |
| `/(onboarding)/account-setup` | Entender que inicia la configuración. | Pantalla de bienvenida ya existente; añadir enlace «Qué configuraré». | Toque voluntario. |
| `/(onboarding)/services` | Definir servicios iniciales. | Estado vacío + ayuda inline sobre nombre, duración y precio. | Cuando no hay servicios; no mostrar si ya añadió uno. |
| `/(onboarding)/organization` | Añadir colaboradores. | Sugerencia descartable de «Puedes hacerlo después». | Solo a cuentas de negocio, primera visita y sin colaboradores. |
| `/(onboarding)/business-schedule` | Definir horarios. | Ejemplo inline y explicación de que afecta disponibilidad. | Al abrir el paso, una vez. |
| `/(onboarding)/congratulations` | Finalizar y entrar a operar. | Invitación a ver la guía de primera cita; no iniciar spotlight sin consentimiento. | Tras finalizar correctamente. |
| `/(onboarding)/dashboard` | Descubrir acciones principales. | Tarjeta «Primeros pasos» y guía opcional de 2 pasos: «Nueva cita» y enlace de reservas. | Primera visita post-onboarding o toque en «Ver guía». |
| `/(onboarding)/agenda` | Ver agenda y crear una cita. | Estado vacío con CTA; guía de 2 pasos para selector de fecha y «Nueva cita». | Agenda vacía y toque en «Ver cómo crear una cita». |
| `/(onboarding)/new-booking` | Registrar una cita. | Ayuda inline por campo y progreso visible; no overlay. | Según validación o icono de ayuda. |
| `/(onboarding)/booking-details` | Consultar, editar o cobrar una cita. | Tooltip opcional de acciones secundarias. | Primera cita abierta, solo si la persona toca «Ayuda». |
| `/(onboarding)/reschedule-booking` | Reprogramar. | No guía; el copy actual debe explicar el efecto sobre agenda y cliente. | Nunca automático. |
| `/(onboarding)/booking-settings` | Configurar reserva pública. | Sugerencia en sección de disponibilidad/enlace, no spotlight. | Primera visita, si faltan ajustes requeridos. |
| `/(onboarding)/waitlist` | Gestionar lista de espera. | Estado vacío con ejemplo de uso. | Cuando no existen registros. |
| `/(onboarding)/payment-confirmations` | Revisar pagos. | No guía; es un flujo financiero sensible. | Nunca automático. |
| `/(onboarding)/clients` | Buscar, importar o crear clientes. | Estado vacío para primer cliente; tip descartable sobre pulsación prolongada para selección múltiple. | El tip solo con 5+ clientes y tras el primer uso de la lista. |
| `/(onboarding)/client-detail` | Ver historial y datos. | No guía; hints en acciones de editar, contactar o historial. | Bajo demanda. |
| `/(onboarding)/service-management` | Crear y administrar catálogo. | Estado vacío + spotlight opcional de un paso al botón «Agregar servicio». | Sin servicios y toque en «Ver cómo». |
| `/(onboarding)/team-management`, `equipo` | Invitar y administrar equipo. | Tarjeta explicativa sobre permisos; spotlight opcional de «Agregar colaborador». | Solo propietario/manager con plan y permisos habilitados. |
| `/(onboarding)/collaborator-permissions` | Asignar permisos. | No guía; checklist inline por permiso y enlace «Ver ejemplos». | Toque voluntario. |
| `/(onboarding)/professional-schedule` | Ajustar agenda individual. | Ayuda inline sobre diferencia entre horario profesional y del negocio. | Primera visita de owner/manager. |
| `/(onboarding)/cash-register` | Abrir/cerrar caja y registrar movimientos. | Tarjeta «Cómo funciona la caja»; spotlight únicamente después de tocar «Ver guía». | Nunca automático por ser operación financiera. |
| `/(onboarding)/cash-register-detail`, `daily-report` | Revisar un cierre. | No guía; explicaciones inline de totales y estados. | Toque en icono de información. |
| `/(onboarding)/financial-records`, `business-summary`, `reports` | Analizar resultados. | Leyenda inline y filtros con ejemplos; no recorrer gráficos uno a uno. | Primer informe sin datos o toque en «Cómo leer este reporte». |
| `/(onboarding)/inventory` | Controlar productos. | Estado vacío + guía opcional de un paso a «Agregar producto». | Inventario vacío y permiso para administrarlo. |
| `/(onboarding)/operations` | Revisar pendientes operativos. | No guía; cada tarjeta debe explicar su prioridad. | Nunca automático. |
| `/(onboarding)/location-management` | Gestionar sedes. | Sugerencia contextual al crear primera sede. | Solo cuentas multi-sede elegibles. |
| `/(onboarding)/business-settings`, `profile-edit` | Cambiar identidad y datos del negocio. | Ayuda inline de impacto antes de cambios relevantes, incluida categoría. | Al abrir un selector o antes de guardar. |
| `/(onboarding)/advanced-settings` | Configuración avanzada. | No guía; agrupar y documentar cada opción inline. | Nunca automático. |
| `/(onboarding)/settings` | Encontrar configuración y soporte. | Entrada persistente «Ayuda y guías» + «Repetir guías». | Toque voluntario. |
| `/(onboarding)/notifications` | Gestionar avisos. | Pre-permiso explicativo una vez; abrir permiso nativo solo por toque explícito. | Al activar notificaciones o desde Ajustes. |
| `/(onboarding)/subscription` | Comparar planes. | No guía ni urgencia visual artificial; tabla y explicación de límites. | Toque voluntario. |
| `/(onboarding)/wallet` | Usar saldo o pagos. | Ayuda inline y confirmaciones; no overlay sobre saldos o pagos. | Toque en ayuda. |
| `/(onboarding)/reviews-management` | Solicitar y gestionar reseñas. | Tarjeta descriptiva y CTA; spotlight opcional de compartir enlace. | Tras la primera reseña o toque en «Ver cómo». |
| `/(app)/index`, `agenda`, `operations` | Rutas de aplicación paralelas. | Mantener la misma guía declarada para la función equivalente; no duplicar progreso por ruta. | Hereda el `guideId` funcional, no el pathname. |

## Recorridos iniciales que sí aportan valor

Implementar solo estos cuatro en la primera versión. El resto queda cubierto por estados vacíos, copy inline y acceso manual a ayuda.

### 1. Primera cita (`first-booking`)

**Objetivo:** que la persona pueda registrar su primera cita.

1. Dashboard: resaltar «Nueva cita» — «Registra una cita en pocos pasos.»
2. Agenda: resaltar el selector de fecha — «Revisa el día antes de guardar la cita.»
3. Formulario: no spotlight; texto inline cerca de los datos requeridos.

**Inicio:** invitación explícita en la tarjeta de primeros pasos o estado vacío de Agenda.  
**Fin automático:** se completa al crear una cita, aunque la guía haya sido saltada.

### 2. Reserva pública (`share-booking-link`)

**Objetivo:** que el negocio comparta su enlace de reservas.

1. Dashboard: resaltar la tarjeta «Recibe reservas».
2. Hoja del enlace: resaltar «Compartir» — «Envía este enlace en redes o WhatsApp.»

**Inicio:** al tocar «Ver cómo compartir», nunca solo por abrir el dashboard.  
**Fin automático:** primera acción de compartir o copiar el enlace.

### 3. Primer servicio adicional (`add-service`)

**Objetivo:** que pueda ampliar el catálogo después del onboarding.

1. Servicios: resaltar «Agregar servicio».
2. Formulario: ayuda inline para duración, precio y disponibilidad.

**Inicio:** estado vacío o botón «Ver cómo».  
**Fin automático:** crear un servicio.

### 4. Primer cliente (`add-client`)

**Objetivo:** que registre o importe clientes con intención clara.

1. Clientes: resaltar «Agregar cliente» o «Importar contactos», según contexto.
2. Hoja de importación: explicación breve sobre selección y privacidad, sin overlay.

**Inicio:** estado vacío de clientes.  
**Fin automático:** crear o importar un cliente.

## Arquitectura técnica propuesta

### Decisión para el MVP

Crear un componente propio y pequeño en la app móvil. Ya existen `Modal`, hojas y estilos de overlay; además `react-native-svg` está disponible. Un componente local evita acoplar una dependencia de tours a la navegación y permite que Nava respete controles, navegación inferior, permisos y modales existentes.

No usar `Modal` para el spotlight que debe dejar pulsable el control resaltado: un modal transparente puede capturar todos los toques. El overlay debe renderizarse dentro del árbol de la pantalla, como capa absoluta, con cuatro zonas atenuadas alrededor del objetivo y una zona central con `pointerEvents="none"` para que el botón real siga recibiendo la interacción.

### Componentes sugeridos

```text
src/features/guides/
  guide-types.ts             // ids, pasos, estados y reglas de elegibilidad
  guide-catalog.ts           // definición central de los recorridos
  guide-storage.ts           // persistencia por usuario y organización
  GuideProvider.tsx          // cola, límites de frecuencia y eventos
  GuideAnchor.tsx            // registra el rectángulo de un control por onLayout
  CoachmarkOverlay.tsx       // máscara, burbuja, foco y acciones
  useGuide.ts                // startGuide, completeGuide, dismissGuide, markAction
```

Ejemplo de contrato:

```ts
type GuideStatus = 'unseen' | 'active' | 'snoozed' | 'dismissed' | 'completed';

type GuideProgress = {
  status: GuideStatus;
  completedAt?: string;
  dismissedAt?: string;
  lastShownAt?: string;
  stepId?: string;
};

type GuideDefinition = {
  id: 'first-booking' | 'share-booking-link' | 'add-service' | 'add-client';
  maxAutomaticShows: number;
  requiredCapabilities: readonly string[];
  shouldCompleteFromEvent: (event: ProductEvent) => boolean;
  steps: readonly GuideStep[];
};
```

### Persistencia

Para el MVP, guardar el progreso no sensible con la dependencia ya disponible `expo-secure-store`, usando una clave versionada y acotada:

```text
nava.guide.v1.{organizationId}.{userId}
```

La clave contiene solamente `guideId`, estado y fechas; nunca nombre de cliente, servicio, teléfono ni contenido de una reserva. Cuando se requiera sincronizar la experiencia entre teléfonos, añadir un endpoint y una tabla de preferencias por usuario/organización. La sincronización no es necesaria para validar el MVP.

### Eventos de producto mínimos

Los eventos deben marcar acciones, no datos personales:

```text
guide_offered      { guideId, surface, automatic }
guide_started      { guideId, source }
guide_step_seen    { guideId, stepId }
guide_completed    { guideId, completion: manual|action }
guide_dismissed    { guideId, reason: skip|later|close }
booking_created    { source }
booking_link_shared { source }
service_created    { source }
client_created     { source }
```

Con estos datos se puede medir descubrimiento y abandono sin incluir PII. No instrumentar coordenadas, textos introducidos, nombres, teléfonos ni identificadores de clientes.

## Estados, prioridad y conflictos

Solo puede existir una capa educativa a la vez. El orden de prioridad recomendado es:

```text
error crítico / privacidad / bloqueo de cuenta
> permiso nativo iniciado por el usuario
> confirmación o pago activo
> banner operativo (ubicación, red, suscripción)
> formulario o teclado abierto
> coachmark opcional
> tarjeta de sugerencia
```

Si aparece una condición de prioridad mayor, la guía se pausa y se reevalúa al volver a enfocar la pantalla. Si el objetivo dejó de existir por permisos, plan, orientación o cambio de datos, se cierra sin registrar abandono y se puede ofrecer ayuda manual más tarde.

## Accesibilidad y calidad

- Al abrir la guía, mover el foco de lector de pantalla a la burbuja y anunciar «Guía, paso 1 de 2». Al cerrar, devolver foco al objetivo o al encabezado de la pantalla.
- Las acciones «Siguiente», «Saltar guía» y «Cerrar guía» deben tener etiqueta, rol de botón y área táctil mínima de 44 × 44 puntos.
- No depender solo del color ni de una animación para mostrar el objetivo.
- Respetar tamaño de letra dinámico; si la burbuja no cabe, permitir scroll interno o colocarla arriba/abajo del objetivo.
- Respetar reducción de movimiento: usar aparición/fundido corto, sin pulsos continuos ni zoom.
- Contraste suficiente entre copy, fondo de la burbuja y capa atenuada.
- Probar con TalkBack, VoiceOver, Android de pantalla pequeña, iPhone pequeño, web y teclado cuando corresponda.

## Plan de entrega

### Entrega 1 — Fundamento y ayuda no intrusiva

- Crear catálogo, estado persistido, `GuideProvider`, `GuideAnchor` y tarjeta «Primeros pasos».
- Añadir la entrada manual «Ayuda y guías» y «Repetir guías» en Ajustes.
- Mejorar estados vacíos de Agenda, Clientes, Servicios e Inventario.
- Instrumentar solo los eventos de guía y de finalización de acción.

**Aceptación:** descartar una sugerencia no impide usar ninguna función y no vuelve a mostrarse antes de 14 días.

### Entrega 2 — Dos recorridos de alto valor

- Implementar `first-booking` y `share-booking-link` como opt-in.
- Añadir protección de conflictos con modales, banners, permisos y formularios.
- Añadir pruebas unitarias del motor de elegibilidad y pruebas de UI para saltar/completar.

**Aceptación:** una persona puede completar, saltar o reabrir cada guía; ninguna guía aparece durante un pago, permiso o formulario activo.

### Entrega 3 — Descubrimiento de catálogo y clientes

- Implementar `add-service` y `add-client` desde estados vacíos.
- Evaluar datos agregados de inicio, cierre, finalización por acción y repetición manual.

**Aceptación:** los recorridos solo se ofrecen a roles con permiso y terminan al detectar la acción real correspondiente.

## Métricas de éxito y límites de decisión

Medir por guía:

- porcentaje de personas que inicia, salta, completa manualmente o completa mediante la acción;
- tiempo desde registro hasta primera cita, primer servicio adicional, primer cliente y primer enlace compartido;
- aperturas manuales de «Ayuda y guías»;
- ratio de repetición de guía, como señal de copy o diseño insuficiente;
- número de exposiciones automáticas por usuario, para vigilar spam.

Revisar o retirar una guía si tiene baja finalización, alto porcentaje de cierre inmediato o no mejora la acción que pretende enseñar. Una guía no se conserva solo porque ya fue desarrollada.

## Decisiones a confirmar antes de implementar

1. Confirmar los cuatro recorridos iniciales y dejar el resto como ayuda inline/manual.
2. Confirmar que la tarjeta de «Primeros pasos» es la única invitación automática post-onboarding.
3. Confirmar el límite de 14 días tras «Ahora no» y la opción de no repetir tras «Saltar guía».
4. Definir si el progreso debe sincronizarse entre dispositivos desde el lanzamiento o si basta persistencia local para el MVP.
5. Validar copy y accesibilidad con al menos una persona propietaria de negocio y una profesional independiente antes de lanzar.
