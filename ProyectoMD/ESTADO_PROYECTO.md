# Estado actual del proyecto Nava

> Corte de auditoría: **19 de agosto de 2026**
>
> Rama revisada: `main` (`5a8332c`)
>
> Alcance: código, esquema Prisma, 52 migraciones, configuración, aplicaciones,
> pruebas, builds, documentación y estado de Git.
>
> Estado global: **MVP funcional para piloto controlado, todavía no listo para
> declararse producción estable**.

> Actualización del panel Admin: **26 de agosto de 2026**. El panel está
> publicado en `https://admin.navacloud.app` desde el 21 de agosto de 2026,
> con `nava-admin.service`, HTTPS y el commit `0ead479` verificados entonces.
> El `HEAD` local actual (`457cb26`) es posterior a aquel despliegue e incluye
> avances de Administración de Usuarios y Memberships que todavía requieren
> validación y publicación controlada; no se deben asumir en producción.

> Actualización de políticas y suscripciones: **23 de agosto de 2026**. Esta
> actualización complementa el corte histórico: las reglas vigentes de negocio
> se definen en `Politicas_y_terminos_Nava.md` cuando exista contradicción.

> Corte de implementación de políticas (23 de agosto de 2026): trial de 10
> días, gracia de 3 días exclusiva de planes pagados, recordatorio de renovación
> a 5 días, código fundador, consentimiento de privacidad, opt-in de marketing,
> exportación de cierre CSV/ZIP y control de cookies están implementados
> localmente y requieren desplegar sus migraciones y configuración productiva
> antes de declararlos operativos.

> Actualización de privacidad de clientes: **26 de agosto de 2026**. El commit
> `8c0eeec` implementa y valida la restricción de datos de clientes por rol en
> API y Mobile. No requiere migración de base de datos; sí requiere desplegar
> API y Mobile conjuntamente para que los controles de servidor y la interfaz
> correspondan al mismo modelo de acceso.

### Cierre de PayPhone Botón WEB en suscripciones (25 de agosto de 2026)

- [x] La web comercial está publicada en `https://navacloud.app`, con TLS
      válido. El flujo de planes conserva la selección tras registro/login,
      crea el negocio inicial y dirige al checkout autenticado.
- [x] API Link dejó de ser el mecanismo de suscripciones. El checkout prepara
      el pago con `POST /api/button/Prepare` y el retorno activa el flujo de
      confirmación servidor-a-servidor con `POST /api/button/V2/Confirm`.
- [x] El redirect, parámetros de URL y `POST /v1/webhooks/payphone/platform`
      no pueden activar una suscripción. El webhook solo registra un evento
      auxiliar de auditoría; Confirm autenticado valida la transacción y aplica
      el entitlement idempotentemente.
- [x] Se creó y aprovisionó una aplicación PayPhone Developer de tipo **WEB** para
      `https://navacloud.app`, con respuesta
      `https://navacloud.app/checkout/payphone/confirm`. Su Token y StoreId
      WEB quedaron cifrados con `payphone:platform:configure`; la configuración
      anterior de tipo API sigue separada y no se reutiliza.
- [x] Se completó y validó la compra sandbox: `Prepare`, redirección, `Confirm`,
      factura `PAID`, intento `APPLIED`, suscripción `ACTIVE` e idempotencia de
      refresh. La allowlist `PLATFORM_PAYPHONE_WEBHOOK_ALLOWED_IPS` sigue como
      control opcional de auditoría, no como autoridad de pago.
- [ ] Producción exige credenciales WEB propias, validación controlada y
      autorización operativa independientes; no se infiere de la prueba sandbox.

### Validación del corte de políticas (23 de agosto de 2026)

- [x] `pnpm typecheck`: 17 tareas correctas en 12 paquetes.
- [x] `pnpm --filter @barber-saas/validation test`: 25 pruebas aprobadas.
- [x] `pnpm --filter @barber-saas/web build`: incluye la ruta estática
      `/tratamiento-de-datos`.
- [x] `pnpm test:e2e`: 6/6 escenarios aprobados en Chromium móvil y escritorio,
      incluidos banner de cookies y página pública de privacidad.
- [x] En la VPS (24 de agosto) se aplicaron `20260823150000_privacy_consent` y
      las migraciones de suscripciones pendientes. Los valores
      `PLATFORM_PRIVACY_POLICY_VERSION`, `PLATFORM_MARKETING_POLICY_VERSION` y,
      si se usa analítica, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, requieren revisión
      operativa antes de declararlos públicos.
- [~] El módulo propio de facturación SRI está desplegado en TEST con migraciones
  y validación XSD local. Siguen pendientes la comprobación del certificado
  `.p12` como usuario de servicio, los datos fiscales definitivos, la
  homologación SRI y la prueba SMTP real. PayPhone productivo, backups 30/90
  y ensayo de restauración tampoco se pueden certificar desde el repositorio.

### Actualización de despliegue SRI TEST (24 de agosto de 2026)

- [x] Se desplegó `main` en la VPS (`/opt/nava/app`) y se aplicaron las nueve
      migraciones pendientes, incluidas `20260823180000_sri_electronic_invoicing`
      y `20260824100000_sri_issuer_snapshots_and_xsd_validation`. `pnpm db:status`
      confirmó el esquema actualizado.
- [x] `pnpm build` completó para API, Web y Admin. El primer fallo ocurrió porque
      `prisma generate` se ejecutó antes de actualizar el repositorio; al
      regenerar el cliente después del pull, el build fue correcto.
- [x] `nava-api.service` quedó activo y
      `curl http://127.0.0.1:4000/health` respondió `{"status":"ok"}`.
- [x] El certificado `.p12` se instaló fuera del repositorio en
      `/etc/nava/secrets/sri/`, con directorio `0750 root:nava` y archivo
      `0640 root:nava`.
- [x] El error de arranque posterior se diagnosticó como un valor no numérico en
      `SRI_TAX_BASIS_POINTS`. Se retiró el placeholder y la API volvió a iniciar.
      Hasta confirmar los datos tributarios, la emisión debe seguir en
      `SRI_EMISSION_ENABLED=false`, `SRI_ENV=test` y
      `SRI_PRODUCTION_ENABLED=false`.
- [ ] Falta comprobar el `.p12` con el proceso `nava`, confirmar la configuración
      fiscal, probar SMTP y emitir una única factura controlada contra SRI TEST.
      No hay autorización para producción.

Este documento es la fuente de verdad del estado vigente. Sustituye la antigua
bitácora cronológica: una función se considera terminada solo cuando existe en
el código actual y tiene evidencia proporcional a su riesgo.

## Cómo leer el estado

- **Completo:** implementado y con evidencia automatizada suficiente para su
  alcance actual.
- **Funcional:** implementado, pero requiere más integración, E2E o aceptación
  manual antes de producción.
- **Parcial:** existe una parte utilizable, pero faltan requisitos relevantes.
- **Pendiente:** no existe una implementación operativa.
- La evidencia externa histórica (VPS, Google Play, FCM o Google Cloud) se
  identifica como tal cuando no pudo revalidarse desde este repositorio.

## Resumen ejecutivo

| Área                         | Estado                | Situación actual                                                                                                                                                                                                                          |
| ---------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquitectura y monorepo      | Completo              | pnpm/Turborepo, TypeScript estricto, CI, cuatro aplicaciones y paquetes compartidos.                                                                                                                                                      |
| Autenticación y multi-tenant | Funcional             | Registro y OTP, sesiones opacas, recuperación, onboarding, roles y aislamiento por organización implementados. Las integraciones PostgreSQL no se ejecutaron en este corte.                                                               |
| Operación de barbería        | Funcional             | Equipo, servicios, horarios, agenda, Caja, comisiones, inventario, reportes y notificaciones tienen API y UI móvil. Clientes aplica acceso mínimo por rol: ficha completa solo para owner/manager; teléfono enmascarado para recepción/barbero. |
| Reserva pública              | Funcional             | Catálogo, disponibilidad, OTP, política, idempotencia, gestión por token, reseñas y recordatorios implementados.                                                                                                                          |
| Comercio de productos        | Parcial               | Catálogo, carrito, pedidos, reserva de stock, PayPhone y gestión operativa existen; faltan endurecimiento público y pruebas específicas.                                                                                                  |
| Planes y suscripciones       | Funcional en TEST     | Trial, plan Free, límites, feature flags y checkout WEB Prepare/Confirm están validados en sandbox. Producción requiere credenciales WEB y aceptación separadas.                                                                          |
| Panel interno                | Funcional, desplegado | Admin está publicado con login/OTP, servicio y HTTPS. El árbol actual añade navegación Usuario↔Organización y administración de Memberships posteriores al commit desplegado; faltan validación autenticada y despliegue de esos avances. |
| Calidad                      | Bloqueada             | Esquema, tipos, pruebas, E2E básico y builds pasan; lint y formato global fallan. Se omitieron 28 pruebas PostgreSQL.                                                                                                                     |
| Producción                   | Piloto                | Hay evidencia histórica de API/Web en VPS, Neon, TLS, FCM y Maps. No se revalidaron hoy servicios, migraciones productivas ni recorrido completo.                                                                                         |
| Android                      | Preparado             | `0.1.12` / code `34` está compilado y archivado; falta registrar su publicación y comprobar la versión recibida desde Play.                                                                                                               |

## Estado del repositorio auditado

- Monorepo privado con Node.js 24, pnpm 11 y Turborepo 2.
- Aproximadamente 200 archivos fuente, migraciones y pruebas versionados, con
  unas 64.500 líneas en `apps`, `packages` y `tests`.
- Cuatro aplicaciones:
  - `apps/api`: Fastify 5, Prisma 7.8 y PostgreSQL.
  - `apps/mobile`: Expo 57, React Native 0.86 y Expo Router.
  - `apps/web`: Next.js 16 para reservas, gestión pública y catálogo.
  - `apps/admin`: Next.js 16 para operación interna de Nava.
- Paquetes compartidos para base de datos, validación, permisos, cliente HTTP,
  configuración, dominio, tokens de diseño y utilidades de prueba.
- El corte histórico de 19 de agosto contenía cambios locales sin commit en el
  panel administrativo. Al 26 de agosto el árbol local está limpio; aun así,
  sus cambios posteriores a `0ead479` no se deben asumir desplegados hasta
  publicar el commit revisado y ejecutar la aceptación funcional.

## Arquitectura vigente

```text
Mobile / Web pública / Admin
             |
             v
       API Node + Fastify
             |
             v
      PostgreSQL + Prisma
```

- La API propia es la única frontera de datos para Mobile, Web y Admin.
- El tenant se deriva de la sesión y de la membresía activa; no se confía en un
  `organizationId` arbitrario enviado por el cliente.
- PostgreSQL usa restricciones, transacciones y bloqueos para las invariantes
  críticas: doble reserva, Caja abierta, comisiones, stock y pedidos.
- El cliente Prisma se genera desde `packages/database/prisma/schema.prisma`.
- El repositorio contiene **52 migraciones** ordenadas entre
  `20260718190000_initial_identity_and_tenancy` y
  `20260817210000_assign_services_to_active_barbers`.
- Supabase Auth, RLS, Storage, RPC y Realtime no forman parte de la arquitectura
  actual. La carpeta `supabase` no es la autoridad de ejecución.
- La sincronización de agenda entre dispositivos usa eventos persistentes y
  polling incremental; no usa Realtime.

## Estado por fase del MVP

### Fase 0 — Base técnica: funcional

- [x] Workspaces pnpm, Turborepo, TypeScript estricto, ESLint, Prettier y CI.
- [x] Aplicaciones API, Mobile, Web y Admin, más paquetes compartidos.
- [x] PostgreSQL local y de pruebas definidos en `compose.yaml`.
- [x] Variables documentadas en `.env.example`, sin secretos de servidor.
- [x] Pipeline CI con calidad, build, Playwright y PostgreSQL aislado.
- [ ] Recuperar el gate local de lint y formato; hoy no cumple la Definition of
      Done aunque los comandos existan.
- [x] Actualizar `README.md`, `docs/product/mvp-scope.md` y
      `docs/testing/strategy.md` con el alcance y las pruebas vigentes.

### Fase 1 — Identidad, organización y onboarding: funcional

- [x] Registro temporal y verificación OTP por correo antes de crear la cuenta.
- [x] El registro exige aceptar la Política de Privacidad, guarda usuario,
      fecha y versión de esa aceptación, e integra en ella la declaración de
      mayoría de edad o capacidad legal. No existe checkbox separado de edad.
- [x] Página pública local `/tratamiento-de-datos` con contactos para derechos,
      eliminación, portabilidad, marketing y cookies; debe desplegarse en el
      dominio público antes de comunicarla como operativa.
- [x] Normalización y unicidad de correo y teléfono; disponibilidad previa al
      registro y límites de intentos/frecuencia.
- [x] Contraseñas derivadas con `scrypt`; tokens opacos almacenados como hash.
- [x] Login, logout, restauración, recuperación y cambio de contraseña.
- [x] Sesión con duración máxima e inactividad de siete días en backend.
- [x] Onboarding transaccional de cuenta, organización, sede, colaboradores y
      servicios; continuidad después de reiniciar la app.
- [x] Cierre/eliminación de cuenta con validaciones, anonimización, baja
      lógica y auditoría. Correo y teléfono se conservan únicamente como hashes
      irreversibles durante 90 días para impedir el re-registro inmediato; los
      hashes vencidos se purgan al validar un nuevo registro.
- [x] Sesión móvil persistida con Secure Store.
- [ ] Reejecutar la integración PostgreSQL aislada de autenticación,
      onboarding y multi-tenant en el corte de liberación.

### Fase 2 — Equipo, servicios y horarios: funcional

- [x] Roles base `owner`, `manager`, `receptionist` y `barber` aplicados por la
      API.
- [x] Invitaciones por correo con token, vencimiento, aceptación y auditoría.
- [x] Alta, edición y baja de equipo; perfiles reclamables antes de aceptar.
- [x] Categorías, servicios, precio, duración, imagen y asignación por
      profesional.
- [x] Horarios semanales del negocio y del profesional, bloqueos y sede.
- [x] Gestión móvil de servicios, equipo, roles base, ubicación y horarios.
- [ ] Los “permisos personalizados” no existen: la pantalla cambia perfiles
      base y `Membership` no almacena capacidades individuales.

### Fase 3 — Agenda: funcional

- [x] Disponibilidad por sede, zona horaria, jornada, bloqueos, servicios y
      citas existentes.
- [x] Creación, reprogramación, cancelación y transición de estados.
- [x] Servicios de la cita conservados como snapshot de precio y duración.
- [x] Exclusión PostgreSQL contra solapamiento de citas del mismo profesional.
- [x] Eventos incrementales y refresco móvil entre dispositivos.
- [x] Flujos móviles de agenda diaria, nueva cita, detalle y reprogramación.
- [ ] Repetir pruebas de concurrencia con PostgreSQL real y validar Agenda en
      un Android distribuido por el track objetivo.

### Fase 4 — Reservas públicas: funcional

- [x] URL pública por organización/sede, catálogo, equipo, productos, reseñas
      visibles y disponibilidad en tiempo real.
- [x] Selección de varios servicios y profesional obligatorio.
- [x] Aceptación y versionado de política de reserva.
- [x] Idempotencia por cabecera y restricción única en PostgreSQL.
- [x] OTP de seis dígitos por correo, expiración, máximo de intentos y liberación
      automática del horario no verificado.
- [x] Token privado para consultar, confirmar asistencia, cancelar,
      reprogramar y reseñar.
- [x] Reconfirmación, plazo y acción por falta de respuesta configurables.
- [x] Valores predeterminados alineados con la política: recordatorio 24 h,
      reconfirmación con plazo de 6 h, conservación de la cita sin respuesta y
      cancelación/reprogramación hasta 2 h antes; cada negocio puede cambiarlos.
- [x] Proxy Web de mismo origen limitado a rutas públicas para evitar exponer
      la URL interna de la API.
- [x] Límites en memoria por IP para catálogo, disponibilidad, creación,
      verificación y gestión.
- [ ] No hay CAPTCHA, huella de dispositivo, reputación de cliente ni regla de
      una única reserva futura configurable.
- [ ] No existe el abono configurable por reserva/servicio ni saldo a favor por
      cancelación. `downPaymentPercentage` se captura durante onboarding, pero no
      hay un flujo transaccional completo que lo aplique a la reserva.
- [ ] Ejecutar el recorrido real Web → OTP → gestión → móvil contra el entorno
      que se vaya a liberar; el E2E actual solo cubre la página inicial.

### Fase 5 — Clientes e historial: parcial

- [x] Directorio, búsqueda, alta, edición, importación de contactos, etiquetas
      y eliminación lógica.
- [x] Historial de citas, notas y fotos privadas asociadas a notas.
- [x] Las notas operativas rechazan expresiones claras de salud, historial
      clínico y biometría. Es una salvaguarda de interfaz, no sustituye la
      prohibición contractual ni una revisión humana de contenido sensible.
- [x] Exportación y eliminación múltiple desde Mobile.

#### Actualización: protección de datos de clientes por rol — completa en código (26 de agosto de 2026)

La decisión aprobada distingue los roles operativos de una barbería del
`platform_admin` de Nava. El principio aplicado es **mínimo privilegio**: la
interfaz no ofrece una acción cuando el rol no la necesita, y la API vuelve a
validar permiso, organización y alcance antes de devolver o modificar datos.

| Rol | Alcance de clientes | Datos de contacto | Acciones permitidas |
| --- | --- | --- | --- |
| `owner` | Todos los clientes de su organización | Ficha completa, incluido teléfono | CRUD, etiquetas, notas, importación, comunicación y exportación CSV. |
| `manager` | Todos los clientes de su organización | Ficha completa, incluido teléfono | CRUD, etiquetas, notas, importación y comunicación. No exporta. |
| `receptionist` | Solo clientes con citas en sus sucursales asignadas | Teléfono enmascarado; correo, dirección, documento, fecha de nacimiento, notas y etiquetas no se entregan | Consulta limitada. No crea, edita, elimina, importa, exporta, etiqueta, comunica ni consulta/gestiona notas. |
| `barber` | Solo clientes de citas asignadas a su propia membresía | Teléfono enmascarado; el resto de PII sensible no se entrega | Consulta limitada y lectura/creación de sus propias notas. No puede editar ni eliminar notas de terceros, ni gestionar clientes, etiquetas, importaciones, comunicaciones o exportaciones. |
| `platform_admin` | Operación interna de plataforma; no es rol normal de una organización | PII enmascarada en el panel | No recibe acceso ordinario a fichas completas de clientes de las barberías. |

Controles implementados:

- [x] Catálogo compartido de permisos `client.*` en `@barber-saas/permissions`.
  Se separan consulta de directorio/ficha, contacto completo o enmascarado,
  PII, CRUD, notas, etiquetas, importación, exportación y comunicación.
- [x] Contexto de acceso de clientes calculado en API a partir de la sesión y
  membresía activa: organización, rol, membresía y sedes asignadas. No se
  acepta un `organizationId` o alcance arbitrario desde Mobile.
- [x] Filtro de datos en servidor para listado y detalle. Las respuestas de
  recepción y barbero no contienen el teléfono original ni PII no autorizada;
  el teléfono queda limitado a sus últimos cuatro dígitos.
- [x] Restricción de búsquedas: los roles con contacto enmascarado no pueden
  usar teléfono como criterio de búsqueda.
- [x] Alcance relacional en servidor: recepción queda limitada a citas de sus
  sedes y barbero a citas con su propia `membershipId`. La misma regla se
  aplica al seleccionar un cliente existente durante la creación de una cita.
- [x] Agenda endurecida con el alcance de sede/membresía y serialización de
  clientes sin contacto completo para roles restringidos. El flujo público de
  reservas conserva explícitamente la respuesta de gestión necesaria para su
  titular, sin convertirlo en acceso de colaboradores.
- [x] Notas protegidas en API: barbero solo puede leer y crear sus notas sobre
  clientes que le correspondan; owner y manager mantienen la gestión completa.
- [x] Exportación trasladada al endpoint autenticado
  `POST /v1/clients/export`. Solo `owner` puede exportar hasta 500 clientes;
  el CSV se construye en backend, protege contra inyección de fórmulas y deja
  el evento `client.export.created` sin valores PII en la auditoría.
- [x] Mobile adapta menú, acciones masivas, formularios, etiquetas, detalle,
  notas, alta rápida desde nueva cita y recordatorios de WhatsApp según la
  capacidad del rol. La exportación cliente-side fue eliminada.
- [x] La clave de caché de Mobile incluye el rol activo y el cambio de rol
  invalida las respuestas previas, evitando mostrar datos cargados con una
  capacidad superior.

Evidencia local del cambio `8c0eeec`:

| Validación | Resultado |
| --- | --- |
| Pruebas API | 59 aprobadas; 32 omitidas por no configurar `TEST_DATABASE_URL`. Incluye enmascaramiento, respuestas de agenda y alcance de recepción/barbero. |
| Pruebas Mobile | 28 suites y 84 pruebas aprobadas. |
| Pruebas de permisos | 6 aprobadas. |
| Cliente API | 2 pruebas aprobadas. |
| Typecheck | API, Mobile, permisos y cliente API aprobados. |
| Calidad específica | ESLint de los archivos modificados, build de API y `git diff --check` aprobados. |

Pendientes específicos antes de ampliar este módulo:

- [ ] Ejecutar las pruebas de integración de autorización contra una base
      PostgreSQL aislada en CI o en el corte de despliegue.
- [ ] Añadir paginación, límites de frecuencia y métricas de seguridad a las
      consultas y exportación de clientes si el volumen del piloto lo exige.
- [ ] Mantener cualquier acceso excepcional de soporte como flujo explícito,
      temporal y auditado; no conceder fichas completas a `platform_admin` por
      defecto.

- [x] Tras cerrar un negocio, la persona propietaria puede descargar durante
      30 días desde Ajustes un CSV de datos o un ZIP con datos e imágenes
      disponibles; el acceso no reactiva el negocio cerrado.
- [x] Reutilización de cliente por teléfono dentro del alcance implementado.
- [ ] No existe deduplicación asistida ni barbero preferido persistente.
- [ ] Las imágenes se guardan como `data:`/base64 en PostgreSQL; no existe
      almacenamiento de objetos con URLs firmadas como exigía el alcance inicial.
- [ ] Bloqueo de clientes, venta desde la ficha y acciones de notificación
      siguen marcadas “Próximamente” en la UI.

### Fase 6 — Caja y POS: funcional con alcance limitado

- [x] Apertura y una sola Caja abierta por alcance operativo.
- [x] Ventas de citas y manuales, productos, depósitos, otros ingresos, gastos,
      retiros y pagos de comisiones/anticipos.
- [x] Cierre con efectivo esperado, contado, diferencia, historial y auditoría.
- [x] El método de pago controla si un movimiento afecta efectivo.
- [x] Venta de producto y movimiento de stock unidos transaccionalmente.
- [ ] Una cita exige cobro completo con un solo método; no hay pagos parciales,
      saldos ni división entre varios métodos.
- [ ] La UI anuncia crear ventas desde la ficha de cliente, pero esa entrada
      específica todavía no está conectada.

### Fase 7 — Comisiones y anticipos: funcional

- [x] Reglas porcentuales/fijas, cálculo backend, snapshots e idempotencia.
- [x] Comisión automática al cobrar citas y venta manual comisionable.
- [x] Reversión auditable sin borrar el asiento original.
- [x] Anticipos, liquidaciones, aprobación, cancelación y pago.
- [x] Visibilidad del profesional limitada a sus propios importes.
- [x] Productos excluidos de comisión por decisión vigente del MVP.
- [ ] Revalidar concurrencia y ciclo completo de liquidación con la suite
      PostgreSQL habilitada antes de usarlo para pagos reales.

### Fase 8 — Inventario y pedidos: parcial

- [x] Productos, costo/precio, SKU/código, imagen, stock por sede, mínimo,
      ajustes, movimientos y alertas.
- [x] La venta en Caja descuenta stock y deja movimiento auditable.
- [x] Catálogo público con carrito y checkout para tarjeta/PayPhone,
      transferencia o pago al retirar.
- [x] Pedidos persistentes con estados `PENDING_PAYMENT`, `RESERVED`, `PAID`,
      `READY_FOR_PICKUP`, `FULFILLED`, `EXPIRED` y `CANCELLED`.
- [x] Reserva transaccional de unidades, bloqueo de filas y liberación automática
      por cancelación, fallo de PayPhone o vencimiento.
- [x] Gestión de pedidos desde la pantalla móvil de Inventario.
- [ ] La creación pública de pedidos no tiene clave de idempotencia ni rate
      limiting propios y no tiene pruebas unitarias/integración dedicadas.
- [ ] No hay carga de comprobante para transferencia; el negocio confirma el
      pago de forma manual.
- [ ] Corregir textos residuales “Pedido de demostración” y “checkout real” en
      una interfaz que ya crea pedidos persistentes.

### Fase 9 — Notificaciones: funcional

- [x] Bandeja interna, estados leída/no leída y tokens por dispositivo.
- [x] Cola persistida en `AppNotification`, hasta cinco intentos y backoff.
- [x] Correo SMTP y FCM HTTP v1 directo; no se usa Expo Push.
- [x] Eventos de creación, cancelación y reprogramación pública, con navegación
      a la fecha de la cita.
- [x] Recordatorios y reconfirmación pública procesados cada minuto.
- [x] Existe evidencia histórica de una entrega FCM real desde la VPS.
- [ ] No hay WhatsApp real, por decisión de alcance.
- [ ] Falta observabilidad externa de la cola y alertas sobre fallos agotados.

### Fase 10 — Reportes: funcional

- [x] Resumen de negocio, control diario y movimientos.
- [x] Ventas, cobros por método, gastos, depósitos, productos, profesionales,
      comisiones y cierres.
- [x] Filtros por fecha/sede, zona horaria, paginación y exportación CSV/Share.
- [x] Reseñas e inventario bajo enlazados desde Reportes.
- [ ] “Préstamos a clientes” no está implementado y queda fuera del MVP; la UI
      todavía lo muestra como pendiente de definición y debe ocultarse o aclararse.

### Fase 11 — Planes y límites: funcional, pendiente de habilitación externa

- [x] Planes `free`, `essential`, `local` y `multi` con límites y feature flags.
- [x] Nava Esencial habilita inventario y reportes completos para operación
      individual, además de reservas y clientes ilimitados. Conserva el límite
      de un profesional y una sucursal; equipo, comisiones y múltiples sedes
      comienzan en Nava Local.
- [x] La migración `20260826160000_essential_inventory_full_reports` actualiza
      el catálogo persistido y las suscripciones Esencial existentes reciben
      los nuevos entitlements sin recompra ni modificación del período pagado.
- [x] Trial de 10 días; al finalizar pasa directamente a Nava Free. Los planes
      pagados tienen 3 días de gracia y, ante impago, bajan automáticamente a
      Nava Free sin eliminar datos.
- [x] Límites backend para profesionales, sedes, clientes y reservas móviles.
- [x] Nava Free limita a 25 reservas en los últimos 30 días. Al terminar Demo,
      trial o un plan pagado, conserva datos sin borrar: deja un profesional
      operativo y marca los demás como históricos; API y app móvil bloquean sus
      nuevas reservas, disponibilidad en línea, edición operativa y asignación
      de servicios, mientras la interfaz los mantiene visibles con opacidad.
      La pantalla Suscripción muestra el uso real, el límite de 25 reservas y
      la explicación de los datos históricos. Para evitar confundir Nava
      Esencial con Free, separa las inclusiones reales del plan adquirido
      (reservas/clientes ilimitados, agenda, servicios, historial, caja,
      inventario y reportes completos) de los módulos de equipo, comisiones y
      múltiples sedes que requieren Nava Local.
- [x] Refuerzo de degradación Free: Caja sólo permite seleccionar profesionales
      habilitados; inventario y ventas/comisiones premium quedan inactivos o
      redirigen a Suscripción. La importación y alta manual de clientes respetan
      el máximo de 100 también bajo solicitudes concurrentes, mediante un bloqueo
      transaccional por organización.
- [x] Migración `20260823170000_free_booking_limit_25` actualiza el límite del
      plan existente sin modificar reservas, profesionales ni historial.
- [x] Panel interno para cambiar plan, suspender, reactivar y conceder soporte.
- [x] La app Android solo consume el estado y no enlaza un checkout externo.
- [x] Checkout Web autenticado para suscripciones Nava con PayPhone Botón WEB,
      Prepare/Confirm, idempotencia, validación verificable y auditoría;
      validado de punta a punta en sandbox. Producción sigue pendiente de su
      configuración y autorización separadas.
- [x] Promoción de fundador para Nava Local: el checkout en
      `navacloud.app/suscripciones` acepta un código configurable sólo en el
      servidor (`PLATFORM_FOUNDER_PROMOTION_CODE`), aplica USD 19,93 como valor
      final, registra la factura y conserva el beneficio mientras haya
      continuidad mensual. El vencimiento del período de gracia lo revoca de
      forma irreversible.
- [x] Migraciones `20260823110000_subscription_policy_10_day_trial` y
      `20260823120000_founder_promotion_code` actualizan trials vigentes y
      persisten el historial de la promoción.
- [ ] Falta habilitar credenciales PayPhone WEB de producción, configurar el
      código fundador en producción y realizar su validación controlada.
- [x] Aviso de vencimiento cinco días antes: proceso horario por correo SMTP,
      con registro persistente para no duplicar envíos y texto que aclara la
      renovación manual.
- [ ] Facturación electrónica por correo: existe una base propia para facturar
      exclusivamente Nava → negocio suscriptor: perfil y snapshot de comprador,
      secuencial transaccional, clave de acceso, XML de factura 2.1.0,
      firma XAdES_BES, recepción/autorización SOAP, RIDE, cola persistente e
      intento de envío SMTP. No se considera operativa ni completa hasta validar
      XML contra los XSD oficiales en ejecución, instalar un `.p12`, confirmar
      régimen/impuestos/forma de pago con contador y lograr homologación SRI +
      correo real. No factura Caja, productos ni servicios de las barberías.
- [x] Marketing Nava con opt-in explícito: desmarcado por defecto en el
      registro, consentimiento versionado y fechado, y baja posterior desde
      Ajustes. Los avisos operativos permanecen fuera de esta preferencia.
- [x] Banner Web de cookies: Aceptar, Rechazar y Configurar ofrecen decisiones
      equivalentes; GA4 solo se inserta después del consentimiento y si existe
      `NEXT_PUBLIC_GA_MEASUREMENT_ID` en producción.
- [ ] El endpoint de simulación sigue siendo parte de la operación del MVP y no
      sustituye un sistema de cobro.

#### Facturación SRI propia — parcial, desplegada en TEST y pendiente de validación externa (24 de agosto de 2026)

- [x] Se reutiliza `SubscriptionInvoice` como snapshot comercial y
      `SubscriptionPaymentAttempt` como pago verificable. `SriInvoice` es el
      comprobante fiscal distinto, restringido de forma única a un pago de
      suscripción; evita facturas duplicadas cuando PayPhone o el worker se
      reintentan.
- [x] La migración `20260823180000_sri_electronic_invoicing` agrega perfil de
      facturación por organización, secuencias fiscales concurrentes y el
      comprobante con snapshots de comprador, plan, importes, impuestos, XML,
      RIDE, autorización, errores y entrega. Tiene `rollback.sql`.
- [x] La emisión queda desacoplada de activar el plan: un pago aplicado conserva
      la suscripción activa aunque SRI, red o SMTP fallen. El worker PostgreSQL
      retoma facturas pendientes sin Redis ni otro proveedor adicional.
- [x] La clave de acceso tiene 49 dígitos, usa el módulo 11 y el secuencial se
      reserva con una operación atómica por tipo/establecimiento/punto de
      emisión; no usa `MAX(secuencial) + 1`.
- [x] Se construye factura XML `2.1.0`, se firma en backend como XAdES_BES
      enveloped con certificado PKCS#12 y RSA-SHA1, y se usan los WS directos
      offline de recepción y autorización del SRI por ambiente `test` o
      `production`. No se integra un proveedor externo ni se fija el TLS del
      SRI en código.
- [x] Tras autorización se conserva XML autorizado, se genera un RIDE PDF
      mínimo y se entrega XML + RIDE por SMTP. El estado fiscal y la entrega de
      correo se persisten por separado; un reenvío no emite otro comprobante.
- [x] API de propietario: configurar datos de facturación, listar comprobantes,
      descargar XML/RIDE autorizado y solicitar reenvío. El perfil pertenece a
      la organización suscriptora y nunca a los clientes finales de barberías.
- [x] Configuración nueva: `SRI_ENV` (por defecto `test`),
      `SRI_EMISSION_ENABLED`, `SRI_PRODUCTION_ENABLED`, datos fiscales reales
      del emisor (Nava es la marca comercial), régimen, impuestos, forma de
      pago, ruta/contraseña del certificado y espera de autorización. Producción
      requiere la doble activación explícita.
- [x] Evidencia local: pruebas unitarias de módulo 11, clave de acceso,
      secuencial, montos y XML; pruebas API 37 aprobadas (30 omitidas por no
      disponer de `TEST_DATABASE_URL`); typecheck, build API, lint modificado y
      `prisma validate` correctos.
- [x] El XML se valida antes de firmar mediante el XSD oficial local de factura
      2.1.0; el esquema no se descarga durante la ejecución. La emisión conserva
      snapshots fiscales del emisor, limita reintentos y bloquea el procesamiento
      concurrente de una misma factura.
- [ ] No existe aún evidencia contra el certificado instalado ni contra el SRI
      de certificación; no declarar que el comprobante es aceptado hasta completar
      una factura controlada en TEST y la entrega por SMTP.
- [ ] Falta la pantalla Mobile/Web de "Mis facturas" y la vista global de
      diagnóstico/reintento para `platform_admin` en Nava Control Center. La
      API de propietario ya existe, pero no sustituye esas interfaces.
- [ ] Antes de habilitar emisión: confirmar con contador el régimen, IVA/códigos
      SRI y forma de pago; comprobar el `.p12` como usuario `nava`; probar
      recepción → autorización → RIDE → SMTP con una sola factura en
      `SRI_ENV=test`; solo después, en una tarea independiente, evaluar producción
      con `SRI_PRODUCTION_ENABLED=true`.

### Fase 12 — Panel interno: funcional, desplegado con avances pendientes

- [x] Acceso limitado por `PLATFORM_ADMIN_EMAILS`, login y segundo factor OTP.
- [x] El 21 de agosto de 2026 se desplegó `https://admin.navacloud.app` con
      `nava-admin.service` en el puerto local `3001`, Nginx/Certbot y el commit
      `0ead479`. La base registraba 58 migraciones aplicadas. Esta es evidencia
      histórica de despliegue, no una comprobación realizada el 26 de agosto.
- [~] Continuación Super Admin (código local al 26 de agosto de 2026): Usuarios
  Nava incluye listado global paginado,
  búsqueda/filtros en backend, PII enmascarada, ficha 360°, consulta de
  Memberships, suspensión/reactivación, revocación total de sesiones y
  solicitud segura de recuperación de contraseña. El árbol actual también
  incluye navegación Usuario↔Organización y administración de Memberships.
  La migración
  `20260823160000_platform_user_administration` agrega el estado de
  suspensión; confirmar su estado con `pnpm db:status` antes del despliegue.
  Falta validación contra PostgreSQL real y la aceptación de roles, PII y los
  flujos operativos antes de publicar esta continuación.
- [x] Métricas, organizaciones, plan, trial, uso, errores de notificación,
      auditoría y diagnóstico de soporte sin suplantación.
- [x] Acciones de cambio de plan, suspensión y reactivación auditadas.
- [x] Filtros por búsqueda, estado, plan y vencimiento de prueba.
- [~] Billing de plataforma (desplegado y validado operativamente el 26 de
  agosto de 2026): existe una sección global de Suscripciones exclusiva para
  Billing/Super Admin. Consulta datos reales en tiempo real de
  la suscripción, la última factura, el último intento de pago y los tres
  cambios más recientes, con filtros backend; no expone URLs, referencias ni
  secretos de PayPhone, y no simula cobros. La vista distingue el inicio y
  vencimiento del período activo; falta completar un historial transaccional
  íntegro por organización.
- [x] Rediseño responsive “Nava Control Center”, partículas con Anime.js y
      actualización manual de datos.
- [ ] Completar revisión visual autenticada en escritorio/móvil, Axe y los
      casos de aceptación de roles, PII, incidencias y auditoría.
- [ ] Desplegar de forma controlada el commit posterior a `0ead479` que contiene
      Usuarios Nava, navegación y Memberships, y registrar el commit,
      migraciones y aceptación resultantes.

### Fase 13 — Estabilización: pendiente

- [x] Typecheck y builds del monorepo.
- [x] E2E básico de home Web en móvil y escritorio, con comprobación Axe de
      infracciones críticas/serias.
- [x] Prueba de humo de rendimiento disponible en
      `tests/performance/api-smoke.mjs`.
- [ ] Corregir lint y formato.
- [ ] Ejecutar las 28 integraciones PostgreSQL omitidas.
- [ ] Añadir E2E de registro/OTP, agenda, reserva pública, Caja, inventario,
      pedidos, suscripción y panel interno.
- [ ] Hacer revisión de seguridad y autorización multi-tenant por todos los
      endpoints nuevos, no solo por el núcleo inicial.
- [ ] Ejecutar carga/concurrencia de agenda, Caja, comisiones y stock.
- [ ] Ensayar restauración de Neon, documentar RPO/RTO y verificar backups.
- [ ] Completar accesibilidad, errores de red, observabilidad y aceptación en
      dispositivos físicos.

## Evidencia de calidad del corte

Comandos ejecutados el 19 de agosto de 2026 sobre el árbol local actual:

| Comando                                 | Resultado              | Evidencia                                                                          |
| --------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| `pnpm db:validate`                      | Aprobado               | El esquema Prisma es válido.                                                       |
| `pnpm typecheck`                        | Aprobado               | 17 tareas correctas en 12 paquetes.                                                |
| `pnpm test`                             | Aprobado con omisiones | 60 pruebas aprobadas y 28 integraciones PostgreSQL omitidas.                       |
| `pnpm build`                            | Aprobado               | API, Web, Admin, paquetes y export Web de Mobile generados.                        |
| `pnpm test:e2e`                         | Aprobado               | 4/4 pruebas de home Web en Chromium móvil/escritorio.                              |
| `pnpm format:check`                     | Fallido                | El escaneo global reportó 297 archivos, incluidos artefactos locales no ignorados. |
| `pnpm lint`                             | Fallido                | Mezcla errores reales con `.tools`, `.eas-archive` y artefactos Android.           |
| ESLint de fuente sin archivos generados | Fallido                | 98 errores y 1 advertencia.                                                        |
| `pnpm test:performance`                 | No ejecutado           | Requiere una API objetivo levantada y datos controlados.                           |

Desglose de pruebas aprobadas:

- API: 22 aprobadas; 28 integraciones omitidas por no disponer de
  `TEST_DATABASE_URL` aislada en esta sesión.
- Mobile: 4 suites, 6 pruebas.
- Admin: 4 pruebas.
- Validación: 21 pruebas.
- Permisos: 5 pruebas.
- Cliente API: 2 pruebas.
- Playwright: 4 pruebas.

Concentración actual del lint de fuente:

| Archivo/área                                      |            Errores |
| ------------------------------------------------- | -----------------: |
| `apps/mobile/app/(onboarding)/dashboard.tsx`      |                 54 |
| `apps/mobile/src/components/BottomNavigation.tsx` |                 11 |
| `apps/mobile/app/(onboarding)/client-detail.tsx`  |                  8 |
| `apps/mobile/src/components/BookingLinkSheet.tsx` |                  7 |
| `apps/mobile/app/(onboarding)/cash-register.tsx`  |                  5 |
| Resto de Mobile                                   | 11 + 1 advertencia |
| API (`product-orders.ts`, `payphone-payments.ts`) |                  2 |

La mayor parte proviene de reglas del React Compiler sobre refs, pureza y
memoización, además de imports de tipo y variables sin uso. No debe ocultarse
con una marca histórica de “lint aprobado”.

## Seguridad y límites conocidos

- El aislamiento multi-tenant está implementado en backend y probado en la
  suite de integración, pero esa suite no corrió en este corte.
- El rate limiting de autenticación, Maps y reservas públicas vive en memoria.
  Es aceptable para una sola instancia piloto; antes de escalar horizontalmente
  debe trasladarse a un almacén compartido.
- `apps/api/src/index.ts` carga `../../.env` además del entorno del proceso. En
  producción, systemd debe seguir siendo la autoridad mediante
  `/etc/nava/api.env`; conviene retirar la ruta relativa para evitar deriva.
- Las credenciales PayPhone se cifran con AES-256-GCM y AAD por organización.
  La confirmación de pagos de citas es manual e idempotente; no hay webhook de
  confirmación automática en el MVP.
- Las imágenes privadas se almacenan en PostgreSQL como base64. Esto evita un
  proveedor externo, pero aumenta tamaño de base, respuesta y backup.
- No se encontraron mecanismos de CAPTCHA, reputación, dispositivo o
  idempotencia para pedidos públicos.
- Ningún secreto de `.env`, claves de mapas, cuenta FCM, keystore o contraseñas
  debe copiarse a Git, logs o este documento.

## Estado operativo externo registrado

Estos puntos provienen de evidencia histórica del proyecto. **No fueron
revalidados por SSH, Google Cloud, Neon ni Play Console durante esta auditoría**.

- API, Web pública y Admin fueron desplegados en `/opt/nava/app` sobre una VPS,
  con `nava-api.service`, `nava-web.service` y `nava-admin.service`
  administrados por systemd. El Admin fue validado el 21 de agosto de 2026 en
  `https://admin.navacloud.app`; el commit confirmado fue `0ead479`.
- Nginx/TLS exponen `https://api.navacloud.app` y
  `https://reservas.navacloud.app`; PostgreSQL productivo está en Neon.
- Los secretos de la API viven en `/etc/nava/api.env`.
- La cuenta FCM real está en
  `/opt/nava/secrets/fcm-service-account.json`; el entorno de systemd debe
  apuntar a esa ruta. Existe registro de una notificación real exitosa.
- Google Maps Android quedó validado en desarrollo y en una instalación desde
  Google Play después de autorizar el paquete y la firma efectiva de Play.
- La evidencia del despliegue Admin del 21 de agosto registró 58 migraciones
  aplicadas. Como el código actual es posterior y contiene nuevas migraciones,
  hay que reconciliar `pnpm db:status` antes del próximo despliegue.
- El último despliegue de Admin explícitamente documentado fue `0ead479`; el
  `HEAD` local actual (`457cb26`) es posterior. No asumir que producción
  contiene los avances actuales de Usuarios Nava/Memberships ni sus
  migraciones hasta confirmar el despliegue.

### Runbook vigente de VPS y Neon

Ejecutar en `/opt/nava/app` solo después de publicar y revisar el commit:

```bash
git pull --ff-only origin main
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate:deploy
pnpm db:status
pnpm db:generate
pnpm build
systemctl restart nava-api.service
systemctl restart nava-web.service
systemctl restart nava-admin.service
systemctl status nava-api.service nava-web.service nava-admin.service --no-pager
curl -fsS https://api.navacloud.app/health
```

- En producción solo se permite `pnpm db:migrate:deploy`; nunca
  `pnpm db:migrate:dev`.
- No hay PostgreSQL, Docker ni PM2 para API/Web en la VPS actual.
- Antes de desplegar, comprobar sin revelar valores que existen
  `DATABASE_URL`, SMTP, FCM, Maps y la clave de cifrado PayPhone requeridas.
- No ejecutar limpieza o truncado de Neon como parte de un despliegue normal.

## Android y Google Play

### Estado actual

- Configuración vigente: `versionName` **0.1.12**, `versionCode` **34**.
- `apps/mobile/app.json` y `apps/mobile/android/app/build.gradle` coinciden.
- Expo Router y módulos Expo permanecen; EAS Build y Expo Updates/OTA fueron
  retirados. No hay referencias activas a `expo-updates`, `runtimeVersion` o
  canal OTA en la configuración auditada.
- AAB archivado: `apps/mobile/releases/Nava-0.1.12-code34.aab`.
- Tamaño: 87.182.080 bytes.
- SHA-256:
  `AA05D6794DE3CA6662D96C754565F05267C53B73381982F919ADE72D306CC9F2`.
- El historial indica que code 33 fue cargado a Play. Para code 34 no consta
  subida/rollout ni comprobación en teléfono.

## Procedimiento obligatorio para AAB Android local

1. Revisar `git status` y no compilar desde cambios accidentales.
2. Incrementar conjuntamente:
   - `version` en `apps/mobile/app.json`;
   - `versionName` y el `versionCode` por defecto en
     `apps/mobile/android/app/build.gradle`.
3. Confirmar que el nuevo `versionCode` sea mayor que todos los usados en Play
   Console; un código cargado no se reutiliza, aunque la release quede borrador.
4. Ejecutar:

   ```powershell
   pnpm install --frozen-lockfile
   pnpm --filter @barber-saas/mobile typecheck
   Set-Location D:\Documentos\BarberiaSaas\apps\mobile\android
   .\gradlew.bat :app:signingReport --console=plain
   $env:NODE_ENV = 'production'
   .\gradlew.bat :app:bundleRelease --no-daemon --console=plain
   ```

5. La variante `release` debe usar la clave de carga Nava, nunca
   `debug.keystore`. Las propiedades `NAVA_UPLOAD_*` y el keystore viven fuera
   de Git.
6. Copiar el resultado de
   `android/app/build/outputs/bundle/release/app-release.aab` a
   `apps/mobile/releases/Nava-<version>-code<code>.aab` sin sobrescribir otro
   artefacto.
7. Verificar versión del manifest, firma con `jarsigner`, existencia de
   `base/assets/index.android.bundle`, ausencia de componentes OTA y SHA-256.
8. Subir solo el archivo archivado al track correcto, iniciar el rollout y
   comprobar desde Play que Ajustes muestre `<version> (build <code>)`.

## Decisiones vigentes de alcance

- PostgreSQL + Prisma + API propia continúan como arquitectura oficial.
- Neon es el PostgreSQL administrado de producción.
- Android se compila localmente con Gradle; no se usa EAS Build ni OTA.
- Las suscripciones de Nava se activan fuera de la app Android. No añadir un
  enlace de pago externo dentro de la app sin revisar la política vigente de
  Google Play para el país y programa aplicables.
- PayPhone de citas genera enlaces y exige confirmación manual del negocio.
- Los productos pueden venderse públicamente, pero no generan comisión.
- Anticipos a colaboradores son anticipos de comisión, sin intereses ni cuotas.
- Préstamos a clientes y WhatsApp real están fuera del MVP.
- Idioma, moneda y zona horaria no son editables después del onboarding en el
  piloto.
- El piloto asume una sola instancia de API.

## Backlog vigente priorizado

### P0 — Antes de declarar producción estable

1. Corregir los 98 errores/1 advertencia de lint de fuente y ajustar ignores de
   `.tools`, `.eas-archive`, `.kotlin` y artefactos Android.
2. Recuperar `pnpm format:check` sin formatear artefactos generados.
3. Crear una base PostgreSQL exclusiva, aplicar las 52 migraciones y ejecutar
   las 28 integraciones omitidas.
4. Reconciliar y desplegar migraciones/código en VPS; validar salud, logs y
   recorrido real Web → OTP → gestión → Mobile.
5. Añadir pruebas de concurrencia, idempotencia y expiración para pedidos y
   endurecer su endpoint público con rate limiting/idempotencia.
6. Ejecutar E2E de los recorridos críticos: autenticación, agenda, reserva,
   Caja, comisiones, inventario/pedidos, suscripción y Admin.
7. Completar aceptación física Android de `0.1.12`/34 y registrar track,
   rollout y versión observada.
8. Ensayar restauración de Neon y documentar RPO/RTO.
9. Realizar revisión final de autorización multi-tenant, secretos, logs,
   cabeceras, CORS y rutas públicas.

### P1 — Cierre funcional del piloto

1. Implementar el abono real de reservas o retirar su configuración engañosa.
2. Definir textos legales definitivos y política comercial de cancelación,
   no-show y saldo a favor.
3. Mover fotos privadas a almacenamiento de objetos con acceso firmado o
   aceptar/documentar formalmente el costo de base64 en PostgreSQL.
4. Ocultar o terminar Lista de espera, préstamos, bloqueo/notificación/venta
   desde cliente y configuraciones “Próximamente”.
5. Decidir si pagos parciales/múltiples son requisito del piloto; hoy Caja solo
   admite cobro total por un método.
6. Registrar el commit y las migraciones exactos del despliegue posterior a
   `0ead479` del panel Admin (Usuarios Nava, navegación y Memberships), y
   conservar su aceptación como evidencia de regresión.
7. Añadir métricas, alertas y trazabilidad operativa de colas, pagos y errores.

### P2 — Después del piloto

- Checkout Web y webhooks para la suscripción Nava.
- Rate limiting distribuido y escalado horizontal.
- CAPTCHA, dispositivo, reputación y reglas antispam avanzadas.
- Permisos personalizados por colaborador y alcance por sede.
- Waitlist operativa, WhatsApp real, cuentas por cobrar, iOS y enlaces
  universales.

## Criterio de salida

Nava podrá pasar de “piloto controlado” a “producción estable” cuando todos los
P0 estén cerrados, el árbol esté limpio y reproducible, CI pase sin omisiones,
las migraciones productivas coincidan con el repositorio, exista restauración
probada y los recorridos críticos se hayan validado en Web y en el Android
realmente distribuido por Google Play.
