# Diseño: candidata móvil de producción 0.1.18

## Objetivo

Preparar una candidata reproducible para Android y iOS a partir de `main`,
sin publicar automáticamente, sin mezclar secretos en Git y sin construir sobre
cambios no revisados. La candidata incrementa la versión pública a `0.1.18` y
el `versionCode` de Android a `40`; el build number de iOS permanece gestionado
por EAS de forma remota.

## Decisión de distribución

- **Android:** Gradle local o el workflow manual de GitHub. No se usa EAS Build,
  OTA, Expo Updates ni CodePush. El AAB se firma solo con el certificado de
  upload de Nava y se archiva con versión, código y SHA-256.
- **iOS:** EAS Build con el perfil `production`, seguido de TestFlight. No se
  crea ni versiona una carpeta `ios/`; certificados, perfiles y acceso Apple
  viven exclusivamente en EAS y App Store Connect.
- **No publicación automática:** la subida a Play Console, el rollout y el
  submit de TestFlight requieren una sesión externa autenticada y aceptación
  humana de los checks de cada tienda.

## Seguridad y configuración

- `apps/mobile/credentials.json` existe solo como archivo local ignorado; no
  está versionado. No se leerá, modificará ni incluirá en commits, logs o
  artefactos. La firma Android seguirá llegando por propiedades Gradle seguras
  o secretos de GitHub.
- Los únicos valores públicos que se incorporan al binario son
  `EXPO_PUBLIC_APP_ENV=production`, `EXPO_PUBLIC_API_URL` HTTPS y el host
  correspondiente en `EXPO_PUBLIC_API_ALLOWED_HOSTS`, además de las claves de
  Maps restringidas por plataforma. Ninguna credencial de API, Apple, Play ni
  keystore se almacenará en el repositorio.
- La configuración iOS debe mantener `app.navacloud.nava`,
  `applinks:reservas.navacloud.app`, la declaración de cifrado no exento,
  `ascAppId` y `autoIncrement` remoto.

## Cambios de repositorio

1. Sincronizar `apps/mobile/app.json` y Gradle en `0.1.18` / `40`.
2. Fortalecer las verificaciones de release para comparar versión Android,
   manifest fusionado, firma, bundle JavaScript y ausencia de OTA; conservar
   el guard existente que rechaza la clave debug.
3. Documentar un runbook único de preflight, generación, archivo, comprobación
   y entrega para Android y el equivalente EAS/TestFlight para iOS.
4. Registrar evidencia en `ProyectoMD/ESTADO_PROYECTO.md` solamente cuando se
   haya generado el AAB o terminado el build remoto; no se marcará como
   publicado antes de Play Console/TestFlight.

## Precondiciones y bloqueos

- El árbol debe estar limpio y el commit exacto debe estar publicado antes de
  generar una candidata. Los cambios actualmente sin confirmar se revisan y
  confirman separadamente; nunca se incorporan por accidente al AAB/IPA.
- Android requiere las cinco propiedades `NAVA_UPLOAD_*`, el keystore fuera de
  Git y la verificación de que `40` no esté usado en Play Console.
- iOS requiere una sesión EAS de la organización propietaria, el entorno EAS
  `production` con URL/host API y Maps iOS válidos, y acceso Apple Developer /
  App Store Connect. Sin ellos solo se puede completar el preflight local.

## Validación y aceptación

Antes de generar binarios se ejecutan instalación inmutable, typecheck,
pruebas Mobile y verificadores de configuración Android/iOS. Android además
exige manifest fusionado release, `signingReport`, `bundleRelease`, `jarsigner`,
presencia de `base/assets/index.android.bundle`, inspección de ausencia OTA y
SHA-256 archivado. iOS exige el verificador estático, Expo Doctor y el build
EAS exitoso antes de `submit`; TestFlight interno es la aceptación inicial.

El AAB solo se carga en track interno/cerrado tras completar Data safety,
URL de privacidad y cuenta/instrucciones de revisión. El estado final debe
registrar commit, versión, código/build remoto, hash, track, porcentaje de
rollout y prueba física, sin secretos.
