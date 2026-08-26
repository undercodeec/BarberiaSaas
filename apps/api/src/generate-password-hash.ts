import { stdin, stdout } from 'node:process';

import { hashPassword } from './security';

async function readPassword(): Promise<string> {
  if (!stdin.isTTY) {
    throw new Error('Ejecute este comando desde una terminal interactiva.');
  }

  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write('Contraseña (no se mostrará): ');
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();

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
  const password = await readPassword();
  if (password.length < 12 || password.length > 72) {
    throw new Error('La contraseña debe tener entre 12 y 72 caracteres.');
  }
  stdout.write(`${await hashPassword(password)}\n`);
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'No se pudo crear el hash.',
  );
  process.exitCode = 1;
});
