import { type DatabaseClient } from '@barber-saas/database';
import { MAX_HIGH_END_IPHONE_IMAGE_DATA_URI_LENGTH } from '@barber-saas/validation';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{
  readonly user: { readonly email: string; readonly id: string };
}>;

const imageDataSchema = z
  .string()
  .regex(
    /^data:image\/(jpeg|png|webp);base64,/u,
    'Formato de imagen no valido.',
  )
  .max(
    MAX_HIGH_END_IPHONE_IMAGE_DATA_URI_LENGTH,
    'La imagen supera el limite permitido.',
  );
const updateProfileSchema = z.object({
  bio: z.string().trim().max(500).nullable().optional(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(24).nullable().optional(),
  photoData: imageDataSchema.nullable().optional(),
});
const createPortfolioSchema = z.object({ photoData: imageDataSchema });

function publicProfile(profile: {
  email: string;
  fullName: string;
  phone: string | null;
  profileBio: string | null;
  profilePhotoData: string | null;
  portfolioItems: ReadonlyArray<{
    createdAt: Date;
    id: string;
    photoData: string;
  }>;
}) {
  return {
    profile: {
      bio: profile.profileBio,
      email: profile.email,
      fullName: profile.fullName,
      phone: profile.phone,
      photoData: profile.profilePhotoData,
      portfolio: profile.portfolioItems.map((item) => ({
        createdAt: item.createdAt.toISOString(),
        id: item.id,
        photoData: item.photoData,
      })),
    },
  };
}

export function registerProfileRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
) {
  app.get('/v1/profile', async (request) => {
    const { user } = await authenticate(database, request);
    const profile = await database.user.findUniqueOrThrow({
      include: { portfolioItems: { orderBy: { createdAt: 'desc' } } },
      where: { id: user.id },
    });
    return publicProfile(profile);
  });

  app.patch('/v1/profile', async (request) => {
    const { user } = await authenticate(database, request);
    const input = updateProfileSchema.parse(request.body);
    const profile = await database.user.update({
      data: {
        fullName: input.fullName,
        ...(input.phone === undefined ? {} : { phone: input.phone || null }),
        ...(input.bio === undefined ? {} : { profileBio: input.bio || null }),
        ...(input.photoData === undefined
          ? {}
          : { profilePhotoData: input.photoData }),
      },
      include: { portfolioItems: { orderBy: { createdAt: 'desc' } } },
      where: { id: user.id },
    });
    return publicProfile(profile);
  });

  app.post('/v1/profile/portfolio', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = createPortfolioSchema.parse(request.body);
    const item = await database.userPortfolioItem.create({
      data: { photoData: input.photoData, userId: user.id },
    });
    return reply.code(201).send({
      item: {
        createdAt: item.createdAt.toISOString(),
        id: item.id,
        photoData: item.photoData,
      },
    });
  });
}
