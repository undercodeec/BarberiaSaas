import { readFile } from 'node:fs/promises';

const manifestPath = process.argv[2];
if (!manifestPath)
  throw new Error('Indique la ruta del AndroidManifest.xml fusionado.');

const manifest = await readFile(manifestPath, 'utf8');
const blockedPermissions = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',
  'android.permission.WRITE_CONTACTS',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];
const requiredPermissions = [
  'android.permission.CAMERA',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.READ_CONTACTS',
];

if (!/package="com\.barbersaas\.mobile"/u.test(manifest))
  throw new Error('Application ID Android inesperado.');
if (!/android:versionCode="\d+"/u.test(manifest))
  throw new Error('El manifest no contiene versionCode.');
if (!/android:allowBackup="false"/u.test(manifest))
  throw new Error('Android backup no está desactivado.');
if (/android:debuggable="true"/u.test(manifest))
  throw new Error('El manifest release es debuggable.');
for (const permission of blockedPermissions) {
  if (manifest.includes(`android:name="${permission}"`))
    throw new Error(`Permiso bloqueado presente: ${permission}.`);
}
for (const permission of requiredPermissions) {
  if (!manifest.includes(`android:name="${permission}"`))
    throw new Error(`Permiso funcional ausente: ${permission}.`);
}

const deepLinkDataElements = manifest.match(/<data\b[^>]*>/gu) ?? [];
const productionSchemeElements = deepLinkDataElements.filter((element) =>
  element.includes('android:scheme="barbersaas"'),
);
if (
  productionSchemeElements.some((element) => !element.includes('android:host='))
)
  throw new Error('Deep link barbersaas sin host restringido.');
for (const host of ['accept-invitation', 'reset-password']) {
  if (
    !productionSchemeElements.some((element) =>
      element.includes(`android:host="${host}"`),
    )
  )
    throw new Error(`Deep link requerido ausente: ${host}.`);
}
if (manifest.includes('android:scheme="exp+barber-saas-mobile"'))
  throw new Error('El esquema del cliente de desarrollo aparece en release.');
if (
  !manifest.includes('android:host="reservas.navacloud.app"') ||
  !manifest.includes('android:path="/accept-invitation"') ||
  !manifest.includes('android:path="/reset-password"')
)
  throw new Error('La allowlist de App Links no está completa.');

console.log('Manifest Android release verificado.');
