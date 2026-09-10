import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const manifestPath = option('--manifest') ?? process.argv[2];
const aabPath = option('--aab');
const expectedCertificateSha256 =
  option('--expected-certificate-sha256') ??
  process.env.NAVA_UPLOAD_CERT_SHA256;
if (!manifestPath)
  throw new Error('Indique la ruta del AndroidManifest.xml fusionado.');

const [manifest, app, gradle, mobilePackage] = await Promise.all([
  readFile(manifestPath, 'utf8'),
  readFile(new URL('../app.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../android/app/build.gradle', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8').then(
    JSON.parse,
  ),
]);
const expo = app.expo;
const expectedVersionName = expo.version;
const expectedVersionCode = expo.android?.versionCode;
assert(
  typeof expectedVersionName === 'string' &&
    /^\d+\.\d+\.\d+$/u.test(expectedVersionName),
  'app.json debe declarar una version publica semver.',
);
assert(
  Number.isSafeInteger(expectedVersionCode) && expectedVersionCode > 0,
  'app.json debe declarar un versionCode Android positivo.',
);
const gradleVersionName = gradle.match(/versionName\s+"([^"]+)"/u)?.[1];
const gradleVersionCode = gradle.match(
  /NAVA_VERSION_CODE'\)\s*\?:\s*'(\d+)'/u,
)?.[1];
assert(
  gradleVersionName === expectedVersionName,
  `versionName de Gradle (${gradleVersionName ?? 'ausente'}) no coincide con app.json (${expectedVersionName}).`,
);
assert(
  Number(gradleVersionCode) === expectedVersionCode,
  `versionCode de Gradle (${gradleVersionCode ?? 'ausente'}) no coincide con app.json (${expectedVersionCode}).`,
);
assert(
  !expo.updates && !expo.runtimeVersion,
  'La candidata Android no puede declarar Expo Updates ni runtimeVersion.',
);
assert(
  ![
    ...Object.keys(mobilePackage.dependencies ?? {}),
    ...Object.keys(mobilePackage.devDependencies ?? {}),
  ].some((dependency) =>
    /(?:expo-updates|code-push|codepush)/iu.test(dependency),
  ),
  'La candidata Android no puede depender de Expo Updates ni CodePush.',
);
assert(
  /signingConfig\s+signingConfigs\.release/u.test(gradle) &&
    /NAVA_UPLOAD_CERT_SHA256/u.test(gradle) &&
    /certificado de upload no coincide/u.test(gradle),
  'Gradle debe exigir y verificar el certificado de upload para release.',
);
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
if (
  !new RegExp(`android:versionCode="${expectedVersionCode}"`, 'u').test(
    manifest,
  )
)
  throw new Error(
    'El versionCode del manifest no coincide con app.json/Gradle.',
  );
if (
  !new RegExp(`android:versionName="${expectedVersionName}"`, 'u').test(
    manifest,
  )
)
  throw new Error(
    'El versionName del manifest no coincide con app.json/Gradle.',
  );
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

if (aabPath) {
  await access(aabPath);
  assert(
    typeof expectedCertificateSha256 === 'string' &&
      /^[0-9a-f]{64}$/iu.test(expectedCertificateSha256.replaceAll(':', '')),
    'Indique NAVA_UPLOAD_CERT_SHA256 (o --expected-certificate-sha256) para verificar la firma del AAB.',
  );

  const [
    { stdout: jarContents },
    { stdout: signerOutput },
    { stdout: certificatePem },
  ] = await Promise.all([
    execFileAsync('jar', ['tf', aabPath]),
    execFileAsync('jarsigner', ['-verify', '-strict', '-certs', aabPath]),
    execFileAsync('keytool', ['-printcert', '-rfc', '-jarfile', aabPath]),
  ]);
  const entries = jarContents.split(/\r?\n/u).filter(Boolean);
  assert(
    entries.includes('base/assets/index.android.bundle'),
    'El AAB no contiene base/assets/index.android.bundle.',
  );
  assert(
    !entries.some((entry) => /(?:expo[-_/]?updates|codepush)/iu.test(entry)),
    'El AAB contiene componentes OTA (Expo Updates o CodePush).',
  );
  assert(
    !/Android Debug|CN=Android Debug/iu.test(signerOutput),
    'El AAB fue firmado con una clave debug.',
  );

  const certificateBase64 = certificatePem.match(
    /-----BEGIN CERTIFICATE-----\s*([\s\S]*?)\s*-----END CERTIFICATE-----/u,
  )?.[1];
  assert(
    certificateBase64,
    'No se pudo extraer el certificado firmante del AAB.',
  );
  const actualCertificateSha256 = createHash('sha256')
    .update(Buffer.from(certificateBase64.replaceAll(/\s/gu, ''), 'base64'))
    .digest('hex')
    .toUpperCase();
  assert(
    actualCertificateSha256 ===
      expectedCertificateSha256.replaceAll(':', '').toUpperCase(),
    'La huella SHA-256 del AAB no coincide con el certificado de upload esperado.',
  );
}

console.log(
  `Release Android verificado: ${expectedVersionName} (${expectedVersionCode})${aabPath ? ', AAB firmado y sin OTA.' : '.'}`,
);
