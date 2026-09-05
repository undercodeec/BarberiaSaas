# Flujo nativo y releases de Nava

## Modelo elegido

Nava usa el modelo **bare/native**. La carpeta `android/` se versiona y es la
fuente de verdad del binario Android. Los cambios de `app.json` y de config
plugins deben reflejarse y revisarse también en los archivos nativos.

No ejecute `expo prebuild --clean` como parte automática del release: puede
sobrescribir cambios nativos. Si se usa prebuild para actualizar dependencias,
hágalo en una rama limpia, revise todo el diff de `android/` y conserve solo los
cambios intencionales.

## Firma Android

Un APK/AAB release requiere estas propiedades Gradle, preferiblemente en
`~/.gradle/gradle.properties` o como secretos del proveedor de CI:

```properties
NAVA_UPLOAD_STORE_FILE=C:/ruta/segura/nava-upload.jks
NAVA_UPLOAD_KEY_ALIAS=nava-upload
NAVA_UPLOAD_STORE_PASSWORD=...
NAVA_UPLOAD_KEY_PASSWORD=...
NAVA_UPLOAD_CERT_SHA256=AA:BB:...
```

No guarde el keystore ni las contraseñas en el repositorio. El fingerprint no
es secreto, pero debe obtenerse desde la credencial de upload aprobada y
compararse con Play Console. `bundleRelease`, `assembleRelease` y
`packageRelease` fallan si falta alguna propiedad o si el certificado no
coincide. Nunca se permite sustituir la firma release por la debug.

## Revisión mínima antes de distribuir

1. Ejecute `android/gradlew.bat :app:processReleaseMainManifest` en Windows o
   `android/gradlew :app:processReleaseMainManifest` en Linux/macOS.
2. Revise el manifest fusionado de release, no solo `app.json`. Con AGP 8.12
   la ruta generada es
   `android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml`.
3. Confirme `com.barbersaas.mobile`, `versionCode`, `versionName`,
   `android:allowBackup="false"`, ausencia de `android:debuggable="true"` y
   ausencia de permisos bloqueados.
4. Genere el AAB únicamente con las propiedades de firma configuradas.
5. Compare el certificado del AAB con el fingerprint de upload registrado en
   Play Console antes de publicar.

El workflow manual `.github/workflows/mobile-release.yml` aplica estas mismas
comprobaciones usando secretos de GitHub y conserva el AAB solo si todas pasan.

## iOS y TestFlight

iOS se distribuye como `.ipa` mediante EAS Build desde `apps/mobile`; no se
genera desde Windows ni se versiona una carpeta `ios/` generada. La fuente de
verdad es `app.json`, `app.config.ts` y `eas.json`.

Antes de iniciar un build remoto, ejecutar:

```powershell
Set-Location D:\Documentos\BarberiaSaas
pnpm install --frozen-lockfile
pnpm --filter @barber-saas/mobile verify:ios-release-config
pnpm --filter @barber-saas/mobile typecheck
pnpm --filter @barber-saas/mobile test
```

El perfil `production` debe conservar `environment: production`,
`autoIncrement: true`, el bundle ID `app.navacloud.nava`, el dominio asociado
`applinks:reservas.navacloud.app` y el Apple ID de App Store Connect. Las
credenciales Apple, certificados, perfiles y claves API se administran en EAS
y App Store Connect; nunca se almacenan en el repositorio ni en `.env`.

Desde una sesión autenticada en la cuenta Expo propietaria del proyecto:

```powershell
Set-Location D:\Documentos\BarberiaSaas\apps\mobile
pnpm dlx eas-cli@latest whoami
pnpm dlx eas-cli@latest build --platform ios --profile production
# Cuando el build termine correctamente:
pnpm dlx eas-cli@latest submit --platform ios --profile production
```

El primer uso puede requerir acceso Apple Developer para crear o asociar el
certificado, identificador y provisioning profile. Después de que App Store
Connect procese el binario, probar primero mediante TestFlight interno antes
de enviar la versión a revisión.
