import { z } from 'zod';

const emailSchema = z.email();

export type PlatformOperatorPasswordCliErrorCode = 'INVALID_EMAIL' | 'USAGE';

export class PlatformOperatorPasswordCliError extends Error {
  constructor(
    readonly code: PlatformOperatorPasswordCliErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PlatformOperatorPasswordCliError';
  }
}

export function parsePlatformOperatorPasswordEmail(
  argv: readonly string[],
): string {
  const candidate = argv
    .map((argument) => argument.trim())
    .find((argument) => argument && argument !== '--');
  if (!candidate) {
    throw new PlatformOperatorPasswordCliError(
      'USAGE',
      'Uso: API_ENV_FILE=/etc/nava/api.env pnpm --filter @barber-saas/api platform:operator:password [--] correo@ejemplo.com',
    );
  }
  const email = candidate.toLowerCase();
  if (!emailSchema.safeParse(email).success) {
    throw new PlatformOperatorPasswordCliError(
      'INVALID_EMAIL',
      'El correo del operador no es válido.',
    );
  }
  return email;
}
