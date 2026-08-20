import { generateLocalQrMatrix } from './qr-code';

describe('local QR generator', () => {
  it('creates a deterministic version 5 matrix without network access', () => {
    const value = 'https://reservas.navacloud.app/nava-centro';
    const first = generateLocalQrMatrix(value);
    expect(first).toEqual(generateLocalQrMatrix(value));
    expect(first).toHaveLength(37);
    expect(first?.every((row) => row.length === 37)).toBe(true);
  });

  it('draws the three finder patterns and fixed dark module', () => {
    const matrix = generateLocalQrMatrix(
      'https://reservas.navacloud.app/nava-centro',
    )!;
    for (const [x, y] of [
      [3, 3],
      [33, 3],
      [3, 33],
      [8, 29],
    ] as const)
      expect(matrix[y]![x]).toBe(true);
  });

  it('rejects empty or oversized values instead of producing an invalid QR', () => {
    expect(generateLocalQrMatrix('')).toBeNull();
    expect(
      generateLocalQrMatrix(`https://example.com/${'a'.repeat(100)}`),
    ).toBeNull();
  });
});
