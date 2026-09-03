# Auditoría de compatibilidad iOS — `apps/mobile`

Fecha: 2026-09-02  
Alcance: UI, UX, lógica móvil, integración con API, configuración nativa, notificaciones, enlaces universales, privacidad y proceso de compilación para App Store.

## Resumen ejecutivo previo a correcciones

La aplicación compila y genera correctamente un IPA de producción para iOS. El artefacto revisado corresponde a `app.navacloud.nava`, versión `0.1.16` (build `4`), incluye el entitlement de notificaciones de producción, textos de permisos nativos, Google Maps y manifiestos de privacidad. El bundle JavaScript de iOS también se genera correctamente y las pruebas existentes de la aplicación móvil pasan.

No obstante, se encontraron dos inconsistencias de prioridad alta que pueden afectar el comportamiento real en iPhone o la revisión de App Store:

1. **Notificaciones push incompatibles con iOS:** la aplicación registra un token nativo APNs, pero la API intenta enviarlo mediante Firebase Cloud Messaging. Android sí utiliza un token compatible con el canal actual.
2. **Universal Links declarados pero no publicados:** iOS declara `applinks:reservas.navacloud.app`, pero el dominio devuelve `404` para `/.well-known/apple-app-site-association`. Los enlaces HTTPS de invitación no pueden abrir la aplicación de forma nativa hasta publicar este archivo.

El consentimiento de privacidad no es parte del registro móvil: por decisión de producto, se solicita exclusivamente en el checkout web al comprar una suscripción.

También se detectaron diferencias de dependencias respecto a Expo SDK 57, cobertura insuficiente del camino iOS, objetivos táctiles menores de 44 puntos en algunos controles, una condición duplicada en la pantalla de suscripción, advertencias de lint y una configuración EAS duplicada en la raíz que puede apuntar a un proyecto anterior.

## Evidencia verificada

### Build y configuración nativa

- Último build iOS revisado: finalizado correctamente en EAS.
- Bundle ID: `app.navacloud.nava`.
- Versión: `0.1.16`; build: `4`.
- Destino: iPhone; iOS mínimo: `16.4`.
- Entitlement APNs: `aps-environment=production`.
- Google Maps: clave iOS inyectada en producción y presente en el IPA.
- Permisos nativos: cámara, fotos, contactos y ubicación contienen mensajes de uso.
- Cifrado no exento: declarado como `false` mediante `ITSAppUsesNonExemptEncryption`.
- Bundle de producción para iOS: generado correctamente.

### Validaciones automatizadas previas

- TypeScript móvil: aprobado.
- TypeScript API y cliente API: aprobado.
- Pruebas móviles: 45 suites, 139 pruebas aprobadas.
- API: 16 archivos y 75 pruebas aprobadas al ampliar el timeout; 56 pruebas de base de datos omitidas por no estar disponible `TEST_DATABASE_URL`.
- Expo Doctor: 19/20 comprobaciones aprobadas; una comprobación reportó versiones patch fuera de las recomendadas por Expo SDK 57.
- ESLint móvil: errores en archivos de prueba por `require()` y dos advertencias de dependencias de hooks.

## Hallazgos

### IOS-001 — Entrega push incorrecta para APNs

Severidad: **Alta**  
Estado inicial: **Pendiente**

La aplicación usa `Notifications.getDevicePushTokenAsync()`. En iOS ese método devuelve un token APNs. La API guarda correctamente la plataforma, pero posteriormente entrega todos los tokens a Firebase Cloud Messaging, sin separar Android de iOS. Un token APNs no es un registration token FCM, especialmente porque la aplicación iOS no integra Firebase Messaging.

Archivos implicados:

- `apps/mobile/app/_layout.tsx`
- `apps/mobile/src/features/screens/dashboard-model.ts`
- `apps/mobile/src/lib/push-notifications.ts`
- `apps/api/src/app.ts`
- `apps/api/src/notifications.ts`
- `apps/api/src/fcm.ts`

Corrección prevista: registrar Expo Push Token en iOS, conservar el token FCM nativo en Android y dividir la entrega en la API entre Expo Push Service y FCM.

Referencia técnica: <https://docs.expo.dev/push-notifications/sending-notifications-custom/>

### IOS-002 — Universal Links no operativos

Severidad: **Alta**  
Estado inicial: **Pendiente**

La configuración iOS declara el dominio asociado `reservas.navacloud.app`, pero estas rutas respondían `404` durante la auditoría:

- `https://reservas.navacloud.app/.well-known/apple-app-site-association`
- `https://reservas.navacloud.app/apple-app-site-association`

Como resultado, los enlaces HTTPS de invitación y recuperación continúan en el navegador en lugar de abrir directamente la aplicación instalada.

Corrección prevista: incorporar una ruta web que publique el archivo AASA para el Team ID `2K9VPW5R27` y el bundle `app.navacloud.nava`. Será necesario desplegar `apps/web` para que la corrección llegue al dominio.

### IOS-003 — Consentimiento de privacidad en checkout web

Severidad: **No aplica al registro móvil**<br>
Estado: **Decisión de producto confirmada**

El registro de la aplicación móvil, tanto iOS como Android, debe permanecer sin casilla de aceptación y envía `privacyPolicyAccepted: false`. La aceptación de privacidad corresponde exclusivamente al checkout web durante la compra de una suscripción.

Archivos implicados:

- `apps/mobile/src/components/RegistrationFlow.tsx`
- `packages/validation/src/index.ts`
- `apps/web/app/checkout/CheckoutExperience.tsx`

No se debe mostrar ni exigir ese consentimiento durante el alta móvil. La validación compartida conserva el valor por defecto `false`, mientras que el checkout web mantiene su propio consentimiento asociado a la compra.

### IOS-004 — Dependencias patch distintas a las recomendadas por Expo

Severidad: **Media**  
Estado inicial: **Pendiente**

Expo Doctor detectó 15 paquetes ligeramente retrasados dentro de SDK 57, entre ellos Expo, React Native, Router, Notifications, Constants, Location e Image Picker. No impidieron el build actual, pero aumentan la posibilidad de encontrar fallos ya corregidos por Expo.

Corrección prevista: ejecutar la alineación oficial de dependencias y volver a validar instalación, TypeScript, tests, lint, Expo Doctor y export de iOS.

### IOS-005 — Cobertura automática centrada en Android

Severidad: **Media**  
Estado inicial: **Pendiente**

La prueba de notificaciones fuerza `Platform.OS = android`; no comprueba la selección de token ni la entrega específica de iOS.

Corrección prevista: añadir pruebas unitarias del registro Expo/iOS y del enrutamiento de entrega Expo/FCM en la API.

### IOS-006 — Algunos controles no alcanzan 44 × 44 puntos

Severidad: **Media**  
Estado inicial: **Pendiente parcial**

Se encontraron botones de cierre, regreso y notificaciones con dimensiones visuales de 32–42 puntos. Esto no impide compilar, pero reduce comodidad y accesibilidad en iPhone.

Corrección prevista: ajustar componentes reutilizables y controles prioritarios a un área interactiva mínima de 44 puntos sin alterar innecesariamente el diseño visual.

### IOS-007 — Condición duplicada en mensajes de uso

Severidad: **Baja**  
Estado inicial: **Pendiente**

La pantalla de suscripción contiene dos ramas consecutivas `used >= 20`, por lo que una de ellas nunca se ejecuta.

Archivo: `apps/mobile/app/(onboarding)/subscription.tsx`.

### IOS-008 — Configuración EAS duplicada/legada

Severidad: **Media**  
Estado inicial: **Requiere cautela**

`apps/mobile/eas.json` corresponde al proyecto actual, mientras que la raíz también contiene configuración nueva y un `app.json` legado con otro project ID y package Android. Ejecutar EAS desde el directorio equivocado puede seleccionar metadatos inconsistentes.

Corrección prevista: conservar como fuente operativa `apps/mobile` y eliminar únicamente la duplicación nueva que resulte segura, sin sobrescribir configuración legada del usuario.

### IOS-009 — Timeout predeterminado insuficiente en pruebas API

Severidad: **Baja**  
Estado inicial: **Pendiente**

Dos pruebas válidas superan el timeout predeterminado de cinco segundos durante la construcción de la aplicación. Con 20 segundos todas las pruebas disponibles pasan.

### IOS-010 — Tareas externas a código

Severidad: **Media**  
Estado inicial: **Acción manual**

Aunque el código quede corregido, estas comprobaciones requieren infraestructura o acceso externo:

- Desplegar `apps/web` para publicar el archivo AASA.
- Desplegar `apps/api` para activar el nuevo transporte push.
- Generar un build iOS nuevo después de cambiar dependencias o configuración nativa.
- Confirmar en App Store Connect la URL de privacidad, declaración de datos recolectados y cuenta de demostración para revisión.
- Probar en un iPhone físico notificaciones, permisos, enlaces universales, mapas y flujos de cámara/fotos. Un simulador no reproduce completamente APNs ni todos los permisos físicos.

### IOS-011 — Recurso fuente del icono menor a la recomendación

Severidad: **Baja**  
Estado inicial: **No bloqueante**

`apps/mobile/assets/icon.png` mide 512 × 512, aunque el recurso fuente recomendado para Expo/App Store es 1024 × 1024. El archivo es cuadrado, no contiene transparencia y EAS produjo correctamente los tamaños nativos del IPA, por lo que no bloqueó el build revisado.

Corrección recomendada: sustituirlo más adelante por el arte original de 1024 × 1024. No se hizo un reescalado artificial porque no añade detalle y puede degradar la identidad visual.

## Plan de corrección

1. Corregir registro y entrega de push según plataforma.
2. Publicar en código la asociación de Universal Links.
3. Mantener el consentimiento en el checkout web, sin casilla durante el registro móvil.
4. Corregir lógica inalcanzable, lint y objetivos táctiles prioritarios.
5. Alinear dependencias con Expo SDK 57.
6. Añadir pruebas específicas y ejecutar la batería completa.
7. Actualizar este informe con el resultado final y las acciones externas restantes.

## Restricciones de la auditoría

No se dispone de un iPhone físico ni de acceso interactivo a App Store Connect. La revisión combina análisis estático, pruebas automatizadas, generación del bundle iOS, inspección del IPA y comprobaciones HTTP. Estas validaciones reducen el riesgo, pero no reemplazan una prueba final en hardware real.

## Registro de remediación

Fecha de corrección: 2026-09-02

### Resultado por hallazgo

- **IOS-001 — Resuelto en código:** iOS registra ahora un Expo Push Token asociado al project ID de EAS; Android conserva su token FCM nativo. La API separa dispositivos por plataforma, envía iOS mediante Expo Push Service y Android mediante FCM, admite lotes de 100 tokens y elimina el token anterior del mismo usuario/plataforma cuando registra uno nuevo. Se añadieron pruebas para ambos caminos y para impedir que un token APNs nativo sea enviado por FCM.
- **IOS-002 — Resuelto en código; pendiente de despliegue:** `apps/web` publica `/.well-known/apple-app-site-association` con `2K9VPW5R27.app.navacloud.nava` y las rutas de invitación y recuperación. La compilación de Next.js reconoce la ruta y su prueba valida cuerpo y `Content-Type`. El dominio continuará devolviendo `404` hasta desplegar esta versión de la web.
- **IOS-003 — Ajustado a la decisión de producto:** se retiró la casilla del registro móvil. iOS y Android conservan el alta sin consentimiento visible y envían `privacyPolicyAccepted: false`; el consentimiento permanece exclusivamente en el checkout web al comprar una suscripción.
- **IOS-004 — Resuelto:** los paquetes de Expo SDK 57, React Native y Jest Expo fueron alineados con las versiones recomendadas. Se añadieron los config plugins requeridos por Expo Asset, Secure Store y Sharing.
- **IOS-005 — Resuelto:** se añadieron pruebas del token iOS/Android y del transporte push de API. La suite móvil aumentó de 139 a 141 pruebas.
- **IOS-006 — Resuelto en controles prioritarios:** botones de regreso, cierre, edición, eliminación, categorías y selección de equipo revisados tienen ahora un área mínima de 44 puntos. También se amplió el área de edición y navegación del flujo de registro.
- **IOS-007 — Resuelto:** los avisos de consumo usan umbrales alcanzables de 15, 19 y 21 reservas.
- **IOS-008 — Mitigado, sin sobrescribir archivos legados:** `apps/mobile/eas.json` continúa siendo la configuración autorizada del proyecto actual. La duplicación de raíz ya pertenecía a los cambios locales del usuario y no se eliminó. Los comandos EAS deben ejecutarse desde `apps/mobile` para evitar que el `app.json` legado de la raíz sea seleccionado.
- **IOS-009 — Resuelto:** la suite API dispone ahora de un timeout de 20 segundos acorde con el tiempo real de construcción de la aplicación en pruebas.
- **IOS-010 — Pendiente externo:** requiere despliegues, nuevo build, App Store Connect y hardware real.
- **IOS-011 — Pendiente de activo original:** no bloquea el build actual; conviene reemplazar el icono cuando esté disponible el arte fuente de 1024 × 1024.

### Validación posterior

- Typecheck del monorepo: **17/17 tareas aprobadas**.
- Pruebas móviles: **46/46 suites; 141/141 pruebas aprobadas**.
- Pruebas API: **16 archivos aprobados, 1 omitido; 78 pruebas aprobadas y 56 omitidas por falta de `TEST_DATABASE_URL`**.
- Pruebas web: **7/7 archivos; 20/20 pruebas aprobadas**.
- Pruebas de validación compartida: **31/31 aprobadas**.
- Expo Doctor: **20/20 comprobaciones aprobadas**.
- Comprobación de versiones Expo: **dependencias actualizadas**.
- ESLint del alcance modificado (móvil, push API, AASA y validación): **aprobado sin advertencias**.
- Build API: **aprobado**.
- Build web de producción: **aprobado**; incluye la ruta `/.well-known/apple-app-site-association`.
- Exportación iOS de producción: **aprobada**, 1.841 módulos y bundle Hermes generado.
- `git diff --check`: **aprobado**.

El lint global del repositorio todavía falla por archivos preexistentes fuera del alcance de esta auditoría (`apps/admin`, páginas web no relacionadas y copias dentro de `.worktrees`). Esos errores no aparecen en el lint específico de los archivos modificados y no afectan el bundle iOS verificado.

### Orden necesario para activar las correcciones

1. Desplegar `apps/web` y comprobar que `https://reservas.navacloud.app/.well-known/apple-app-site-association` devuelve HTTP 200, sin redirección y con `application/json`.
2. Generar un nuevo build desde `apps/mobile` y subirlo a App Store Connect. El build `0.1.16 (5)` ya enviado contiene temporalmente la casilla de privacidad en el registro móvil y no debe seleccionarse para distribución o revisión; usar el siguiente build con esta corrección.
3. Desplegar `apps/api` para activar el nuevo transporte push de iOS. Este despliegue no modifica el comportamiento de consentimiento del registro móvil.
4. Probar en iPhone físico la recepción push, apertura de invitaciones, ubicación, mapas, cámara y selector de fotos.
5. Confirmar en App Store Connect la política de privacidad, la ficha de datos recolectados y las credenciales de demostración para Apple Review.
