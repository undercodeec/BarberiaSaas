import { describe, expect, it } from 'vitest';

import {
  initialInvitationStep,
  invitationTokenFromSearch,
} from './invitation-flow';

describe('flujo de aceptación de invitación', () => {
  it('conserva sólo un token opaco válido y ofrece autenticación web', () => {
    const token = 'x'.repeat(43);

    expect(invitationTokenFromSearch(token)).toBe(token);
    expect(initialInvitationStep(token)).toBe('choice');
    expect(invitationTokenFromSearch('barbersaas://accept-invitation')).toBe(
      null,
    );
  });

  it('muestra un enlace inválido sin intentar abrir la aplicación móvil', () => {
    expect(initialInvitationStep(null)).toBe('invalid');
    expect(initialInvitationStep('short')).toBe('invalid');
  });
});
