import { describe, expect, it } from 'vitest';

import { decodeDataUri } from './media-response';
import { ApiError } from './errors';

describe('media-response', () => {
  it('decodifica imágenes admitidas y rechaza otro contenido', () => {
    expect(decodeDataUri('data:image/png;base64,aGVsbG8=')).toMatchObject({
      bytes: Buffer.from('hello'),
      contentType: 'image/png',
    });

    try {
      decodeDataUri('data:text/html;base64,aGVsbG8=');
      throw new Error('Se esperaba contenido multimedia inválido.');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ code: 'INVALID_MEDIA', statusCode: 400 });
    }
  });
});
