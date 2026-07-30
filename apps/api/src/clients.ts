import { MembershipStatus, type DatabaseClient } from '@barber-saas/database';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { ApiError } from './errors';

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
  notes: z.string().trim().max(500).optional(),
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
  description: z.string().trim().min(1).max(500),
  photoData: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,/u)
    .max(2_000_000)
    .optional(),
});

async function currentOrganizationId(database: DatabaseClient, userId: string) {
  const membership = await database.membership.findFirst({
    where: { status: MembershipStatus.ACTIVE, userId },
  });
  return membership?.organizationId ?? null;
}

function clientScope(organizationId: string | null, userId: string) {
  return organizationId
    ? { deletedAt: null, organizationId }
    : { createdByUserId: userId, deletedAt: null };
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

function publicClient(client: {
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
}) {
  const { labels, ...details } = client;
  return {
    ...details,
    labels: labels?.map(({ label }) => publicLabel(label)) ?? [],
  };
}

export function registerClientRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
) {
  app.get('/v1/clients/labels', async (request) => {
    const { user } = await authenticate(database, request);
    const organizationId = await currentOrganizationId(database, user.id);
    const labels = await database.clientLabel.findMany({
      orderBy: { name: 'asc' },
      where: clientScope(organizationId, user.id),
    });
    return { labels: labels.map(publicLabel) };
  });

  app.post('/v1/clients/labels', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const organizationId = await currentOrganizationId(database, user.id);
    const input = createClientLabelSchema.parse(request.body);
    const scope = clientScope(organizationId, user.id);

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
          ...scope,
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
            organizationId,
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
    const organizationId = await currentOrganizationId(database, user.id);
    const { clientId } = request.params as { clientId: string };
    const client = await database.client.findFirst({
      where: { id: clientId, ...clientScope(organizationId, user.id) },
    });
    if (!client) {
      throw new ApiError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.');
    }
    const notes = await database.clientNote.findMany({
      orderBy: { createdAt: 'desc' },
      where: { clientId: client.id },
    });
    return { notes: notes.map(publicClientNote) };
  });

  app.post('/v1/clients/:clientId/notes', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const organizationId = await currentOrganizationId(database, user.id);
    const { clientId } = request.params as { clientId: string };
    const input = createClientNoteSchema.parse(request.body);
    const client = await database.client.findFirst({
      where: { id: clientId, ...clientScope(organizationId, user.id) },
    });
    if (!client) {
      throw new ApiError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.');
    }
    const note = await database.clientNote.create({
      data: {
        clientId: client.id,
        createdByUserId: user.id,
        description: input.description,
        organizationId,
        photoData: input.photoData ?? null,
      },
    });
    return reply.code(201).send({ note: publicClientNote(note) });
  });
  app.get('/v1/clients', async (request) => {
    const { user } = await authenticate(database, request);
    const organizationId = await currentOrganizationId(database, user.id);
    const query = request.query as { labelId?: string; search?: string };
    const search = query.search?.trim();
    const labelId = query.labelId?.trim();
    const clients = await database.client.findMany({
      include: { labels: { include: { label: true } } },
      orderBy: { fullName: 'asc' },
      where: {
        ...clientScope(organizationId, user.id),
        ...(labelId ? { labels: { some: { labelId } } } : {}),
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
    });
    return { clients: clients.map(publicClient) };
  });

  app.post('/v1/clients', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const organizationId = await currentOrganizationId(database, user.id);
    const input = createClientSchema.parse(request.body);
    const client = await database.client.create({
      data: {
        addressLine: input.addressLine || null,
        birthDate: input.birthDate || null,
        createdByUserId: user.id,
        documentNumber: input.documentNumber || null,
        email: input.email || null,
        fullName: input.fullName,
        lastName: input.lastName || null,
        notes: input.notes || null,
        organizationId,
        phone: input.phone,
        updatedByUserId: user.id,
      },
      include: { labels: { include: { label: true } } },
    });
    return reply.code(201).send({ client: publicClient(client) });
  });

  app.get('/v1/clients/:clientId', async (request) => {
    const { user } = await authenticate(database, request);
    const organizationId = await currentOrganizationId(database, user.id);
    const { clientId } = request.params as { clientId: string };
    const scope = clientScope(organizationId, user.id);
    const client = await database.client.findFirst({
      include: { labels: { include: { label: true } } },
      where: { id: clientId, ...scope },
    });
    if (!client) {
      throw new ApiError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.');
    }

    const appointments = await database.appointment.findMany({
      include: {
        professional: { include: { user: { select: { fullName: true } } } },
        services: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { startsAt: 'desc' },
      where: {
        ...(organizationId ? { organizationId } : { createdByUserId: user.id }),
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
      client: publicClient(client),
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
    const organizationId = await currentOrganizationId(database, user.id);
    const { clientId } = request.params as { clientId: string };
    const input = updateClientSchema.parse(request.body);
    const existing = await database.client.findFirst({
      where: { id: clientId, ...clientScope(organizationId, user.id) },
    });
    if (!existing) {
      throw new ApiError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.');
    }
    const client = await database.client.update({
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
    return { client: publicClient(client) };
  });

  app.delete('/v1/clients/:clientId', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const organizationId = await currentOrganizationId(database, user.id);
    const { clientId } = request.params as { clientId: string };
    const client = await database.client.findFirst({
      where: { id: clientId, ...clientScope(organizationId, user.id) },
    });
    if (!client) {
      throw new ApiError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.');
    }
    await database.client.update({
      data: { deletedAt: new Date(), updatedByUserId: user.id },
      where: { id: client.id },
    });
    return reply.code(204).send();
  });
}
