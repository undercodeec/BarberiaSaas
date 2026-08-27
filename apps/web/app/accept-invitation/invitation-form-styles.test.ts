import { describe, expect, it } from 'vitest';

import {
  invitationInputStyle,
  invitationScreenStyle,
} from './invitation-form-styles';

describe('campos de invitación', () => {
  it('mantiene texto, cursor y esquema claro visibles sobre la tarjeta blanca', () => {
    expect(invitationScreenStyle).toMatchObject({ colorScheme: 'light' });
    expect(invitationInputStyle).toMatchObject({
      backgroundColor: '#FFFFFF',
      caretColor: '#1C1C1C',
      color: '#1C1C1C',
      WebkitTextFillColor: '#1C1C1C',
    });
  });
});
