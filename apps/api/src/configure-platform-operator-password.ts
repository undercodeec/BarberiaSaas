import { createDatabaseClient } from '@barber-saas/database';
import { config as loadEnvironment } from 'dotenv';
import { stdin, stdout } from 'node:process';

import { hashPassword, verifyPassword } from './security';

loadEnvironment({ path: process.env.API_ENV_FILE ?? '.env' });

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatoria.`);
  return value;
}

async function readPassword(prompt: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY)
    throw new Error('Ejecute este comando desde una terminal interactiva.');

  stdout.write(prompt);
  stdin.setEncoding('utf8');
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    const onData = (input: string) => {
      for (const character of input) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Operación cancelada.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (character === '\u0008' || character === '\u007f') {
          value = value.slice(0, -1);
          continue;
        }
        const codePoint = character.codePointAt(0) ?? 0;
        if (codePoint >= 32 && codePoint !== 127) value += character;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    throw new Error(
      'Uso: pnpm --filter @barber-saas/api platform:operator:password -- correo@ejemplo.com',
    );
  }
  const password = await readPassword(
    'Contraseña exclusiva del panel (no se mostrará): ',
  );
  if (password.length < 12 || password.length > 72) {
    throw new Error('La contraseña debe tener entre 12 y 72 caracteres.');
  }
  const confirmation = await readPassword('Repita la contraseña: ');
  if (password !== confirmation)
    throw new Error('Las contraseñas no coinciden.');

  const database = createDatabaseClient({
    connectionString: requiredEnvironment('DATABASE_URL'),
  });
  try {
    const user = await database.user.findUnique({
      include: { platformOperator: true },
      where: { email },
    });
    if (!user?.platformOperator || !user.platformOperator.isActive) {
      throw new Error(
        'No existe un operador de plataforma activo con ese correo.',
      );
    }
    if (
      user.passwordHash &&
      (await verifyPassword(password, user.passwordHash))
    ) {
      throw new Error(
        'La contraseña del panel debe ser distinta a la contraseña de la cuenta Nava.',
      );
    }
    const now = new Date();
    await database.$transaction([
      database.platformOperator.update({
        data: {
          adminPasswordHash: await hashPassword(password),
          adminPasswordSetAt: now,
        },
        where: { id: user.platformOperator.id },
      }),
      database.session.updateMany({
        data: { revokedAt: now },
        where: {
          platformAccessChallenges: { some: { verifiedAt: { not: null } } },
          revokedAt: null,
          userId: user.id,
        },
      }),
      database.platformAuditLog.create({
        data: {
          action: 'platform.operator.password_configured',
          actorUserId: user.id,
          entityId: user.platformOperator.id,
          entityType: 'platform_operator',
          metadata: { source: 'interactive_vps_command' },
        },
      }),
    ]);
  } finally {
    await database.$disconnect();
  }
  stdout.write('Contraseña administrativa actualizada.\n');
}

void main().catch((error: unknown) => {
  stderrWrite(error instanceof Error ? error.message : 'Error desconocido.');
  process.exitCode = 1;
});

function stderrWrite(message: string) {
  stdout.write(`Error: ${message}\n`);
}
