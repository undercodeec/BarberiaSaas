# Auditoría de la aplicación móvil: seguridad, lógica y calidad del MVP

**Aplicación auditada:** Nava (`apps/mobile`)

**Fecha:** 19 de agosto de 2026

**Alcance:** cliente Expo/React Native, rutas móviles, almacenamiento local, navegación, permisos, notificaciones, configuración Android/iOS declarativa, dependencias utilizadas por mobile, pruebas y artefactos de compilación mobile.

**Fuera de alcance:** implementación de `apps/api`, aplicaciones web/admin, base de datos y reglas internas del servidor. Solo se mencionan contratos o endpoints cuando el comportamiento del cliente móvil depende directamente de ellos.

## 1. Dictamen ejecutivo

La aplicación móvil compila y posee buenas bases de autenticación y validación, pero **todavía no cumple un estándar suficiente para publicación abierta como MVP de negocio**. No se confirmó una vulnerabilidad crítica que permita tomar control inmediato del dispositivo; sí se confirmaron defectos altos de privacidad, manejo de sesión, aislamiento entre cuentas, consumo de recursos y proceso de release.

Bloqueadores principales:

1. La agenda puede ejecutar entre 1 y 31 requests cada 2 segundos, incluso con polling en background. En vista mensual equivale aproximadamente a 14–15,5 requests por segundo por usuario.
2. La caché de React Query usa muchas claves sin usuario/organización y no se limpia al cerrar un negocio o cambiar de organización. Datos de clientes, caja, inventario o pagos del tenant anterior pueden aparecer brevemente en el siguiente.
3. Un fallo transitorio de red durante el arranque elimina una sesión todavía válida y obliga a iniciar sesión nuevamente.
4. Cuando una sesión vence durante el uso no existe un manejador global de 401/403 ni un temporizador basado en `expiresAt`; la aplicación queda en un estado de “sesión aparente” con errores repetidos.
5. La API cliente contempla recuperación de contraseña, pero la app móvil no ofrece “Olvidé mi contraseña” ni pantallas de recuperación/restablecimiento.
6. El proyecto mezcla carpetas nativas versionadas con configuración Expo no sincronizada. Expo Doctor confirma esa divergencia y el build local permite que un release caiga silenciosamente a firma debug si faltan propiedades.
7. El manifest Android de release contiene permisos no justificados por las funciones encontradas, incluyendo micrófono, escritura de contactos y overlay del sistema; además permite backup sin reglas explícitas.

### Resumen de severidad

| Severidad | Cantidad | Resultado                                                                        |
| --------- | -------: | -------------------------------------------------------------------------------- |
| Crítica   |        0 | No se confirmó toma de cuenta/dispositivo originada exclusivamente en el cliente |
| Alta      |        7 | Deben resolverse antes de una publicación abierta                                |
| Media     |       15 | Deben resolverse antes o durante un piloto controlado                            |
| Baja      |        7 | Endurecimiento, mantenibilidad y pulido                                          |

## 2. Metodología y limitaciones

Se revisaron 45 archivos de rutas/pantallas, 28 archivos de `src`, aproximadamente 34.990 líneas TypeScript/TSX, configuración Expo, proyecto Android versionado, manifest fusionado de release, dependencias, assets, almacenamiento, navegación, permisos, notificaciones, formularios, exportaciones y pruebas.

Verificaciones realizadas:

- typecheck aislado de `@barber-saas/mobile`;
- pruebas Jest mobile sin caché;
- ESLint exclusivamente sobre `apps/mobile/app`, `apps/mobile/src` y configuraciones mobile;
- Expo Doctor;
- export web desde cero;
- inspección del AAB local existente y comparación de su certificado con el keystore debug;
- búsqueda de secretos por patrón y revisión de datos que se incorporan al binario sin imprimirlos en este informe.

Limitaciones:

- No se realizó pentest dinámico en un teléfono rooteado/jailbroken.
- No se interceptó tráfico real con proxy ni se probó un backend desplegado.
- No existe carpeta nativa iOS ni IPA disponible; no fue posible revisar el manifest de privacidad, entitlements, Keychain final ni firma iOS.
- El AAB inspeccionado ya existía y no se regeneró durante esta auditoría.
- La auditoría de dependencias automatizada global no terminó en la revisión anterior; la dependencia sensible de mobile se contrastó manualmente con avisos públicos.
- No se evaluó la seguridad interna del servidor. El cliente nunca debe ser la única barrera de autorización.

## 3. Resultados de las herramientas

| Comprobación                                                       | Resultado | Detalle                                                                       |
| ------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------- |
| `pnpm --filter @barber-saas/mobile typecheck`                      | Aprobada  | TypeScript estricto no reportó errores                                        |
| `pnpm --filter @barber-saas/mobile test -- --runInBand --no-cache` | Aprobada  | 4 suites, 6 tests, 0 fallos                                                   |
| ESLint mobile                                                      | Fallida   | 96 errores y 1 warning                                                        |
| `pnpm dlx expo-doctor apps/mobile`                                 | Fallida   | 19/21 checks; 2 checks fallidos                                               |
| Build web mobile                                                   | Aprobada  | Bundle JS único de 12 MB; export total de 19,1 MB                             |
| Manifest Android release                                           | Revisado  | Confirma permisos excesivos en el artefacto fusionado                         |
| AAB local                                                          | Revisado  | 87.182.080 bytes; el certificado no coincide con el keystore debug versionado |

Expo Doctor detectó:

- carpetas nativas junto con propiedades de `app.config.js` que pueden no sincronizarse sin `prebuild`;
- 12 paquetes Expo con versiones patch inferiores a las esperadas para SDK 57.

## 4. Hallazgos de severidad alta

### HIGH-01 — Polling explosivo de agenda y actividad en background

**Evidencia:** `apps/mobile/app/(onboarding)/agenda.tsx:457-486`.

La query de citas hace un request por cada fecha visible y se repite cada 2 segundos. La vista diaria genera aproximadamente 30 requests/minuto; la semanal, 210/minuto; la mensual puede generar entre 840 y 930/minuto por usuario. `refetchIntervalInBackground: true` solicita además mantener el polling fuera de foco mientras el runtime siga activo.

Impactos:

- consumo elevado de batería y datos móviles;
- calentamiento y degradación de UX;
- presión innecesaria sobre API y base de datos;
- riesgo de rate limiting y fallos en cascada con varios usuarios;
- multiplicación del coste en vista mensual.

**Corrección requerida:** un endpoint por rango de fechas, una sola query por vista y refresco por evento/push/WebSocket/SSE. Como mínimo: 15–60 segundos solo en foreground, refetch al volver a foco y actualización optimista después de mutaciones. Nunca hacer una petición por día cada 2 segundos.

**Prueba de cierre:** medir requests durante 5 minutos en vistas día/semana/mes y demostrar un límite acordado, incluyendo background y reconexión.

### HIGH-02 — Riesgo de exposición cruzada por caché entre organizaciones/cuentas

**Evidencia:** `apps/mobile/src/providers/AppProviders.tsx:8-24`; claves como `['clients']`, `['cash-register-summary']`, `['inventory']`, `['team']`, `['services']`, `['payphone-configuration']` y `['current-organization']` repartidas en las pantallas; cambio de negocio en `apps/mobile/app/(onboarding)/settings.tsx:90-115`.

El `QueryClient` vive durante toda la ejecución. La mayoría de claves no incluye `userId`, `organizationId` ni `locationId`. El logout normal desde Ajustes ejecuta `queryClient.clear()`, pero esa limpieza no está centralizada en `AuthProvider` y el flujo “cerrar barbería → aceptar invitación a otro negocio” solo invalida unas pocas queries.

Escenario confirmado por lógica:

1. el usuario consulta clientes, caja e inventario del negocio A;
2. cierra el negocio A y se une al negocio B sin cerrar sesión;
3. las queries genéricas conservan datos A y pueden entregarlos inmediatamente mientras ocurre el refetch de B.

Aunque la API luego responda correctamente, una aparición momentánea de PII/finanzas del tenant anterior ya es una brecha de confidencialidad y puede inducir acciones sobre IDs obsoletos.

**Corrección requerida:** factoría central de claves con `userId + organizationId + locationId`; limpiar/remover toda query tenant-scoped antes de cambiar organización; centralizar cleanup en el proveedor de autenticación; no renderizar cache antigua durante la resolución del nuevo tenant.

### HIGH-03 — Un error de conectividad elimina sesiones válidas

**Estado:** [x] Corregido y verificado el 19 de agosto de 2026.

**Evidencia:** `apps/mobile/src/providers/AuthProvider.tsx:53-68`; diferenciación de errores disponible en `packages/api-client/src/index.ts:937-1032`.

Al restaurar sesión, cualquier excepción —timeout, modo avión, DNS, 500 o mantenimiento— entra al mismo `catch` y borra el token seguro. Una persona que abre la app sin conexión pierde su sesión aunque el token siga vigente.

**Corrección requerida:** borrar token solo ante 401/403 o código inequívoco de sesión revocada. Para timeout/red/5xx, conservarlo, mostrar estado offline y permitir reintento. Añadir una máquina de estado: `restoring`, `authenticated`, `unauthenticated`, `offline-auth-unknown`.

### HIGH-04 — Expiración/revocación de sesión no se gestiona durante el uso

**Estado:** [x] Corregido y verificado el 19 de agosto de 2026.

**Evidencia:** `session.expiresAt` solo se conserva en `AuthProvider`; no se usa para expirar sesión. `createApiClient` lanza `ApiClientError` pero no tiene interceptor global de autenticación.

Si la sesión vence o el servidor la revoca mientras la app está abierta, cada pantalla puede quedar mostrando caché y errores, pero el estado local continúa autenticado. No existe una única transición segura hacia login ni limpieza de caché/datos sensibles.

**Corrección requerida:** callback global ante 401/403 de autenticación, diferenciando un 403 de negocio de uno de sesión; temporizador con margen basado en `expiresAt`; limpieza atómica de token, usuario, caché y navegación; deduplicar múltiples respuestas 401 simultáneas.

### HIGH-05 — Recuperación de contraseña ausente en la app

**Evidencia:** no existen usos de `/v1/auth/recover` o `/v1/auth/reset-password` en `apps/mobile`; `LoginFullScreen.tsx` contiene un estilo `forgot` sin control renderizado.

Una cuenta que olvida su contraseña no puede recuperarse desde la aplicación, pese a que los contratos compartidos incluyen los esquemas. Es un bloqueo directo de soporte y retención del MVP.

**Corrección requerida:** pantalla “Olvidé mi contraseña”, respuesta no enumerativa, pantalla de nueva contraseña, soporte del deep link, estados expirado/usado, reenvío controlado y pruebas desde correo hasta login. El enlace debe usar Universal Links/App Links verificados, con fallback seguro.

### HIGH-06 — Configuración nativa divergente y fallback silencioso de firma release

**Estado:** [x] Corregido y verificado el 19 de agosto de 2026.

**Evidencia:** Expo Doctor; `apps/mobile/android/app/build.gradle:102-155`; existencia de `android/` junto con plugins/permisos en `app.json` y `app.config.js`.

Al versionar `android/`, las modificaciones de config plugins no se reflejan automáticamente si el pipeline no ejecuta prebuild. Esto ya se manifiesta como permisos distintos entre config efectiva y manifest. Además, si faltan las cuatro propiedades `NAVA_UPLOAD_*`, el tipo `release` usa `signingConfigs.debug` en vez de fallar.

El AAB existente inspeccionado **no** coincide con el keystore debug, por lo que ese archivo concreto no está debug-signed. El defecto sigue siendo real: otro release local mal configurado sí podría generarse y distribuirse con firma equivocada.

**Corrección requerida:** escoger y documentar un modelo:

- CNG: no versionar carpetas nativas y ejecutar prebuild reproducible; o
- bare/native: versionar y revisar cada cambio nativo, sin confiar en plugins no aplicados.

El build release debe fallar si falta firma de producción. Añadir CI que verifique application ID, versionCode, permisos, certificado esperado y ausencia de flags debug antes de aceptar el AAB.

### HIGH-07 — Permisos Android excesivos y backup sin política explícita

**Estado:** [x] Corregido y verificado el 19 de agosto de 2026.

**Evidencia:** `apps/mobile/android/app/src/main/AndroidManifest.xml`; manifest fusionado de release; `apps/mobile/app.json`.

El release contiene, entre otros:

- `RECORD_AUDIO`, sin uso de micrófono encontrado;
- `WRITE_CONTACTS`, aunque la app solo importa/lee nombre y teléfono;
- `SYSTEM_ALERT_WINDOW`, añadido directamente al manifest principal;
- permisos legacy de almacenamiento externo;
- biometría/fingerprint aunque el token no usa `requireAuthentication`;
- `android:allowBackup="true"` sin `fullBackupContent`, `dataExtractionRules` ni recursos de exclusión visibles.

La superficie de permisos perjudica privacidad, confianza y revisión de Play Store. La falta de reglas de backup también es incoherente con SecureStore: sus entradas no pueden descifrarse tras restauración porque la clave Android Keystore no sobrevive a la desinstalación.

**Corrección requerida:** bloquear permisos no usados mediante config/plugin y manifest; solicitar únicamente cámara/fotos/contactos/ubicación/notificaciones en contexto; usar solo lectura de contactos; eliminar overlay y micrófono; decidir entre `allowBackup=false` o reglas que excluyan tokens/datos sensibles y SecureStore. Revisar el manifest fusionado, no solo `app.json`.

Referencia oficial: <https://docs.expo.dev/versions/latest/sdk/securestore/#android-auto-backup>.

## 5. Hallazgos de severidad media

### MED-01 — Push token no se revoca al cerrar sesión

**Estado:** [x] Corregido y verificado el 19 de agosto de 2026.

**Evidencia:** registro en `apps/mobile/app/_layout.tsx:22-47` y `dashboard.tsx:241-254`; logout en `AuthProvider.tsx:118-130`.

La app registra el token del dispositivo, pero `signOut()` no solicita su eliminación. Tras cerrar sesión, ese teléfono puede seguir recibiendo notificaciones de la cuenta anterior hasta que otro usuario inicie sesión y el token se reasigne o el servidor lo limpie.

**Corrección:** antes del logout, obtener el token y revocarlo de forma best-effort; asociarlo idealmente a la sesión/dispositivo; limpiar tokens inválidos; permitir desactivar notificaciones desde la app. Minimizar PII en lock screen.

### MED-02 — Navegación desde notificaciones acepta rutas arbitrarias

**Estado:** [x] Corregido y verificado el 19 de agosto de 2026.

**Evidencia:** `apps/mobile/src/lib/notification-navigation.ts:1-16`; `apps/mobile/app/_layout.tsx:48-63`.

La propiedad `data.route` se devuelve sin allowlist; solo el listener nativo exige que comience con `/`. Los banners internos ni siquiera repiten ese chequeo antes de `router.push`. Un payload erróneo o comprometido puede abrir cualquier ruta interna, incluidas pantallas no adecuadas para el rol, y un `lastNotificationResponse` antiguo puede volver a procesarse en un arranque posterior.

**Corrección:** mapa cerrado de tipo de notificación a ruta, validación de parámetros y rol, limpiar/marcar la última respuesta consumida y probar cold start/background/foreground.

### MED-03 — Exportaciones de PII dejan archivos y comparten texto de forma defectuosa

**Evidencia:** `apps/mobile/app/(onboarding)/clients.tsx:363-424`; `reports.tsx:352-366`.

La exportación de clientes escribe nombre, teléfono, correo, dirección, documento y notas en `cacheDirectory`, lo comparte y no elimina el archivo después. La exportación de reportes usa `Share.share({ message: csv })`; en móvil comparte texto largo, no un archivo `.csv`, por lo que varias apps destino no lo tratarán como documento.

**Corrección:** crear archivo temporal con MIME/extensión correctos, aviso explícito de sensibilidad, compartir y borrar en `finally`; opción de cifrado o exportación mínima; evitar persistencia en logs/backups; probar Drive, Files, Excel, correo y cancelación del share sheet.

### MED-04 — Dependencia `xlsx@0.18.5` obsoleta y con avisos conocidos

**Evidencia:** `apps/mobile/package.json`; import estático en `clients.tsx:33` y uso de escritura/exportación.

La versión está incluida en avisos de prototype pollution y ReDoS. No se encontró lectura de archivos XLSX controlados por terceros, por lo que la ruta principal de prototype pollution no está expuesta actualmente; solo se genera un workbook. Aun así, código vulnerable y pesado queda incluido en el bundle.

**Corrección:** sustituir por una librería mantenida orientada solo a escritura o distribución corregida; carga diferida del exportador; prueba con celdas grandes y contenido que empiece por fórmula.

Referencias:

- <https://github.com/advisories/GHSA-4r6h-8v6p-xvw6>
- <https://github.com/advisories/GHSA-5pgg-2g8v-p4x9>

### MED-05 — Error de fecha UTC en liquidaciones financieras

**Estado:** [x] Corregido y verificado el 19 de agosto de 2026.

**Evidencia:** `apps/mobile/app/(onboarding)/wallet.tsx:69-71`, uso en `:242-253`.

`new Date().toISOString().slice(0, 10)` obtiene la fecha UTC. En Ecuador, desde las 19:00 hasta las 23:59 la fecha UTC ya es el día siguiente. La app puede inicializar `periodEnd` y el inicio del mes con un día/mes equivocado y enviar ese rango al crear una liquidación.

**Corrección:** generar fecha civil en la zona horaria del negocio con `Intl.DateTimeFormat(...).formatToParts()` o una librería temporal robusta. Probar fin de mes/año, DST para negocios fuera de Ecuador y cambios de zona.

### MED-06 — Datos sensibles visibles en capturas y selector de apps recientes

**Evidencia:** no existe uso de `expo-screen-capture`, `FLAG_SECURE` ni una cubierta al pasar a background; la app muestra PII, caja, pagos y un token PayPhone.

**Corrección:** ocultar o difuminar la interfaz en el app switcher; bloquear captura al mostrar credenciales/finanzas si el negocio lo requiere; añadir reautenticación biométrica/PIN después de inactividad para pantallas sensibles. Mantener una política equilibrada para no impedir soporte donde no haga falta.

### MED-07 — Importación de contactos preselecciona toda la agenda disponible

**Estado:** [x] Corregido y verificado el 19 de agosto de 2026.

**Evidencia:** `apps/mobile/app/(onboarding)/clients.tsx:154-193`.

La lectura se limita correctamente a nombre y teléfono, pero todos los contactos importables quedan seleccionados por defecto. El siguiente toque puede subir masivamente datos de terceros al servidor. Esto contradice minimización y consentimiento cuidadoso.

**Corrección:** selección inicial vacía o confirmación reforzada con cantidad y destino; explicación de qué campos se suben, para qué y cómo se eliminan; deduplicación E.164; revocar permiso no debe romper el resto de la app.

### MED-08 — API URL no exige HTTPS en release

**Estado:** [x] Corregido y verificado el 19 de agosto de 2026.

**Evidencia:** `apps/mobile/src/lib/api.ts:6-10`; `publicApiConfigSchema` valida URL, no protocolo.

Una configuración release equivocada puede incrustar `http://`. Android/iOS probablemente bloquearán cleartext según versión/configuración, provocando una app rota; si se habilitara cleartext, expondría bearer tokens y PII.

**Corrección:** validación build-time que exija `https:` fuera de local/debug, allowlist de hosts por entorno y check del valor final dentro del bundle sin imprimirlo.

### MED-09 — Dependencias Expo desalineadas con SDK 57

**Evidencia:** Expo Doctor detectó 12 mismatches patch: Expo core, router, asset, constants, contacts, file-system, image-picker, linking, location, notifications, sharing y metro runtime.

**Corrección:** `expo install --check`, actualizar en una rama, regenerar/probar nativo según el modelo elegido y ejecutar smoke tests en Android/iOS reales. No mezclar la actualización con refactors funcionales.

### MED-10 — Sin Error Boundary ni validación runtime general de respuestas

**Evidencia:** no existe Error Boundary de ruta/global; la mayoría de `request<T>()` confía en tipos TypeScript sin parsear la respuesta.

Una respuesta incompleta, valor de fecha inválido o error de render puede dejar pantalla blanca o cerrar la app. Solo clientes tiene normalización parcial.

**Corrección:** Error Boundary global y por módulos críticos con recuperación; esquemas Zod para respuestas de sesión, tenant y operaciones financieras; telemetría redactada; fallback de valores/fechas.

### MED-11 — Sin integración global de AppState/red con React Query

**Evidencia:** `AppProviders.tsx` crea el cliente, pero no configura `focusManager`/`onlineManager`; no se usa NetInfo/AppState globalmente.

La app puede conservar datos de agenda/caja obsoletos tras volver de background o reconectar, mientras otras queries hacen polling innecesario. El comportamiento es inconsistente por pantalla.

**Corrección:** integrar AppState y conectividad, pausar queries en background/offline, revalidar las críticas al volver a foreground y mostrar estado “sin conexión/datos de hace X”.

### MED-12 — Accesibilidad incompleta

**Evidencia estática:** 349 `Pressable`, 260 apariciones de `accessibilityRole`, 197 de `accessibilityLabel`; 37 modales frente a 10 apariciones de propiedades de modalidad/foco. Hay múltiples objetivos visuales de 24–42 px.

Las cifras no demuestran por sí solas 89 fallos, porque algunos roles/labels pertenecen a componentes envolventes o reutilizables. Sí justifican una revisión manual: botones icon-only sin rol, foco atrapado en modales, orden de lectura, escape accesible, tamaños inferiores a 44/48 dp y truncado con fuentes grandes.

**Corrección:** auditoría VoiceOver/TalkBack, escalado 200 %, contraste WCAG, orientación y teclado externo; añadir pruebas de accesibilidad a componentes base y rutas críticas.

### MED-13 — Bundle y assets sobredimensionados

**Evidencia:** export web de 19,1 MB, un único JS de 12 MB y PNG de 1,2–1,9 MB; AAB local de 87,18 MB.

El tamaño web no equivale al download final Android y el AAB se divide por dispositivo, pero ambos revelan falta de presupuesto. `xlsx`, datos de países/ciudades y pantallas monolíticas entran en el bundle; varios PNG se pueden comprimir fuertemente.

**Corrección:** presupuesto por plataforma, análisis de bundle, lazy loading por ruta/exportación, WebP/AVIF o PNG optimizado, variantes por densidad, eliminación de assets/ABIs no necesarios y R8/minificación release después de pruebas.

### MED-14 — Puerta de lint fallida

**Evidencia:** 96 errores y 1 warning en la ejecución aislada mobile.

Se incluyen accesos a refs durante render, `setState` síncrono en efectos, pureza (`Date.now()` durante render), variable usada antes de declarar, imports sin usar y configuraciones CommonJS rechazadas. Algunas reglas del React Compiler pueden requerir adaptar el patrón de React Native Animated en lugar de aplicar arreglos mecánicos.

**Corrección:** clasificar falsos positivos documentados, corregir los defectos reales y exigir lint verde en CI. No desactivar globalmente reglas de hooks/pureza.

### MED-15 — Cobertura de pruebas insuficiente

**Evidencia:** 4 archivos de test y 6 casos para 45 archivos de rutas y ~34.990 líneas.

No hay pruebas mobile para AuthProvider, API/token, logout/cache, cambio de tenant, agenda, caja, clientes, wallet, notificaciones, deep links, permisos, exportación, fechas ni navegación. Los tests actuales se concentran en cuatro componentes.

**Corrección:** añadir unit/integration tests y E2E reales. Prioridad: offline al arrancar, 401 concurrentes, cambio A→B sin datos antiguos, agenda por rango, fecha de liquidación 19:00 Ecuador, recovery link, push logout, export cleanup y permisos negados.

## 6. Hallazgos bajos y de endurecimiento

### LOW-01 — QR de reservas delegado a un tercero

**Evidencia:** `BookingLinkSheet.tsx:25-27` abre QuickChart con la URL completa como query string.

La URL pública de reservas queda en logs/historial de un tercero y el QR depende de conectividad externa. El enlace está pensado para compartirse, por lo que el impacto es limitado, pero conviene generar el QR localmente y documentar terceros.

### LOW-02 — Logout inmediato con código de confirmación inalcanzable

**Estado:** [x] Corregido y verificado el 19 de agosto de 2026.

**Evidencia:** `apps/mobile/app/(onboarding)/settings.tsx:154-165`.

`logout()` ejecuta el cierre y retorna antes del bloque que pregunta confirmación. El usuario se desconecta inmediatamente aunque el código y texto indican la intención contraria. Eliminar el bloque muerto o restaurar la confirmación según decisión de UX.

### LOW-03 — Token PayPhone permanece en estado al cerrar el modal

**Estado:** [x] Corregido y verificado el 19 de agosto de 2026.

**Evidencia:** `wallet.tsx:61-63`, cierre del modal alrededor de `:727-744` y campo `:813-827`.

Guardar limpia el token y abrir configuración también, pero cerrar mediante backdrop/back no lo borra. Permanece en memoria JS hasta reabrir/desmontar. Crear un `closePayphoneSheet()` único que limpie token/store ID y usarlo en todas las salidas; combinar con protección de app switcher.

### LOW-04 — Deep link Android demasiado amplio

**Evidencia:** intent filter de `MainActivity` acepta cualquier URI con esquema `barbersaas` o `exp+barber-saas-mobile`, sin host/path.

Cualquier app/web puede abrir rutas del cliente. No se observó bypass de autorización, pero sí navegación inesperada y mayor superficie. Usar App Links/Universal Links verificados y limitar host/path para invitaciones/recovery.

### LOW-05 — Texto corrupto y bloque legacy muerto

**Estado:** [x] Corregido y verificado el 19 de agosto de 2026.

**Evidencia:** cadenas con `?`/`Ã` en `agenda.tsx` y `clients.tsx`; bloque después de `return` en `clients.tsx:195-220`.

Corregir archivos a UTF-8, eliminar código inalcanzable y añadir check que detecte mojibake en textos de UI.

### LOW-06 — Uso de FileSystem legacy

`clients.tsx` importa `expo-file-system/legacy`. Migrar a la API actual de Expo, especialmente al corregir el ciclo de vida de exportaciones temporales.

### LOW-07 — Componentes y pantallas monolíticos

Mayores archivos:

| Archivo                | Líneas aproximadas |
| ---------------------- | -----------------: |
| `dashboard.tsx`        |              3.372 |
| `agenda.tsx`           |              2.087 |
| `clients.tsx`          |              1.818 |
| `client-detail.tsx`    |              1.811 |
| `wallet.tsx`           |              1.373 |
| `cash-register.tsx`    |              1.295 |
| `RegistrationFlow.tsx` |              1.270 |
| `inventory.tsx`        |              1.233 |

Separar hooks de datos, casos de uso, modelos de formulario y componentes presentacionales. Primero fijar pruebas de comportamiento; después refactorizar por módulo.

## 7. Privacidad y cumplimiento de producto

No se encontraron enlaces o pantallas de política de privacidad, términos, soporte o explicación completa del tratamiento de contactos/ubicación/fotos dentro de la app. Es posible que existan fuera del repositorio, pero no son accesibles desde Ajustes ni desde el registro revisado.

Antes de publicar:

- política de privacidad accesible antes del registro y desde Ajustes;
- finalidad, retención, terceros y eliminación de contactos, fotos, ubicación y PII;
- declaración coherente de permisos en Play Console/App Store;
- mecanismo de soporte y reporte de incidentes;
- exportación/borrado de cuenta comprensible y verificable;
- inventario de SDKs y datos transferidos a Google/Firebase/PayPhone/QuickChart;
- revisión legal aplicable al país de operación.

No se incluyó una conclusión jurídica; requiere revisión profesional sobre la operación real.

## 8. Controles positivos encontrados

- Token nativo almacenado con Expo SecureStore y `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
- El token no se incluye en logs ni se guarda en AsyncStorage.
- Timeout HTTP global de 20 segundos y soporte de cancelación.
- Formularios de autenticación con React Hook Form y Zod.
- Contraseña visualmente protegida y autocomplete correcto en login.
- Cierre de sesión normal limpia token local aun si el backend no responde.
- Logout desde Ajustes limpia QueryClient.
- Importación de contactos solicita permiso en contexto y solo lee nombre/teléfono.
- Fotos tienen validación de tamaño antes de envío en varios flujos.
- Rutas principales redirigen cuando no existe sesión.
- Las operaciones mutantes muestran estados pendientes en numerosos botones.
- TypeScript estricto, typecheck y build exitosos.
- El AAB inspeccionado no está firmado con el keystore debug rastreado.

## 9. Plan de remediación

### P0 — Antes de publicar

1. Sustituir polling por rango/eventos y detener actividad en background.
2. Namespacing de caché y limpieza total al cambiar usuario/organización.
3. Corregir restore offline y expiración global de sesión.
4. Implementar recuperación completa de contraseña/deep link.
5. Unificar estrategia Expo/native y hacer fallar release sin firma correcta.
6. Eliminar permisos no usados y definir backup seguro.
7. Añadir pruebas de los seis puntos anteriores.

### P1 — Antes o al inicio del piloto

1. Revocar push token al logout y cerrar navegación de notificaciones.
2. Corregir fecha civil de wallet.
3. Exportaciones temporales seguras y reemplazo de `xlsx`.
4. AppState/NetInfo, Error Boundary y validación de respuestas críticas.
5. Privacidad de pantalla, política legal y consentimiento de contactos.
6. Actualizar patches Expo y obtener Expo Doctor 21/21.
7. Lint mobile en verde y accesibilidad manual.

### P2 — Estabilización

1. Reducir bundle/assets y habilitar optimizaciones release.
2. QR local, deep links verificados y FileSystem actual.
3. Refactor progresivo de pantallas monolíticas.
4. Telemetría mobile redactada: crashes, ANR, latencia, offline, versión y dispositivo.

## 10. Matriz mínima de pruebas exigida

| Área          | Caso obligatorio                                                      |
| ------------- | --------------------------------------------------------------------- |
| Sesión        | Arranque offline conserva token y permite reintentar                  |
| Sesión        | 401 simultáneos producen un único logout y limpian caché              |
| Tenant        | Cambio A→B nunca renderiza PII/caja/inventario de A                   |
| Agenda        | Día/semana/mes hacen una query por rango y se pausan en background    |
| Recovery      | Correo → deep link → nueva contraseña → login                         |
| Push          | Logout revoca token y no navega a rutas fuera de allowlist            |
| Fechas        | 19:00–23:59 Ecuador y cambio de mes/año                               |
| Exportación   | Crea archivo válido, comparte y elimina temporal                      |
| Permisos      | Denegado/permanente/otorgado para contactos, cámara, ubicación y push |
| Release       | Manifest mínimo, HTTPS, firma esperada y Expo Doctor 21/21            |
| Accesibilidad | TalkBack/VoiceOver, 200 % de fuente, foco modal y touch targets       |
| Resiliencia   | 408, 429, 500, respuesta inválida y reconexión                        |

## 11. Criterios para declarar la app mobile lista

La app podrá considerarse lista para un piloto real cuando:

- no queden hallazgos altos abiertos;
- typecheck, lint, tests, Expo Doctor y build estén verdes desde checkout limpio;
- el cambio de cuenta/tenant haya sido probado sin fuga visual de caché;
- agenda no genere polling masivo ni actividad en background;
- recuperación y expiración de sesión funcionen de extremo a extremo;
- permisos y manifest release correspondan a funciones reales;
- el pipeline rechace firma/configuración incorrecta;
- privacidad, exportación y push hayan sido revisados en dispositivos reales;
- exista cobertura E2E de login, onboarding, agenda, clientes, caja y wallet;
- Android e iOS hayan pasado pruebas de accesibilidad, red lenta/offline y actualización.

## 12. Referencias técnicas

- Expo SecureStore y Android Auto Backup: <https://docs.expo.dev/versions/latest/sdk/securestore/#android-auto-backup>
- Expo Continuous Native Generation: <https://docs.expo.dev/workflow/continuous-native-generation/>
- OWASP MASVS: <https://mas.owasp.org/MASVS/>
- Advisory SheetJS prototype pollution: <https://github.com/advisories/GHSA-4r6h-8v6p-xvw6>
- Advisory SheetJS ReDoS: <https://github.com/advisories/GHSA-5pgg-2g8v-p4x9>

---

**Conclusión:** la prioridad de Nava mobile no debe ser añadir pantallas, sino asegurar sesión/tenant, controlar el consumo de red, corregir el proceso nativo de release y proteger PII. Con esos bloqueadores cerrados y una suite E2E mínima, la aplicación puede evolucionar de build funcional a MVP móvil confiable.
