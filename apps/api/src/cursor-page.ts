import { z } from 'zod';

import { ApiError } from './errors';

export type CursorKind =
  | 'appointment'
  | 'client'
  | 'client-note'
  | 'inventory-product'
  | 'stock-movement';

const cursorPayloadSchema = z.object({
  id: z.string().min(1).max(200),
  kind: z.enum([
    'appointment',
    'client',
    'client-note',
    'inventory-product',
    'stock-movement',
  ]),
  values: z.array(z.union([z.boolean(), z.number().finite(), z.string()])),
  version: z.literal(1),
});

export interface CursorPayload {
  readonly id: string;
  readonly kind: CursorKind;
  readonly values: readonly (boolean | number | string)[];
  readonly version: 1;
}

export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export function encodeCursor(
  kind: CursorKind,
  values: CursorPayload['values'],
  id: string,
): string {
  return Buffer.from(JSON.stringify({ id, kind, values, version: 1 })).toString(
    'base64url',
  );
}

export function decodeCursor(
  token: string,
  expectedKind: CursorKind,
): CursorPayload {
  try {
    const parsed = cursorPayloadSchema.safeParse(
      JSON.parse(Buffer.from(token, 'base64url').toString('utf8')),
    );
    if (parsed.success && parsed.data.kind === expectedKind) return parsed.data;
  } catch {
    // La respuesta no debe distinguir entre un Base64 inválido y un cursor ajeno.
  }
  throw new ApiError(400, 'INVALID_CURSOR', 'El cursor no es válido.');
}

export function sliceCursorPage<T>(
  rows: readonly T[],
  limit: number,
  cursorFor: (row: T) => string,
): CursorPage<T> {
  const items = rows.slice(0, limit);
  const lastItem = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && lastItem ? cursorFor(lastItem) : null,
  };
}
