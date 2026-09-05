import { randomUUID } from 'node:crypto';

import {
  Prisma,
  type DatabaseClient,
  type MembershipRole,
} from '@barber-saas/database';
import {
  hasPermission,
  type MembershipRole as PermissionRole,
  type OrganizationPermission,
} from '@barber-saas/permissions';
import {
  clientImportSchema,
  clientNotesPageQuerySchema,
  clientPageQuerySchema,
} from '@barber-saas/validation';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import {
  clientScope,
  maskClientPhone,
  type ClientAccessContext,
} from './clients';
import { decodeCursor, encodeCursor, sliceCursorPage } from './cursor-page';
import { ApiError } from './errors';
import { decodeDataUri, sendMedia } from './media-response';
import type { OperationalAccessLoader } from './operational-access';
import { assertCanCreateClients } from './subscription-policy';

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{
  readonly user: { readonly email: string; readonly id: string };
}>;

function permissionRole(role: MembershipRole): PermissionRole {
  return role.toLowerCase() as PermissionRole;
}

function requirePermission(
  role: MembershipRole,
  permission: OrganizationPermission,
) {
  if (hasPermission(permissionRole(role), permission)) return;
  throw new ApiError(
    403,
    'FORBIDDEN',
    'No tienes permiso para realizar esta acción.',
  );
}

function clientAccessContext(
  access: Awaited<ReturnType<OperationalAccessLoader>>,
): ClientAccessContext {
  return {
    locationIds: access.assignedLocationIds,
    membershipId: access.membershipId,
    organizationId: access.organizationId,
    role: access.role,
    userId: access.userId,
  };
}

function phoneDigits(phone: string): string {
  return phone.replaceAll(/\D/gu, '');
}

function escapeLike(value: string): string {
  return value.replaceAll(/[\\%_]/gu, (character) => `\\${character}`);
}

function clientScopeSql(
  context: ClientAccessContext,
  alias: string,
): Prisma.Sql {
  const client = Prisma.raw(alias);
  const base = Prisma.sql`
    ${client}.organization_id = ${context.organizationId}::uuid
    AND ${client}.deleted_at IS NULL
  `;
  if (context.role === 'BARBER') {
    return Prisma.sql`${base} AND EXISTS (
      SELECT 1 FROM appointments appointment
      WHERE appointment.client_id = ${client}.id
        AND appointment.organization_id = ${context.organizationId}::uuid
        AND appointment.professional_membership_id = ${context.membershipId}::uuid
    )`;
  }
  if (context.role === 'RECEPTIONIST') {
    if (context.locationIds.length === 0) return Prisma.sql`${base} AND FALSE`;
    return Prisma.sql`${base} AND EXISTS (
      SELECT 1 FROM appointments appointment
      WHERE appointment.client_id = ${client}.id
        AND appointment.organization_id = ${context.organizationId}::uuid
        AND appointment.location_id IN (${Prisma.join(context.locationIds)})
    )`;
  }
  return base;
}

function labelsFromJson(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((label) => {
    if (
      !label ||
      typeof label !== 'object' ||
      typeof label.id !== 'string' ||
      typeof label.name !== 'string' ||
      typeof label.color !== 'string'
    ) {
      return [];
    }
    return [{ color: label.color, id: label.id, name: label.name }];
  });
}

interface ClientListRow {
  readonly addressLine: string | null;
  readonly birthDate: string | null;
  readonly documentNumber: string | null;
  readonly email: string | null;
  readonly fullName: string;
  readonly id: string;
  readonly labels: unknown;
  readonly lastName: string | null;
  readonly notes: string | null;
  readonly phone: string | null;
}

interface ClientNotePageRow {
  readonly clientExists: boolean;
  readonly createdAt: Date | null;
  readonly description: string | null;
  readonly hasPhoto: boolean | null;
  readonly id: string | null;
}

export function registerClientV2Routes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
  loadOperationalAccess: OperationalAccessLoader,
): void {
  app.get('/v2/clients', async (request) => {
    const { user } = await authenticate(database, request);
    const access = await loadOperationalAccess(request, user.id);
    requirePermission(access.role, 'client.directory.read');
    const input = clientPageQuerySchema.parse(request.query);
    const cursor = input.cursor
      ? decodeCursor(input.cursor, 'client')
      : undefined;
    let cursorName: string | undefined;
    if (cursor) {
      const value = cursor.values[0];
      if (typeof value !== 'string') {
        throw new ApiError(400, 'INVALID_CURSOR', 'El cursor no es válido.');
      }
      cursorName = value;
    }
    const context = clientAccessContext(access);
    const mayReadFullContact = hasPermission(
      permissionRole(context.role),
      'client.contact.read_full',
    );
    const search = input.search ? escapeLike(input.search) : undefined;
    const searchSql = search
      ? mayReadFullContact
        ? Prisma.sql`AND (
            LOWER(client.full_name) LIKE '%' || LOWER(${search}) || '%' ESCAPE '\\'
            OR client.phone LIKE '%' || ${search} || '%' ESCAPE '\\'
            OR LOWER(client.email) LIKE '%' || LOWER(${search}) || '%' ESCAPE '\\'
          )`
        : Prisma.sql`AND LOWER(client.full_name) LIKE '%' || LOWER(${search}) || '%' ESCAPE '\\'`
      : Prisma.empty;
    const cursorSql =
      cursor && cursorName
        ? Prisma.sql`AND (client.full_name, client.id) > (${cursorName}, ${cursor.id}::uuid)`
        : Prisma.empty;
    const labelSql = input.labelId
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM client_label_assignments filter_assignment
          WHERE filter_assignment.client_id = client.id
            AND filter_assignment.label_id = ${input.labelId}::uuid
        )`
      : Prisma.empty;
    const clients = await database.$queryRaw<readonly ClientListRow[]>(
      Prisma.sql`
        SELECT
          client.id,
          client.full_name AS "fullName",
          client.last_name AS "lastName",
          client.phone,
          client.email,
          client.birth_date AS "birthDate",
          client.address_line AS "addressLine",
          client.document_number AS "documentNumber",
          client.notes,
          COALESCE(labels.items, '[]'::jsonb) AS labels
        FROM clients client
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object('id', label.id, 'name', label.name, 'color', label.color)
            ORDER BY label.name, label.id
          ) AS items
          FROM client_label_assignments assignment
          JOIN client_labels label ON label.id = assignment.label_id
          WHERE assignment.client_id = client.id
        ) labels ON TRUE
        WHERE ${clientScopeSql(context, 'client')}
          ${labelSql}
          ${searchSql}
          ${cursorSql}
        ORDER BY client.full_name ASC, client.id ASC
        LIMIT ${input.limit + 1}
      `,
    );
    const page = sliceCursorPage(clients, input.limit, (client) =>
      encodeCursor('client', [client.fullName], client.id),
    );
    return {
      items: page.items.map((client) => ({
        addressLine: mayReadFullContact ? client.addressLine : null,
        birthDate: mayReadFullContact ? client.birthDate : null,
        documentNumber: mayReadFullContact ? client.documentNumber : null,
        email: mayReadFullContact ? client.email : null,
        fullName: client.fullName,
        id: client.id,
        labels: mayReadFullContact ? labelsFromJson(client.labels) : [],
        lastName: mayReadFullContact ? client.lastName : null,
        notes: mayReadFullContact ? client.notes : null,
        phone: mayReadFullContact
          ? client.phone
          : maskClientPhone(client.phone),
      })),
      nextCursor: page.nextCursor,
    };
  });

  app.get('/v2/clients/:clientId/notes', async (request) => {
    const { user } = await authenticate(database, request);
    const access = await loadOperationalAccess(request, user.id);
    requirePermission(access.role, 'client.note.read');
    const { clientId } = request.params as { clientId: string };
    const context = clientAccessContext(access);
    const input = clientNotesPageQuerySchema.parse(request.query);
    const cursor = input.cursor
      ? decodeCursor(input.cursor, 'client-note')
      : undefined;
    const cursorDate = cursor?.values[0];
    if (cursor && typeof cursorDate !== 'string') {
      throw new ApiError(400, 'INVALID_CURSOR', 'El cursor no es válido.');
    }
    const cursorCreatedAt =
      typeof cursorDate === 'string' ? new Date(cursorDate) : undefined;
    if (cursorCreatedAt && Number.isNaN(cursorCreatedAt.valueOf())) {
      throw new ApiError(400, 'INVALID_CURSOR', 'El cursor no es válido.');
    }
    const noteCursorSql =
      cursorCreatedAt && cursor
        ? Prisma.sql`AND (note.created_at, note.id) < (${cursorCreatedAt}, ${cursor.id}::uuid)`
        : Prisma.empty;
    const barberScopeSql =
      context.role === 'BARBER'
        ? Prisma.sql`AND note.created_by_user_id = ${user.id}::uuid`
        : Prisma.empty;
    const notes = await database.$queryRaw<readonly ClientNotePageRow[]>(
      Prisma.sql`
        WITH scoped_client AS (
          SELECT client.id
          FROM clients client
          WHERE client.id = ${clientId}::uuid
            AND ${clientScopeSql(context, 'client')}
        )
        SELECT
          TRUE AS "clientExists",
          note.id,
          note.created_at AS "createdAt",
          note.description,
          (note.photo_data IS NOT NULL) AS "hasPhoto"
        FROM scoped_client
        LEFT JOIN LATERAL (
          SELECT id, created_at, description, photo_data, created_by_user_id
          FROM client_notes note
          WHERE note.client_id = scoped_client.id
            AND note.organization_id = ${context.organizationId}::uuid
            ${barberScopeSql}
            ${noteCursorSql}
          ORDER BY note.created_at DESC, note.id DESC
          LIMIT ${input.limit + 1}
        ) note ON TRUE
      `,
    );
    if (notes.length === 0) {
      throw new ApiError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.');
    }
    const noteRows = notes.filter(
      (
        note,
      ): note is ClientNotePageRow & {
        readonly createdAt: Date;
        readonly description: string;
        readonly hasPhoto: boolean;
        readonly id: string;
      } =>
        note.clientExists &&
        note.createdAt !== null &&
        note.description !== null &&
        note.hasPhoto !== null &&
        note.id !== null,
    );
    const page = sliceCursorPage(noteRows, input.limit, (note) =>
      encodeCursor('client-note', [note.createdAt.toISOString()], note.id),
    );
    return {
      items: page.items.map((note) => ({
        createdAt: note.createdAt.toISOString(),
        description: note.description,
        hasPhoto: note.hasPhoto,
        id: note.id,
        photoUrl: !note.hasPhoto
          ? null
          : `/v2/clients/${clientId}/notes/${note.id}/photo`,
      })),
      nextCursor: page.nextCursor,
    };
  });

  app.get(
    '/v2/clients/:clientId/notes/:noteId/photo',
    async (request, reply) => {
      const { user } = await authenticate(database, request);
      const access = await loadOperationalAccess(request, user.id);
      requirePermission(access.role, 'client.note.read');
      const { clientId, noteId } = request.params as {
        clientId: string;
        noteId: string;
      };
      const context = clientAccessContext(access);
      const note = await database.clientNote.findFirst({
        select: { photoData: true },
        where: {
          clientId,
          id: noteId,
          organizationId: context.organizationId,
          photoData: { not: null },
          client: { is: clientScope(context) },
          ...(context.role === 'BARBER' ? { createdByUserId: user.id } : {}),
        },
      });
      if (!note?.photoData) {
        throw new ApiError(
          404,
          'CLIENT_NOTE_PHOTO_NOT_FOUND',
          'La foto no existe.',
        );
      }
      return sendMedia(reply, decodeDataUri(note.photoData), 'private');
    },
  );

  app.post('/v2/clients/import', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const access = await loadOperationalAccess(request, user.id);
    requirePermission(access.role, 'client.create');
    const input = clientImportSchema.parse(request.body);
    const context = clientAccessContext(access);
    const seenPhoneDigits = new Set<string>();
    const duplicateIndexes = new Set<number>();
    const candidates = input.contacts.flatMap((contact, inputIndex) => {
      const normalizedPhone = phoneDigits(contact.phone);
      if (seenPhoneDigits.has(normalizedPhone)) {
        duplicateIndexes.add(inputIndex);
        return [];
      }
      seenPhoneDigits.add(normalizedPhone);
      return [{ contact, id: randomUUID(), inputIndex, normalizedPhone }];
    });

    const outcome = await database.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${context.organizationId}))) SELECT 1 AS locked FROM lock`,
      );
      const existingRows = await transaction.$queryRaw<
        readonly { readonly phoneDigits: string }[]
      >(Prisma.sql`
        SELECT regexp_replace(phone, '\\D', '', 'g') AS "phoneDigits"
        FROM clients
        WHERE organization_id = ${context.organizationId}::uuid
          AND deleted_at IS NULL
          AND regexp_replace(phone, '\\D', '', 'g') IN (${Prisma.join(
            candidates.map(({ normalizedPhone }) => normalizedPhone),
          )})
      `);
      const existingPhoneDigits = new Set(
        existingRows.map(({ phoneDigits: value }) => value),
      );
      const newCandidates = candidates.filter(
        ({ normalizedPhone }) => !existingPhoneDigits.has(normalizedPhone),
      );
      const allowedCount = await assertCanCreateClients(
        transaction,
        context.organizationId,
        newCandidates.length,
      );
      const accepted = newCandidates.slice(0, allowedCount);
      if (accepted.length > 0) {
        await transaction.client.createMany({
          data: accepted.map(({ contact, id }) => ({
            addressLine: contact.addressLine || null,
            birthDate: contact.birthDate || null,
            createdByUserId: user.id,
            documentNumber: contact.documentNumber || null,
            email: contact.email || null,
            fullName: contact.fullName,
            id,
            lastName: contact.lastName || null,
            notes: contact.notes || null,
            organizationId: context.organizationId,
            phone: contact.phone,
            updatedByUserId: user.id,
          })),
        });
        await transaction.auditLog.createMany({
          data: accepted.map(({ id }) => ({
            action: 'client.created',
            actorUserId: user.id,
            entityId: id,
            entityType: 'client',
            metadata: { source: 'contact_import' },
            organizationId: context.organizationId,
          })),
        });
      }
      return {
        acceptedIndexes: new Set(accepted.map(({ inputIndex }) => inputIndex)),
        existingIndexes: new Set(
          candidates
            .filter(({ normalizedPhone }) =>
              existingPhoneDigits.has(normalizedPhone),
            )
            .map(({ inputIndex }) => inputIndex),
        ),
        idsByInputIndex: new Map(
          accepted.map(({ id, inputIndex }) => [inputIndex, id]),
        ),
      };
    });

    return reply.code(201).send({
      results: input.contacts.map((_contact, inputIndex) => {
        if (outcome.acceptedIndexes.has(inputIndex)) {
          return {
            clientId: outcome.idsByInputIndex.get(inputIndex) ?? null,
            inputIndex,
            reason: null,
            status: 'created' as const,
          };
        }
        if (
          duplicateIndexes.has(inputIndex) ||
          outcome.existingIndexes.has(inputIndex)
        ) {
          return {
            clientId: null,
            inputIndex,
            reason: 'already_exists' as const,
            status: 'skipped' as const,
          };
        }
        return {
          clientId: null,
          inputIndex,
          reason: 'plan_limit' as const,
          status: 'rejected' as const,
        };
      }),
    });
  });
}
