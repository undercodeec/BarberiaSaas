import { phoneNumberToE164 } from './phone-number';

describe('phoneNumberToE164', () => {
  it('normaliza un celular ecuatoriano local a E.164', () => {
    expect(phoneNumberToE164('099 123 4567', 'EC')).toBe('+593991234567');
  });

  it('conserva y valida numeros internacionales', () => {
    expect(phoneNumberToE164('+1 (415) 555-2671', 'EC')).toBe('+14155552671');
  });

  it('rechaza numeros que no se pueden representar validamente', () => {
    expect(phoneNumberToE164('12345', 'EC')).toBeNull();
    expect(phoneNumberToE164('0991234567')).toBeNull();
  });
});
