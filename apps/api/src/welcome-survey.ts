import { type DatabaseClient } from '@barber-saas/database';
import {
  type WelcomeSurveyOption,
  welcomeSurveyResponseSchema,
} from '@barber-saas/validation';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { isUniqueConstraintError } from './errors';

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{ readonly user: { readonly id: string } }>;

function publicWelcomeSurveyResponse(response: {
  readonly selectedOptions: readonly string[];
  readonly submittedAt: Date;
}) {
  return {
    selectedOptions: response.selectedOptions as readonly WelcomeSurveyOption[],
    submittedAt: response.submittedAt.toISOString(),
  };
}

export function registerWelcomeSurveyRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
) {
  app.get('/v1/welcome-survey-response', async (request) => {
    const { user } = await authenticate(database, request);
    const response = await database.welcomeSurveyResponse.findUnique({
      where: { userId: user.id },
    });
    return {
      response: response ? publicWelcomeSurveyResponse(response) : null,
    };
  });

  app.post('/v1/welcome-survey-response', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = welcomeSurveyResponseSchema.parse(request.body);
    const existing = await database.welcomeSurveyResponse.findUnique({
      where: { userId: user.id },
    });
    if (existing) {
      return { response: publicWelcomeSurveyResponse(existing) };
    }

    try {
      const response = await database.welcomeSurveyResponse.create({
        data: { selectedOptions: [...input.selectedOptions], userId: user.id },
      });
      return reply.code(201).send({
        response: publicWelcomeSurveyResponse(response),
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const response = await database.welcomeSurveyResponse.findUniqueOrThrow({
        where: { userId: user.id },
      });
      return { response: publicWelcomeSurveyResponse(response) };
    }
  });
}
