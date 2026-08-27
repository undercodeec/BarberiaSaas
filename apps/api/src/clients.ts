import {
  MembershipRole,
  MembershipStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import {
  hasPermission,
  type MembershipRole as PermissionRole,
  type OrganizationPermission,
} from '@barber-saas/permissions';
import { hasSensitiveDataContent } from '@barber-saas/validation';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { ApiError } from './errors';
import { assertCanCreateClient } from './subscription-policy';

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{
  readonly user: { readonly email: string; readonly id: string };
}>;

const createClientSchema = z.object({
  addressLine: z.string().trim().max(240).optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional(),
  documentNumber: z.string().trim().max(64).optional(),
  email: z.string().email().max(254).optional(),
  fullName: z.string().trim().min(2).max(120),
  lastName: z.string().trim().max(120).optional(),
  notes: z
    .string()
    .trim()
    .max(500)
    .refine(
      (value) => !hasSensitiveDataContent(value),
      'Nava no permite registrar datos médicos, biométricos u otra información sensible.',
    )
    .optional(),
  phone: z.string().trim().min(5).max(24),
});
const updateClientSchema = createClientSchema
  .partial()
  .refine(
    (input) => Object.keys(input).length > 0,
    'Ingresa al menos un dato para actualizar.',
  );
const createClientLabelSchema = z.object({
  clientId: z.string().uuid().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  name: z.string().trim().min(1).max(60),
});
const createClientNoteSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine(
      (value) => !hasSensitiveDataContent(value),
      'Nava no permite registrar datos médicos, biométricos u otra información sensible.',
    ),
  photoData: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,/u)
    .max(2_000_000)
    .optional(),
});
const exportClientsSchema = z.object({
  clientIds: z.array(z.string().uuid()).min(1).max(500),
  detailLevel: z.enum(['complete', 'minimum']),
});

export interface ClientAccessContext {
  readonly locationIds: readonly string[];
  readonly membershipId: string;
  readonly organizationId: string;
  readonly role: MembershipRole;
  readonly userId: string;
}

function permissionRole(role: MembershipRole): PermissionRole {
  return role.toLowerCase() as PermissionRole;
}

async function requireClientContext(
  database: DatabaseClient,
  userId: string,
  permission: OrganizationPermission,
): Promise<ClientAccessContext> {
  const membership = await database.membership.findFirst({
    include: { memberLocations: true },
    where: { status: MembershipStatus.ACTIVE, userId },
  });
  if (!membership) {
    throw new ApiError(
      403,
      'ORGANIZATION_REQUIRED',
      'Tu cuenta no pertenece a un negocio activo.',
    );
  }
  if (!hasPermission(permissionRole(membership.role), permission)) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'No tienes permiso para realizar esta acción.',
    );
  }
  return {
    locationIds: membership.memberLocations.map(({ locationId }) => locationId),
    membershipId: membership.id,
    organizationId: membership.organizationId,
    role: membership.role,
    userId,
  };
}

export function clientScope(context: ClientAccessContext) {
  const base = {
    deletedAt: null,
    organizationId: context.organizationId,
  };
  if (context.role === MembershipRole.BARBER) {
    return {
      ...base,
      appointments: {
        some: {
          organizationId: context.organizationId,
          professionalMembershipId: context.membershipId,
        },
      },
    };
  }
  if (context.role === MembershipRole.RECEPTIONIST) {
    return {
      ...base,
      appointments: {
        some: {
          locationId: { in: [...context.locationIds] },
          organizationId: context.organizationId,
        },
      },
    };
  }
  return base;
}

export function maskClientPhone(phone: string | null): string | null {
  if (!phone) return null;
  const visibleDigits = 4;
  const visible = phone.slice(-visibleDigits);
  return `${'*'.repeat(Math.max(4, phone.length - visible.length))}${visible}`;
}

function publicLabel(label: { color: string; id: string; name: string }) {
  return label;
}
function publicClientNote(note: {
  createdAt: Date;
  description: string;
  id: string;
  photoData: string | null;
}) {
  return {
    createdAt: note.createdAt.toISOString(),
    description: note.description,
    id: note.id,
    photoData: note.photoData,
  };
}

function csvCell(value: string) {
  const safeValue = /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function clientExportCsv(
  clients: ReadonlyArray<{
    readonly addressLine: string | null;
    readonly documentNumber: string | null;
    readonly email: string | null;
    readonly fullName: string;
    readonly lastName: string | null;
    readonly notes: string | null;
    readonly phone: string | null;
  }>,
  detailLevel: 'complete' | 'minimum',
) {
  const headers =
    detailLevel === 'complete'
      ? [
          'Nombre',
          'Apellido',
          'Teléfono',
          'Correo',
          'Dirección',
          'Documento',
          'Notas',
        ]
      : ['Nombre', 'Apellido', 'Teléfono', 'Correo'];
  const rows = clients.map((client) => {
    const minimum = [
      client.fullName,
      client.lastName ?? '',
      client.phone ?? '',
      client.email ?? '',
    ];
    return detailLevel === 'complete'
      ? [
          ...minimum,
          client.addressLine ?? '',
          client.documentNumber ?? '',
          client.notes ?? '',
        ]
      : minimum;
  });
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}

function publicClient(
  client: {
    addressLine: string | null;
    birthDate: string | null;
    documentNumber: string | null;
    email: string | null;
    fullName: string;
    id: string;
    labels?: ReadonlyArray<{
      readonly label: { color: string; id: string; name: string };
    }>;
    lastName: string | null;
    notes: string | null;
    phone: string | null;
  },
  access: 'full' | 'masked',
) {
  const { labels, ...details } = client;
  if (access === 'masked') {
    return {
      ...details,
      addressLine: null,
      birthDate: null,
      documentNumber: null,
      email: null,
      labels: [],
      notes: null,
      phone: maskClientPhone(client.phone),
    };
  }
  return {
    ...details,
    labels: labels?.map(({ label }) => publicLabel(label)) ?? [],
  };
}

function clientDataAccess(context: ClientAccessContext): 'full' | 'masked' {
  return hasPermission(permissionRole(context.role), 'client.contact.read_full')
    ? 'full'
    : 'masked';
}

function appointmentScope(context: ClientAccessContext) {
  if (context.role === MembershipRole.BARBER) {
    return { professionalMembershipId: context.membershipId };
  }
  if (context.role === MembershipRole.RECEPTIONIST) {
    return { locationId: { in: [...context.locationIds] } };
  }
  return {};
}

export function registerClientRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
) {
  app.get('/v1/clients/labels', async (request) => {
    const { user } = await authenticate(database, request);
    const context = await requireClientContext(
      database,
      user.id,
      'client.label.read',
    );
    const labels = await database.clientLabel.findMany({
      orderBy: { name: 'asc' },
      where: { organizationId: context.organizationId },
    });
    return { labels: labels.map(publicLabel) };
  });

  app.post('/v1/clients/labels', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const context = await requireClientContext(
      database,
      user.id,
      'client.label.manage',
    );
    const input = createClientLabelSchema.parse(request.body);
    const scope = clientScope(context);

    const result = await database.$transaction(async (transaction) => {
      if (input.clientId) {
        const client = await transaction.client.findFirst({
          where: { id: input.clientId, ...scope },
        });
        if (!client) {
          throw new ApiError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.');
        }
      }

      const existing = await transaction.clientLabel.findFirst({
        where: {
          organizationId: context.organizationId,
          name: { equals: input.name, mode: 'insensitive' },
        },
      });
      const label =
        existing ??
        (await transaction.clientLabel.create({
          data: {
            color: input.color.toUpperCase(),
            createdByUserId: user.id,
            name: input.name,
            organizationId: context.organizationId,
            updatedByUserId: user.id,
          },
        }));

      if (input.clientId) {
        await transaction.clientLabelAssignment.upsert({
          create: { clientId: input.clientId, labelId: label.id },
          update: {},
          where: {
            clientId_labelId: { clientId: input.clientId, labelId: label.id },
          },
        });
      }
      return { created: !existing, label };
    });

    return reply.code(result.created ? 201 : 200).send({
      label: publicLabel(result.label),
    });
  });

  app.get('/v1/clients/:clientId/notes', async (request) => {
    const { user } = await authenticate(database, request);
    const context = await requireClientContext(
      database,
      user.id,
      'client.note.read',
    );
    const { clientId } = request.params as { clientId: string };
    const client = await database.client.findFirst({
      where: { id: clientId, ...clientScope(context) },
    });
    if (!client) {
      throw new ApiError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.');
    }
    const notes = await database.clientNote.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        clientId: client.id,
        organizationId: context.organizationId,
        ...(context.role === MembershipRole.BARBER
          ? { createdByUserId: user.id }
          : {}),
      },
    });
    return { notes: notes.map(publicClientNote) };
  });

  app.post('/v1/clients/:clientId/notes', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const context = await requireClientContext(
      database,
      user.id,
      'client.note.create',
    );
    const { clientId } = request.params as { clientId: string };
    const input = createClientNoteSchema.parse(request.body);
    const client = await database.client.findFirst({
      where: { id: clientId, ...clientScope(context) },
    });
    if (!client) {
      throw new ApiError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.');
    }
    const note = await database.$transaction(async (transaction) => {
      const created = await transaction.clientNote.create({
        data: {
          clientId: client.id,
          createdByUserId: user.id,
          description: input.description,
          organizationId: context.organizationId,
          photoData: input.photoData ?? null,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'client.note.created',
          actorUserId: user.id,
          entityId: client.id,
          entityType: 'client',
          metadata: { noteId: created.id, role: context.role.toLowerCase() },
          organizationId: context.organizationId,
        },
      });
      return created;
    });
    return reply.code(201).send({ note: publicClientNote(note) });
  });
  app.get('/v1/clients', async (request) => {
    const { user } = await authenticate(database, request);
    const context = await requireClientContext(
      database,
      user.id,
      'client.directory.read',
    );
    const access = clientDataAccess(context);
    const query = request.query as { labelId?: string; search?: string };
    const search = query.search?.trim();
    const labelId = query.labelId?.trim();
    const clients = await database.client.findMany({
      include: { labels: { include: { label: true } } },
      orderBy: { fullName: 'asc' },
      where: {
        ...clientScope(context),
        ...(labelId ? { labels: { some: { labelId } } } : {}),
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                ...(access === 'full' ? [{ phone: { contains: search } }] : []),
              ],
            }
          : {}),
      },
    });
    return { clients: clients.map((client) => publicClient(client, access)) };
  });

  app.post('/v1/clients/export', async (request) => {
    const { user } = await authenticate(database, request);
    const context = await requireClientContext(
      database,
      user.id,
      'client.export',
    );
    const input = exportClientsSchema.parse(request.body);
    const uniqueClientIds = [...new Set(input.clientIds)];
    const clients = await database.client.findMany({
      orderBy: { fullName: 'asc' },
      where: {
        ...clientScope(context),
        id: { in: uniqueClientIds },
      },
    });
    if (clients.length !== uniqueClientIds.length) {
      throw new ApiError(
        404,
        'CLIENT_NOT_FOUND',
        'Uno o más clientes no están disponibles.',
      );
    }
    await database.auditLog.create({
      data: {
        action: 'client.export.created',
        actorUserId: user.id,
        entityId: clients[0]!.id,
        entityType: 'client',
        metadata: {
          clientCount: clients.length,
          detailLevel: input.detailLevel,
          role: context.role.toLowerCase(),
        },
        organizationId: context.organizationId,
      },
    });
    return {
      contents: clientExportCsv(clients, input.detailLevel),
      filename: `clientes-nava-${new Date().toISOString().slice(0, 10)}.csv`,
      mimeType: 'text/csv;charset=utf-8',
    };
  });

  app.post('/v1/clients', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const context = await requireClientContext(
      database,
      user.id,
      'client.create',
    );
    const input = createClientSchema.parse(request.body);
    const client = await database.$transaction(async (transaction) => {
      await transaction.$queryRaw`WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${context.organizationId}))) SELECT 1 AS locked FROM lock`;
      await assertCanCreateClient(transaction, context.organizationId);
      const created = await transaction.client.create({
        data: {
          addressLine: input.addressLine || null,
          birthDate: input.birthDate || null,
          createdByUserId: user.id,
          documentNumber: input.documentNumber || null,
          email: input.email || null,
          fullName: input.fullName,
          lastName: input.lastName || null,
          notes: input.notes || null,
          organizationId: context.organizationId,
          phone: input.phone,
          updatedByUserId: user.id,
        },
        include: { labels: { include: { label: true } } },
      });
      await transaction.auditLog.create({
        data: {
          action: 'client.created',
          actorUserId: user.id,
          entityId: created.id,
          entityType: 'client',
          metadata: { role: context.role.toLowerCase() },
          organizationId: context.organizationId,
        },
      });
      return created;
    });
    return reply.code(201).send({ client: publicClient(client, 'full') });
  });

  app.get('/v1/clients/:clientId', async (request) => {
    const { user } = await authenticate(database, request);
    const context = await requireClientContext(
      database,
      user.id,
      'client.record.read',
    );
    const access = clientDataAccess(context);
    const { clientId } = request.params as { clientId: string };
    const scope = clientScope(context);
    const client = await database.client.findFirst({
      include: { labels: { include: { label: true } } },
      where: { id: clientId, ...scope },
    });
    if (!client) {
      throw new ApiError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.');
    }
    await database.auditLog.create({
      data: {
        action:
          access === 'full' ? 'client.read.full' : 'client.read.restricted',
        actorUserId: user.id,
        entityId: client.id,
        entityType: 'client',
        metadata: { role: context.role.toLowerCase() },
        organizationId: context.organizationId,
      },
    });

    const appointments = await database.appointment.findMany({
      include: {
        professional: { include: { user: { select: { fullName: true } } } },
        services: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { startsAt: 'desc' },
      where: {
        organizationId: context.organizationId,
        ...appointmentScope(context),
        OR: [
          { clientId: client.id },
          {
            clientId: null,
            OR: [
              { clientName: client.fullName },
              ...(client.phone ? [{ clientPhone: client.phone }] : []),
              ...(client.email ? [{ clientEmail: client.email }] : []),
            ],
          },
        ],
      },
    });
    const completed = appointments.filter(
      (appointment) => appointment.status === 'COMPLETED',
    );
    return {
      client: publicClient(client, access),
      history: appointments.slice(0, 12).map((appointment) => ({
        collaboratorName: appointment.professional.user.fullName,
        endsAt: appointment.endsAt.toISOString(),
        id: appointment.id,
        paymentStatus: appointment.paymentStatus.toLowerCase(),
        serviceName:
          appointment.services
            .map((service) => service.serviceName)
            .join(', ') || 'Sin servicio registrado',
        startsAt: appointment.startsAt.toISOString(),
        status: appointment.status.toLowerCase(),
      })),
      metrics: {
        accumulatedCents: completed.reduce(
          (total, appointment) =>
            total +
            appointment.services.reduce(
              (amount, service) => amount + service.priceCents,
              0,
            ),
          0,
        ),
        appointmentsCount: appointments.length,
        lastVisitAt: completed.at(0)?.startsAt.toISOString() ?? null,
      },
    };
  });

  app.patch('/v1/clients/:clientId', async (request) => {
    const { user } = await authenticate(database, request);
    const context = await requireClientContext(
      database,
      user.id,
      'client.update',
    );
    const { clientId } = request.params as { clientId: string };
    const input = updateClientSchema.parse(request.body);
    const existing = await database.client.findFirst({
      where: { id: clientId, ...clientScope(context) },
    });
    if (!existing) {
      throw new ApiError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.');
    }
    const client = await database.$transaction(async (transaction) => {
      const updated = await transaction.client.update({
        data: {
          ...(input.addressLine === undefined
            ? {}
            : { addressLine: input.addressLine || null }),
          ...(input.birthDate === undefined
            ? {}
            : { birthDate: input.birthDate || null }),
          ...(input.documentNumber === undefined
            ? {}
            : { documentNumber: input.documentNumber || null }),
          ...(input.email === undefined ? {} : { email: input.email || null }),
          ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
          ...(input.lastName === undefined
            ? {}
            : { lastName: input.lastName || null }),
          ...(input.notes === undefined ? {} : { notes: input.notes || null }),
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          updatedByUserId: user.id,
        },
        include: { labels: { include: { label: true } } },
        where: { id: existing.id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'client.updated',
          actorUserId: user.id,
          entityId: existing.id,
          entityType: 'client',
          metadata: {
            changedFields: Object.keys(input),
            role: context.role.toLowerCase(),
          },
          organizationId: context.organizationId,
        },
      });
      return updated;
    });
    return { client: publicClient(client, 'full') };
  });

  app.delete('/v1/clients/:clientId', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const context = await requireClientContext(
      database,
      user.id,
      'client.delete',
    );
    const { clientId } = request.params as { clientId: string };
    const client = await database.client.findFirst({
      where: { id: clientId, ...clientScope(context) },
    });
    if (!client) {
      throw new ApiError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.');
    }
    await database.$transaction(async (transaction) => {
      await transaction.client.update({
        data: { deletedAt: new Date(), updatedByUserId: user.id },
        where: { id: client.id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'client.deleted',
          actorUserId: user.id,
          entityId: client.id,
          entityType: 'client',
          metadata: { role: context.role.toLowerCase() },
          organizationId: context.organizationId,
        },
      });
    });
    return reply.code(204).send();
  });
}
