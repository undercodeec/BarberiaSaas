import { describe, expect, it } from 'vitest';

import {
  PlatformOperatorPasswordCliError,
  parsePlatformOperatorPasswordEmail,
} from './platform-operator-password-cli';

describe('parsePlatformOperatorPasswordEmail', () => {
  it('accepts and normalizes the direct email argument', () => {
    expect(
      parsePlatformOperatorPasswordEmail(['  Soporte@NavaCloud.app  ']),
    ).toBe('soporte@navacloud.app');
  });

  it('accepts the email argument after pnpm separator', () => {
    expect(
      parsePlatformOperatorPasswordEmail(['--', 'soporte@navacloud.app']),
    ).toBe('soporte@navacloud.app');
  });

  it('ignores a separator surrounded by whitespace', () => {
    expect(
      parsePlatformOperatorPasswordEmail(['  --  ', 'soporte@navacloud.app']),
    ).toBe('soporte@navacloud.app');
  });

  it('reports usage when no email argument was provided', () => {
    expect(() => parsePlatformOperatorPasswordEmail([])).toThrow(
      PlatformOperatorPasswordCliError,
    );
    try {
      parsePlatformOperatorPasswordEmail([]);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'USAGE',
        message: expect.stringContaining('API_ENV_FILE=/etc/nava/api.env'),
      });
    }
  });

  it('rejects malformed email before a database connection is opened', () => {
    expect(() => parsePlatformOperatorPasswordEmail(['not-an-email'])).toThrow(
      new PlatformOperatorPasswordCliError(
        'INVALID_EMAIL',
        'El correo del operador no es válido.',
      ),
    );
  });
});
