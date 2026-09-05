import { createHash } from 'node:crypto';

import type { FastifyReply } from 'fastify';

import { ApiError } from './errors';

const DATA_URI_PATTERN =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/u;

export interface DecodedMedia {
  readonly bytes: Buffer;
  readonly contentType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export type MediaVisibility = 'private' | 'public';

function invalidMedia(): ApiError {
  return new ApiError(
    400,
    'INVALID_MEDIA',
    'El contenido multimedia no es válido.',
  );
}

export function decodeDataUri(value: string): DecodedMedia {
  const match = DATA_URI_PATTERN.exec(value);
  const contentType = match?.[1];
  const encoded = match?.[2];
  if (!contentType || !encoded || encoded.length % 4 !== 0)
    throw invalidMedia();
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw invalidMedia();
  return { bytes, contentType: contentType as DecodedMedia['contentType'] };
}

function requestMatchesEtag(reply: FastifyReply, etag: string): boolean {
  const value = reply.request.headers['if-none-match'];
  if (!value) return false;
  return value
    .split(',')
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === '*' || candidate === etag);
}

export function sendMedia(
  reply: FastifyReply,
  media: DecodedMedia,
  visibility: MediaVisibility,
): FastifyReply {
  const etag = `"sha256-${createHash('sha256').update(media.bytes).digest('base64url')}"`;
  reply
    .header('cache-control', `${visibility}, max-age=300`)
    .header('etag', etag)
    .type(media.contentType);
  if (requestMatchesEtag(reply, etag)) return reply.code(304).send();
  return reply.send(media.bytes);
}
