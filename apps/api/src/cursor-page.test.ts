import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor, sliceCursorPage } from './cursor-page';
import { ApiError } from './errors';

describe('cursor-page', () => {
  it('conserva versión, recurso, valores e identificador', () => {
    const token = encodeCursor('client', ['Ana', true], 'client-2');

    expect(decodeCursor(token, 'client')).toEqual({
      id: 'client-2',
      kind: 'client',
      values: ['Ana', true],
      version: 1,
    });
  });

  it('rechaza un cursor de otro recurso', () => {
    const token = encodeCursor('client', ['Ana'], 'client-2');

    try {
      decodeCursor(token, 'inventory-product');
      throw new Error('Se esperaba un cursor inválido.');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ code: 'INVALID_CURSOR', statusCode: 400 });
    }
  });

  it('corta la página limit + 1 y crea el cursor siguiente', () => {
    const result = sliceCursorPage(
      [{ id: '1' }, { id: '2' }, { id: '3' }],
      2,
      (row) => encodeCursor('client', [row.id], row.id),
    );

    expect(result.items.map(({ id }) => id)).toEqual(['1', '2']);
    expect(decodeCursor(result.nextCursor!, 'client').id).toBe('2');
  });
});
