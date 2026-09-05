import { readFile } from 'node:fs/promises';

const app = JSON.parse(
  await readFile(new URL('../app.json', import.meta.url), 'utf8'),
).expo;
const eas = JSON.parse(
  await readFile(new URL('../eas.json', import.meta.url), 'utf8'),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(app.name === 'Nava', 'El nombre iOS de la aplicacion debe ser Nava.');
assert(
  typeof app.version === 'string' && /^\d+\.\d+\.\d+$/u.test(app.version),
  'La version publica debe usar semver de tres componentes.',
);
assert(
  app.ios?.bundleIdentifier === 'app.navacloud.nava',
  'El bundle identifier iOS no coincide con el registrado en App Store Connect.',
);
assert(
  app.ios?.associatedDomains?.includes('applinks:reservas.navacloud.app'),
  'Falta el dominio asociado de reservas para Universal Links.',
);
assert(
  app.ios?.infoPlist?.ITSAppUsesNonExemptEncryption === false,
  'Debe declararse que Nava no usa cifrado no exento.',
);
assert(
  typeof app.extra?.eas?.projectId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      app.extra.eas.projectId,
    ),
  'El projectId de EAS no es valido.',
);
assert(
  eas.cli?.appVersionSource === 'remote',
  'EAS debe administrar el buildNumber iOS remotamente.',
);
assert(
  eas.build?.production?.environment === 'production' &&
    eas.build.production.autoIncrement === true,
  'El perfil production debe usar entorno production y autoIncrement.',
);
assert(
  /^\d+$/u.test(eas.submit?.production?.ios?.ascAppId ?? ''),
  'Falta el Apple ID numerico de App Store Connect para el submit iOS.',
);

console.log('Configuracion iOS de release verificada.');
