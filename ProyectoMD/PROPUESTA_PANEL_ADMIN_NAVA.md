# Propuesta de evolución del panel administrativo de Nava

> Revisión: 20 de agosto de 2026
> Base: `ProyectoMD/ESTADO_PROYECTO.md` y el código actual de `apps/admin`, `apps/api`, `apps/mobile`, `apps/web` y Prisma.

## Conclusión

El panel evolucionó de una consola inicial a una primera versión amplia del centro de operaciones. Ya incorpora roles de plataforma, operadores y sesiones revocables, ficha 360° por organización, incidencias, alertas persistentes, estado técnico, auditoría global, reintento controlado de notificaciones, solicitudes de privacidad, excepciones temporales, onboarding, moderación de reseñas y E2E autenticado. Todavía no es un centro integral: faltan exportaciones de otros dominios, automatización completa de cumplimiento, configuración global, facturación real y despliegue verificado.

La aplicación ya maneja agenda, reservas públicas, caja, comisiones, inventario, pedidos, notificaciones, reportes, suscripciones y PayPhone. El Admin no tiene visibilidad ni herramientas operativas suficientes para gobernar esos módulos con seguridad. Su función no debe ser duplicar la app de cada barbería, sino permitir a Nava observar, asistir, controlar riesgos y resolver incidencias sin revelar datos personales innecesarios.

## Alcance actual comprobado

| Área           | Existe hoy                                                                                                                    | Límite actual                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acceso         | Operadores persistentes, cinco roles, contraseña individual para operadores creados, OTP, sesiones consultables y revocación. | El operador inicial de emergencia continúa entrando por `PLATFORM_ADMIN_EMAILS`; falta recuperación administrativa y política formal de rotación. |
| Resumen        | Organizaciones, embudo de activación, trials próximos a vencer, suscripciones y fallos de notificaciones.                     | Solo métricas acumuladas; no hay periodos, tendencias ni alertas accionables.                                                                     |
| Organizaciones | Búsqueda, filtros y ficha 360° con plan, límites, uso, sedes, actividad y salud agregada sin suplantación.                    | Faltan vistas detalladas por cada dominio y búsquedas operativas avanzadas.                                                                       |
| Suscripciones  | Cambio de plan, suspensión, reactivación, extensión/reducción de trial, notas comerciales e historial con actor y motivo.     | No hay facturación real.                                                                                                                          |
| Soporte        | Diagnóstico y casos persistentes con prioridad, categoría, estado, notas, responsable, edición/medición de SLA y alertas.     | Faltan adjuntos y almacenamiento de evidencia.                                                                                                    |
| Notificaciones | Fallos por canal, intentos, error, próximo intento y reintento auditado que vuelve a encolar el canal.                        | Faltan métricas temporales, filtros completos en UI y alertas externas.                                                                           |
| Auditoría      | Bitácora global persistente de acceso y mutaciones, paginada y filtrable en API.                                              | Faltan filtros/exportación en UI y una política formal de retención.                                                                              |

## Estado de implementación

### P0

- [x] Roles `super_admin`, `support`, `billing`, `operations` y `read_only` aplicados en backend.
- [x] Alta, cambio de rol, activación/desactivación y directorio de operadores.
- [x] Contraseña individual para operadores persistentes, OTP obligatorio y sesiones verificadas consultables/revocables.
- [x] Auditoría de solicitudes de acceso, accesos exitosos, fallos de credenciales, revocaciones y acciones sensibles.
- [x] Ficha 360° con identidad, propietario enmascarado, sedes, suscripción, uso/límites, PayPhone sin secretos, actividad y salud.
- [x] Cambio de plan, suspensión, reactivación y extensión de trial con motivo, actor y estado antes/después.
- [x] Reducción de trial y notas comerciales independientes del historial de acciones, con RBAC y auditoría.
- [x] Centro de incidencias persistente con categoría, prioridad, estado, notas, responsable inicial, SLA en backend y bitácora.
- [x] Selector de responsable y fecha SLA en UI, medición automática, resumen de incumplimientos y alerta persistente por SLA vencido.
- [ ] Adjuntos de incidencias; requiere definir almacenamiento de objetos.
- [x] Consulta de fallos de notificación por organización/canal, intentos, error y reintento seguro auditado.
- [x] Alertas persistentes para trial próximo a vencer, notificación fallida, caja abierta por más de 24 horas, stock crítico y pedido pendiente vencido.
- [x] Reconocimiento y resolución de alertas con motivo y auditoría.
- [x] Estado técnico básico de API, base de datos, notificaciones, alertas e incidencias.
- [x] Exportación CSV de auditoría con permiso dedicado, rango obligatorio de hasta 31 días, límite de filas y registro persistente de descarga.
- [x] Registro, asignación, seguimiento y resolución auditada de solicitudes de acceso/exportación y eliminación, con identidad enmascarada.
- [x] Retención configurable y borrado automático de registros de exportación vencidos al iniciar una nueva exportación.
- [ ] Exportaciones de otros dominios y ejecución automática de exportación/eliminación solicitada por privacidad.
- [x] Script `start`, plantilla systemd/Nginx y runbook de despliegue/aceptación del Admin.
- [x] E2E autenticado con login, OTP y navegación por los módulos administrativos usando API simulada.
- [ ] Ejecución del despliegue y monitorización externa.

### P1

- [x] Resumen de citas y pedidos por estado durante los últimos 30 días dentro de la ficha 360°.
- [x] Salud agregada de caja, comisiones pendientes, inventario, pedidos, notificaciones y PayPhone sin permitir mutaciones financieras.
- [x] Vistas paginadas y filtrables por organización de agenda/reservas, pedidos, caja, comisiones, inventario y PayPhone, sin PII ni mutaciones financieras.
- [x] Vista de onboarding con estado completado/pendiente, servicios, colaboradores, organización e identidad minimizada.
- [x] Embudo por etapas, porcentaje de avance, registros pendientes de verificación y detección configurable de cuentas abandonadas.
- [x] Reenvío administrativo controlado de verificación, con motivo, auditoría y límite de 3 envíos por hora.
- [ ] Acciones automatizadas de recuperación sobre cuentas abandonadas.
- [x] Moderación de reseñas con autor enmascarado, ocultación/restauración, motivo y auditoría.
- [x] Excepciones temporales de límites y feature flags con caducidad automática, revocación, RBAC y auditoría; sus valores se aplican a los entitlements reales.

### P2

- [ ] Facturación real, conciliación, webhooks, reembolsos y dunning.
- [ ] Analítica de cohortes, conversión, retención, MRR/ARR y churn.
- [x] Configuración global versionada con borrador, aprobación por un segundo superadministrador, publicación, auditoría y rollback.
- [ ] Observabilidad de infraestructura, tareas programadas, latencia, errores y despliegues.
- [ ] Flujos completos de cumplimiento, consentimiento y solicitudes de datos.

## Principios obligatorios

1. **Separación de responsabilidades:** definir al menos `super_admin`, `support`, `billing`, `operations` y `read_only`; no mantener una lista única con poder total.
2. **Mínimo privilegio y privacidad:** mostrar agregados y contacto enmascarado por defecto. El acceso a PII debe exigir permiso, motivo, duración y auditoría.
3. **Sin suplantación silenciosa:** conservar la decisión actual de no crear sesiones como propietario. Un futuro modo soporte debe ser solo lectura, temporal, visible y auditado.
4. **Acciones críticas protegidas:** suspensión, planes, facturación, reintentos de pago, caja o stock requieren motivo, confirmación reforzada y datos antes/después.
5. **API de plataforma separada:** no reutilizar endpoints del tenant con un `organizationId` arbitrario. Crear `/v1/platform/...` con permisos y alcance explícitos.
6. **Operación observable:** cada indicador necesita rango temporal, definición, enlace al detalle y umbral de alerta cuando corresponda.

## Funcionalidades a integrar

### P0 — necesarias para operar el piloto con seguridad

| Módulo                     | Funcionalidad                                                                                                                                         | Resultado esperado                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Operadores y seguridad     | Directorio de operadores, roles, alta/baja, revocación de sesiones, historial de acceso/OTP y 2FA obligatorio.                                        | Cada acción sensible tiene responsable, permiso y trazabilidad.   |
| Ficha 360° de organización | Identidad, estado, plan, uso contra límites, sucursales, miembros, servicios, actividad, salud de reservas/pedidos, notificaciones y línea de tiempo. | Soporte entiende el contexto sin entrar a la cuenta del cliente.  |
| Suscripciones controladas  | Historial de plan/estado, trial/gracia/periodo, motivo y autor; extensión/reducción de trial y notas internas.                                        | Gestión comercial coherente durante el piloto.                    |
| Centro de incidencias      | Casos asignables con prioridad, categoría, estado, notas internas, SLA y enlace a auditoría/diagnóstico.                                              | El soporte deja de depender de mensajes externos sin seguimiento. |
| Salud de notificaciones    | Cola por canal, estados, intentos, último error, filtros y reintento seguro cuando sea idempotente.                                                   | Se detectan y atienden fallos de entrega.                         |
| Auditoría ampliada         | Bitácora de logins, sesiones, acciones de plataforma, cambios de plan, soporte e intervenciones; filtros y exportación controlada.                    | Evidencia para soporte, seguridad y cumplimiento.                 |
| Alertas operativas         | Trial próximo a vencer, errores agotados, pagos pendientes, cajas anómalas, stock crítico y fallos de tareas programadas.                             | Riesgos detectados antes del reporte del cliente.                 |
| Exportaciones y privacidad | Exportaciones autorizadas, registro de descarga, límites, filtros y política de retención/borrado.                                                    | No se extraen datos de clientes sin control.                      |

### P1 — visibilidad sobre módulos existentes

| Dominio              | Vista/acción recomendada                                                                                                   | Restricción                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Onboarding y cuentas | Embudo por paso, cuentas abandonadas, negocios sin sucursal/servicio/equipo y reenvío controlado de verificación.          | No exponer contraseñas, OTP ni datos completos innecesarios.        |
| Agenda y reservas    | Citas por estado/origen, verificación OTP, cancelaciones, no-shows, ocupación y conflictos; búsqueda por token con motivo. | Lectura por defecto; no editar citas salvo procedimiento explícito. |
| Caja y reportes      | Caja abierta, diferencias de cierre, volumen y movimientos anómalos por organización.                                      | No alterar movimientos ni cerrar caja desde plataforma.             |
| Comisiones           | Liquidaciones, anticipos, reversos y errores de cálculo; alertas de pendientes.                                            | La plataforma observa; las aprobaciones siguen siendo del negocio.  |
| Inventario y pedidos | Stock bajo, SKU faltantes, movimientos anómalos, pedidos por estado/expiración y fallos de reserva.                        | Ajustes remotos solo con permiso excepcional y doble confirmación.  |
| PayPhone             | Estado de configuración sin secretos, pruebas, enlaces, pagos pendientes y fallos de confirmación.                         | Nunca exponer ni descifrar credenciales.                            |
| Reseñas y contenido  | Moderación de reseñas reportadas, catálogo público e imágenes.                                                             | Historial de moderación, autor y motivo.                            |
| Límites y flags      | Consumo contra límites, excepciones temporales y habilitación por organización.                                            | Excepciones con caducidad automática y auditoría.                   |

### P2 — comercial y confiabilidad

- Facturación real: clientes de cobro, facturas, pagos, saldo, reembolsos, dunning, webhooks y conciliación. Requiere primero definir checkout y proveedor de suscripción.
- Analítica: cohortes, retención, conversión trial a pago, uso por módulo, MRR/ARR cuando haya cobro y causas de churn.
- Configuración global versionada: planes, límites, flags, plantillas y políticas con borrador, aprobación, publicación y rollback.
- Observabilidad técnica: API, base de datos, cron de recordatorios, correo/FCM, latencia, errores, despliegues y versión por servicio.
- Cumplimiento: solicitudes de exportación/eliminación, retención, consentimiento y registro de acceso a PII.

## Navegación sugerida

```text
Inicio
├── Organizaciones
│   └── Ficha 360° / actividad / soporte / suscripción / límites
├── Operación
│   ├── Reservas y agenda
│   ├── Pedidos e inventario
│   ├── Notificaciones
│   └── Incidencias
├── Comercial
│   ├── Suscripciones
│   ├── Facturación (cuando exista cobro real)
│   └── Analítica
├── Seguridad
│   ├── Operadores y roles
│   ├── Auditoría
│   └── Privacidad y exportaciones
└── Plataforma
    ├── Planes, límites y flags
    ├── Estado técnico
    └── Configuración versionada
```

## API y datos de plataforma a crear

Ya existen `PlatformOperatorRole`, `PlatformOperator`, `PlatformSupportCase`, `PlatformSupportCaseEvent`, `PlatformAlert`, `PlatformAuditLog`, `PlatformExport`, `PlatformFeatureOverride`, `PlatformPrivacyRequest`, `PlatformOrganizationNote` y `PlatformConfigurationVersion`. Cuando exista cobro real, añadir `BillingAccount`, `Invoice` y `Payment`. Ninguna respuesta ni log debe contener secretos de terceros.

Estado de los recursos de API:

- [x] `/v1/platform/operators`, `/v1/platform/sessions` y `/v1/platform/audit`.
- [x] `/v1/platform/organizations/:id` con `activity`, `health`, `subscription` y `limits`; las incidencias están en `/v1/platform/support-cases`.
- [x] `/v1/platform/notifications/:id/retry`, `/v1/platform/alerts` y `/v1/platform/system-health`.
- [x] Vistas minimizadas: `/v1/platform/bookings`, `/v1/platform/orders`, `/v1/platform/cash-health`, `/v1/platform/commissions-health`, `/v1/platform/inventory-health` y `/v1/platform/payphone-health`.
- [x] `/v1/platform/exports/audit.csv` con rango, permiso y trazabilidad.
- [x] `/v1/platform/privacy-requests`, `/v1/platform/overrides`, `/v1/platform/onboarding` y `/v1/platform/reviews` con mutaciones auditadas donde corresponde.
- [x] `/v1/platform/configurations` con borradores, aprobación separada y rollback; notas comerciales en `/v1/platform/organizations/:id/notes`.
- [ ] Exportaciones adicionales y ejecución automatizada de solicitudes de privacidad.

Cada endpoint debe exigir rol, registrar actor/motivo/correlación, paginar y minimizar PII. Las mutaciones deben ser idempotentes, auditar estado anterior/posterior y pedir confirmación reforzada.

## Orden de implementación

1. [ ] Consolidar y desplegar el Admin actual: las plantillas, el runbook y el E2E autenticado están preparados; falta ejecutar/verificar el servicio real.
2. [x] Implementar RBAC de plataforma, revocación de sesiones y auditoría ampliada en API.
3. [x] Construir ficha 360° de organización y núcleo del centro de incidencias.
4. [x] Incorporar salud de notificaciones, reintento y alertas operativas iniciales.
5. [x] Añadir vistas de solo lectura para reservas, pedidos, caja, comisiones, inventario y PayPhone.
6. [x] Implementar límites, flags y excepciones temporales.
7. [ ] Diseñar facturación y analítica después de definir el flujo real de suscripción.

## Criterios de salida

- Cada operador solo realiza acciones de su rol y sus sesiones se pueden revocar.
- La ficha de organización permite diagnosticar incidencias sin suplantación.
- Alertas de notificaciones, trials, pagos/pedidos y tareas críticas se investigan y cierran con evidencia.
- Ninguna acción crítica se ejecuta sin motivo, confirmación y auditoría antes/después.
- Las vistas nuevas tienen pruebas de autorización, aislamiento, PII, paginación y E2E crítico.
- El Admin está desplegado, monitorizado y cumple el mismo gate de calidad que API y Web.

## Fuera de alcance deliberado

- Reemplazar la app móvil como herramienta cotidiana de cada barbería.
- Alterar ventas, caja, stock, comisiones o citas de un cliente sin un procedimiento excepcional explícito.
- Mostrar contraseñas, OTP, sesiones, secretos SMTP/FCM/PayPhone o credenciales de infraestructura.
- Presentar facturación simulada como si fuera cobro real.
