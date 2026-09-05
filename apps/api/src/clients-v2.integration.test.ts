import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createDatabaseClient } from '@barber-saas/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApi } from './app';
import { readConfig } from './config';
import { observeDatabaseQuery } from './request-metrics';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const sessionFile = fileURLToPath(
  new URL('../.secrets/performance-session.json', import.meta.url),
);
const describeWithFixture =
  process.env.PERFORMANCE_FIXTURE_TESTS === '1' &&
  testDatabaseUrl &&
  existsSync(sessionFile)
    ? describe
    : describe.skip;

interface ClientPageResponse {
  readonly items: readonly { readonly id: string }[];
  readonly nextCursor: string | null;
}

interface ClientNotesPageResponse {
  readonly items: readonly {
    readonly hasPhoto: boolean;
    readonly id: string;
    readonly photoUrl: string | null;
  }[];
  readonly nextCursor: string | null;
}

interface ClientImportResponse {
  readonly results: readonly {
    readonly clientId: string | null;
    readonly inputIndex: number;
    readonly reason: string | null;
    readonly status: 'created' | 'rejected' | 'skipped';
  }[];
}

describeWithFixture('clientes v2 con fixture local', () => {
  const session = JSON.parse(readFileSync(sessionFile, 'utf8')) as {
    readonly token: string;
  };
  const database = createDatabaseClient({
    connectionString: testDatabaseUrl!,
    queryObserver: ({ durationMs }) => observeDatabaseQuery(durationMs),
  });
  let app: Awaited<ReturnType<typeof buildApi>>;
  const createdClientIds: string[] = [];
  let createdNoteId: string | undefined;

  beforeAll(async () => {
    app = await buildApi({
      config: readConfig({
        API_HOST: '127.0.0.1',
        API_PORT: '4000',
        APP_ENV: 'local',
        CORS_ORIGIN: 'http://localhost:3000',
        DATABASE_URL: testDatabaseUrl!,
        MOBILE_INVITATION_URL: 'barbersaas://accept-invitation',
        MOBILE_RESET_URL: 'barbersaas://reset-password',
      }),
      database,
    });
  });

  afterAll(async () => {
    if (createdNoteId)
      await database.clientNote.delete({ where: { id: createdNoteId } });
    if (createdClientIds.length > 0) {
      await database.client.deleteMany({
        where: { id: { in: createdClientIds } },
      });
    }
    await app.close();
  });

  it('pagina el tenant del fixture sin duplicar registros', async () => {
    const headers = { authorization: `Bearer ${session.token}` };
    const first = await app.inject({
      headers,
      method: 'GET',
      url: '/v2/clients?limit=2',
    });
    expect(first.statusCode, first.body).toBe(200);
    const firstPage = first.json<ClientPageResponse>();
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const second = await app.inject({
      headers,
      method: 'GET',
      url: `/v2/clients?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
    });
    expect(second.statusCode, second.body).toBe(200);
    const firstPageIds = firstPage.items.map(({ id }) => id);
    const secondPageIds = second
      .json<ClientPageResponse>()
      .items.map(({ id }) => id);
    expect(secondPageIds).not.toEqual(expect.arrayContaining(firstPageIds));
    expect(Number(first.headers['x-nava-query-count'])).toBeLessThanOrEqual(4);
  });

  it('valida filtros y cursores antes de consultar el listado', async () => {
    const headers = { authorization: `Bearer ${session.token}` };
    const search = await app.inject({
      headers,
      method: 'GET',
      url: '/v2/clients?limit=2&search=Cliente%200001',
    });
    expect(search.statusCode, search.body).toBe(200);
    expect(search.json<ClientPageResponse>().items).toHaveLength(2);

    const invalidCursor = await app.inject({
      headers,
      method: 'GET',
      url: '/v2/clients?cursor=not-a-cursor',
    });
    expect(invalidCursor.statusCode).toBe(400);
    expect(invalidCursor.json()).toMatchObject({ code: 'INVALID_CURSOR' });

    const tooLargePage = await app.inject({
      headers,
      method: 'GET',
      url: '/v2/clients?limit=101',
    });
    expect(tooLargePage.statusCode).toBe(400);
  });

  it('pagina notas sin Base64 y sirve fotos privadas con ETag', async () => {
    const headers = { authorization: `Bearer ${session.token}` };
    const clients = await app.inject({
      headers,
      method: 'GET',
      url: '/v2/clients?limit=1',
    });
    const clientId = clients.json<ClientPageResponse>().items[0]?.id;
    expect(clientId).toEqual(expect.any(String));
    const created = await app.inject({
      headers,
      method: 'POST',
      payload: {
        description: 'Nota de rendimiento para verificar foto privada.',
        photoData: 'data:image/png;base64,aGVsbG8=',
      },
      url: `/v1/clients/${clientId}/notes`,
    });
    expect(created.statusCode, created.body).toBe(201);
    createdNoteId = created.json<{ readonly note: { readonly id: string } }>()
      .note.id;

    const notes = await app.inject({
      headers,
      method: 'GET',
      url: `/v2/clients/${clientId}/notes?limit=1`,
    });
    expect(notes.statusCode, notes.body).toBe(200);
    expect(notes.body).not.toContain('data:image');
    const page = notes.json<ClientNotesPageResponse>();
    const note = page.items.find(({ id }) => id === createdNoteId);
    expect(note).toMatchObject({ hasPhoto: true });
    expect(note?.photoUrl).toEqual(expect.any(String));
    expect(Number(notes.headers['x-nava-query-count'])).toBeLessThanOrEqual(4);

    const photo = await app.inject({
      headers,
      method: 'GET',
      url: note!.photoUrl!,
    });
    expect(photo.statusCode).toBe(200);
    expect(photo.headers['content-type']).toBe('image/png');
    expect(photo.headers.etag).toEqual(expect.any(String));
    const notModified = await app.inject({
      headers: { ...headers, 'if-none-match': photo.headers.etag! },
      method: 'GET',
      url: note!.photoUrl!,
    });
    expect(notModified.statusCode).toBe(304);
  });

  it('importa contactos en lote, conserva el orden y omite duplicados', async () => {
    const headers = { authorization: `Bearer ${session.token}` };
    const phone = `+593${Date.now().toString().slice(-9)}`;
    const response = await app.inject({
      headers,
      method: 'POST',
      payload: {
        contacts: [
          { fullName: 'Contacto de lote uno', phone },
          { fullName: 'Contacto de lote repetido', phone },
        ],
      },
      url: '/v2/clients/import',
    });
    expect(response.statusCode, response.body).toBe(201);
    const body = response.json<ClientImportResponse>();
    expect(body.results).toEqual([
      expect.objectContaining({
        inputIndex: 0,
        reason: null,
        status: 'created',
      }),
      expect.objectContaining({
        clientId: null,
        inputIndex: 1,
        reason: 'already_exists',
        status: 'skipped',
      }),
    ]);
    const createdId = body.results[0]?.clientId;
    expect(createdId).toEqual(expect.any(String));
    createdClientIds.push(createdId!);
  });
});
