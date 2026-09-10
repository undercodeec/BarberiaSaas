# Runbook de candidata móvil de producción

Este procedimiento prepara una candidata de Nava, actualmente `0.1.18` y
Android `versionCode` `40`. No publica en Google Play ni en App Store Connect.
No lea, copie ni modifique `apps/mobile/credentials.json`: es local e
ignorado. Los keystores, contraseñas, cuentas Apple y secretos viven fuera de
Git.

## Preflight obligatorio

Ejecute desde la raíz. La candidata solo puede provenir del commit ya publicado
en `main`; no mezcle cambios locales, incluidos cambios de otros trabajos.

```powershell
git fetch origin main
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git diff --quiet HEAD origin/main
pnpm install --frozen-lockfile
$env:NODE_ENV = 'production'
$env:EXPO_PUBLIC_APP_ENV = 'production'
$env:EXPO_PUBLIC_API_URL = 'https://api.navacloud.app'
$env:EXPO_PUBLIC_API_ALLOWED_HOSTS = 'api.navacloud.app'
pnpm --filter @barber-saas/mobile typecheck
pnpm --filter @barber-saas/mobile test
pnpm --filter @barber-saas/mobile verify:ios-release-config
```

`git status --short` no debe producir salida, la rama debe ser `main` y ambos
hashes deben ser iguales. Confirme en Play Console que el código `40` no fue
utilizado. Las variables públicas API y las claves Maps restringidas deben
corresponder al entorno de producción; no las escriba en archivos versionados.

## Android: AAB local o workflow manual

El equipo local debe tener las cinco propiedades `NAVA_UPLOAD_*` en su
configuración segura de Gradle y el keystore fuera del repositorio:
`NAVA_UPLOAD_STORE_FILE`, `NAVA_UPLOAD_KEY_ALIAS`,
`NAVA_UPLOAD_STORE_PASSWORD`, `NAVA_UPLOAD_KEY_PASSWORD` y
`NAVA_UPLOAD_CERT_SHA256`. Exporte también la huella pública
`NAVA_UPLOAD_CERT_SHA256` al entorno solo para la comprobación posterior.

```powershell
Set-Location apps/mobile/android
.\gradlew.bat :app:signingReport --no-daemon --console=plain
.\gradlew.bat :app:bundleRelease --no-daemon --console=plain
Set-Location ../../..
pnpm --filter @barber-saas/mobile verify:android-release --manifest apps/mobile/android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml --aab apps/mobile/android/app/build/outputs/bundle/release/app-release.aab
$archive = 'apps/mobile/releases/Nava-0.1.18-code40.aab'
New-Item -ItemType Directory -Force apps/mobile/releases | Out-Null
Copy-Item apps/mobile/android/app/build/outputs/bundle/release/app-release.aab $archive
Get-FileHash $archive -Algorithm SHA256
```

El verificador compara `app.json`, Gradle y manifest fusionado, valida firma y
huella del certificado de upload, exige el bundle JavaScript embebido y rechaza
Expo Updates, CodePush y claves debug. Archive el AAB y su SHA-256 sin
sobrescribir versiones anteriores. Como alternativa, ejecute manualmente el
workflow **Mobile Android release** desde `main`; descarga el AAB y el archivo
`.sha256` como artefactos, sin enviarlos a Play.

Tras completar Data safety, URL de privacidad y credenciales/instrucciones de
revisión, una persona autorizada puede cargar el AAB archivado a un track
interno o cerrado. Registre track, porcentaje de rollout y prueba física solo
después de que ocurran; no marque la candidata como publicada antes de ello.

## iOS: EAS Build y TestFlight

No cree ni versiona una carpeta `ios/`. Desde la misma revisión limpia y con
sesión autenticada de la organización propietaria, confirme que el entorno EAS
`production` tiene la URL/host API y la clave Maps de iOS restringida.

```powershell
pnpm --filter @barber-saas/mobile exec expo-doctor
pnpm --filter @barber-saas/mobile exec eas build --platform ios --profile production
```

Guarde el identificador y URL del build EAS, su commit y el build number remoto.
El perfil conserva `autoIncrement`, `ascAppId`, `app.navacloud.nava`, Universal
Links y la declaración de cifrado no exento. Tras revisar el resultado remoto,
una persona autorizada puede ejecutar el submit hacia TestFlight y realizar la
aceptación inicial interna; ese paso no forma parte de ningún workflow de este
repositorio.

## Evidencia

Solo después de generar el AAB o de que finalice el build EAS, añada a
`ProyectoMD/ESTADO_PROYECTO.md` el commit, versión, código Android o build
number remoto, SHA-256 (Android), URL/ID del build (iOS), track, rollout y
resultado de la prueba física. Nunca incluya secretos ni declare publicación
antes de que Play Console o TestFlight la hayan completado.
