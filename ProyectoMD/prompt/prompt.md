Quiero implementar en **Nava Mobile para Android** un sistema NATIVO de actualización de la aplicación mediante la funcionalidad oficial **Google Play In-App Updates**.

Antes de modificar código, analiza la arquitectura actual completa de:

* `apps/mobile`
* `apps/mobile/android`
* configuración Gradle
* `MainActivity`
* `MainApplication`
* Expo / React Native
* navegación actual de la app
* ciclo de vida de la aplicación

NO implementes nada basado en suposiciones. Adapta la solución a la arquitectura real existente.

## Objetivo

Cuando exista en Google Play una versión de Nava con un `versionCode` superior a la versión instalada, quiero que la propia aplicación pueda detectar esa actualización mediante Google Play y ofrecer al usuario actualizarla sin necesidad de implementar un backend propio para comparar versiones.

La implementación debe utilizar exclusivamente la API oficial:

**Google Play In-App Updates / Play Core**

Dependencia oficial actual:

```gradle
implementation "com.google.android.play:app-update:2.1.0"
```

Si el proyecto Android utiliza Kotlin, utiliza las APIs Kotlin/Java oficiales apropiadas.

No utilizar paquetes React Native de terceros para esta funcionalidad si puede implementarse limpiamente mediante el proyecto Android nativo existente.

No implementar Expo Updates, EAS Update, CodePush ni ningún mecanismo OTA.

## Comportamiento requerido

### 1. Comprobación automática

Cuando Nava inicia y entra en estado activo, comprobar mediante Google Play si existe una actualización disponible.

También debe poder volver a comprobarse cuando la aplicación regresa desde segundo plano, pero evita ejecutar comprobaciones innecesarias repetidamente durante la misma sesión.

La comprobación NO debe:

* consultar una API propia de Nava;
* consultar manualmente la página web de Google Play;
* comparar versiones mediante scraping;
* contener números de versión hardcodeados.

Google Play debe ser la fuente de verdad.

### 2. Actualizaciones normales

Implementar inicialmente el flujo:

`AppUpdateType.FLEXIBLE`

Cuando Google Play indique:

`UpdateAvailability.UPDATE_AVAILABLE`

y permita:

`AppUpdateType.FLEXIBLE`

debe iniciar el flujo oficial de actualización de Google Play.

El usuario debe poder continuar utilizando Nava mientras Google Play descarga la actualización.

### 3. Actualización descargada

Registrar correctamente `InstallStateUpdatedListener`.

Cuando el estado alcance:

`InstallStatus.DOWNLOADED`

mostrar dentro de Nava una interfaz sencilla indicando:

**“Actualización lista”**

Texto aproximado:

**“La nueva versión de Nava ya se descargó. Reinicia la aplicación para completar la actualización.”**

Botón:

**“Actualizar ahora”**

Al presionarlo ejecutar:

`appUpdateManager.completeUpdate()`

No crear un mecanismo de instalación propio.

### 4. Reanudación

Si Nava se cierra o pasa a segundo plano durante el proceso, al regresar comprobar el estado actual.

Si existe una actualización flexible ya descargada, volver a ofrecer completar la actualización.

Gestionar correctamente también los estados intermedios para evitar iniciar múltiples flujos simultáneamente.

### 5. Preparar soporte futuro para actualización crítica

Dejar la arquitectura preparada para que en el futuro podamos utilizar:

`AppUpdateType.IMMEDIATE`

para versiones críticas.

NO quiero que todas las actualizaciones sean obligatorias actualmente.

El comportamiento por defecto debe ser `FLEXIBLE`.

No implementar todavía un backend para decidir prioridades.

Si Google Play proporciona `updatePriority` o `clientVersionStalenessDays`, encapsular la lectura de esos valores para que puedan utilizarse posteriormente, pero no convertirlos ahora en reglas arbitrarias.

### 6. React Native / Expo

Nava utiliza React Native/Expo pero mantiene proyecto Android nativo.

Integra Play In-App Updates de manera compatible con la arquitectura existente.

Si es necesario crear un Native Module o puente Kotlin → React Native, créalo siguiendo la arquitectura actual del proyecto.

No ejectar ni rehacer innecesariamente el proyecto Android.

No ejecutar `expo prebuild` si pudiera sobrescribir personalizaciones existentes.

No introducir Expo Updates.

No modificar configuración de Google Play, Firebase, Maps, notificaciones, PayPhone o cualquier otra funcionalidad que no corresponda a esta tarea.

### 7. Ciclo de vida

La implementación debe evitar:

* listeners duplicados;
* memory leaks;
* lanzar dos ventanas de actualización;
* ejecutar comprobaciones simultáneas;
* errores al rotar/recrear Activity;
* bloquear el inicio de sesión;
* bloquear navegación normal;
* crashes si Google Play no devuelve información;
* crashes si la aplicación fue instalada fuera de Google Play.

Registrar y eliminar correctamente el listener cuando corresponda.

### 8. Manejo de errores

Si la consulta de Google Play falla:

* Nava debe continuar funcionando normalmente;
* no mostrar un error técnico al usuario;
* registrar únicamente información diagnóstica segura;
* no hacer crash;
* permitir comprobar nuevamente posteriormente.

Si la app fue instalada mediante APK/ADB durante desarrollo y Play In-App Updates no está disponible, la aplicación debe seguir funcionando normalmente.

### 9. Entornos

La funcionalidad debe estar orientada a builds Android distribuidos por Google Play.

No asumir que funcionará en:

* APK instalado manualmente;
* ADB;
* desarrollo local;
* Expo Go.

Documentar claramente esta limitación.

### 10. Testing

Añade las pruebas razonables que permita la arquitectura.

Después verifica como mínimo:

```text
pnpm --filter @barber-saas/mobile typecheck
```

y las pruebas Mobile relacionadas.

También ejecuta las verificaciones Gradle necesarias para comprobar que Android continúa compilando.

No generar todavía un AAB de producción si no es necesario para validar la implementación.

## Prueba real con Google Play

Documenta cómo comprobar posteriormente la funcionalidad.

La prueba debe contemplar:

1. Tener instalada desde Google Play una versión anterior de Nava.
2. Publicar una versión con `versionCode` superior en un track de pruebas.
3. La cuenta del dispositivo debe tener acceso a ese track.
4. La nueva versión debe estar disponible para ese usuario.
5. Abrir la versión anterior.
6. Nava consulta Play In-App Updates.
7. Google Play informa que existe la actualización.
8. Aparece el flujo oficial de actualización.
9. Descargar actualización.
10. Nava detecta `DOWNLOADED`.
11. Pulsar “Actualizar ahora”.
12. Google Play instala la nueva versión.
13. Confirmar que la aplicación abre con el nuevo `versionCode`.

Ten presente que el sistema debe probarse mediante una instalación administrada por Google Play; no considerar una instalación ADB como prueba válida del flujo real.

## Seguridad y mantenimiento

No agregues:

* secretos;
* tokens;
* APIs externas;
* servicios cloud;
* permisos Android innecesarios;
* comprobadores de versión hechos a mano.

No modificar código no relacionado.

Usar la API oficial de Google Play como autoridad de disponibilidad de actualización.

## Documentación

Una vez terminada y validada la implementación, actualiza:

`ProyectoMD/ESTADO_PROYECTO.md`

Documenta:

* que Android utiliza Google Play In-App Updates;
* archivos modificados;
* dependencia utilizada;
* estrategia `FLEXIBLE`;
* comportamiento al detectar actualización;
* comportamiento cuando termina la descarga;
* manejo al volver del background;
* pruebas ejecutadas;
* limitaciones para APK/ADB;
* procedimiento para validar mediante un track de Google Play.

No reemplaces información vigente ni vuelvas a introducir procedimientos Android antiguos.

## Entrega final

Al finalizar dame un resumen con:

1. diagnóstico de la arquitectura encontrada;
2. archivos modificados;
3. implementación realizada;
4. dependencia Play utilizada;
5. flujo completo de actualización;
6. pruebas ejecutadas y resultados;
7. cualquier limitación encontrada;
8. pasos exactos que debo realizar yo posteriormente en Google Play Console para probarlo.

No realices cambios en Google Play Console ni despliegues una versión por tu cuenta.
