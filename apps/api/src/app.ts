import cors from '@fastify/cors';
import {
  createDatabaseClient,
  MembershipRole,
  MembershipStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import {
  completeOnboardingSchema,
  recoverAccessSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  verifyEmailSchema,
} from '@barber-saas/validation';
import Fastify, { type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import type { ApiConfig } from './config';
import { ApiError, isUniqueConstraintError } from './errors';
import { registerAgendaRoutes } from './agenda';
import { registerOperationsRoutes } from './operations';
import type {
  InvitationMailer,
  RecoveryMailer,
  VerificationMailer,
} from './recovery-mailer';
import {
  createOpaqueToken,
  createVerificationCode,
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from './security';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_DURATION_MS = 30 * 60 * 1000;
const VERIFICATION_DURATION_MS = 10 * 60 * 1000;

interface BuildApiOptions {
  readonly config: ApiConfig;
  readonly database?: DatabaseClient;
  readonly invitationMailer?: InvitationMailer | null;
  readonly recoveryMailer?: RecoveryMailer | null;
  readonly verificationMailer?: VerificationMailer | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function publicUser(user: { email: string; fullName: string; id: string }) {
  return { email: user.email, fullName: user.fullName, id: user.id };
}

async function createSession(database: DatabaseClient, userId: string) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await database.session.create({
    data: { expiresAt, tokenHash: hashOpaqueToken(token), userId },
  });
  return { expiresAt: expiresAt.toISOString(), token };
}

async function issueVerificationCode({
  appEnvironment,
  database,
  email,
  userId,
  verificationMailer,
}: {
  readonly appEnvironment: ApiConfig['APP_ENV'];
  readonly database: DatabaseClient;
  readonly email: string;
  readonly userId: string;
  readonly verificationMailer: VerificationMailer | null;
}) {
  const code = createVerificationCode();
  const now = new Date();
  await database.$transaction([
    database.emailVerificationCode.updateMany({
      data: { usedAt: now },
      where: { userId, usedAt: null },
    }),
    database.emailVerificationCode.create({
      data: {
        codeHash: hashOpaqueToken(code),
        expiresAt: new Date(Date.now() + VERIFICATION_DURATION_MS),
        userId,
      },
    }),
  ]);
  if (verificationMailer) await verificationMailer.send({ code, email });
  else if (appEnvironment !== 'local') {
    throw new ApiError(
      503,
      'VERIFICATION_DELIVERY_UNAVAILABLE',
      'El servicio de verificación por correo no está disponible.',
    );
  }
  return appEnvironment === 'local' ? code : undefined;
}

function getBearerToken(request: FastifyRequest): string {
  const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');
  }
  return token;
}

async function authenticate(database: DatabaseClient, request: FastifyRequest) {
  const token = getBearerToken(request);
  const session = await database.session.findFirst({
    include: { user: true },
    where: {
      expiresAt: { gt: new Date() },
      revokedAt: null,
      tokenHash: hashOpaqueToken(token),
    },
  });
  if (!session) {
    throw new ApiError(
      401,
      'INVALID_SESSION',
      'Tu sesión venció. Inicia sesión nuevamente.',
    );
  }
  return { session, token, user: session.user };
}

export async function buildApi({
  config,
  database = createDatabaseClient({ connectionString: config.DATABASE_URL }),
  invitationMailer = null,
  recoveryMailer = null,
  verificationMailer = null,
}: BuildApiOptions) {
  const app = Fastify({ logger: config.APP_ENV === 'production' });
  await app.register(cors, {
    origin: config.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/v1/auth/register', async (request, reply) => {
    const input = signUpSchema.parse(request.body);
    const email = normalizeEmail(input.email);
    try {
      const passwordHash = await hashPassword(input.password);
      const existingUser = await database.user.findUnique({ where: { email } });
      if (existingUser?.passwordHash && existingUser.emailVerifiedAt) {
        throw new ApiError(
          409,
          'EMAIL_ALREADY_EXISTS',
          'Ya existe una cuenta con ese correo.',
        );
      }
      const user = existingUser
        ? await database.user.update({
            data: { fullName: input.fullName.trim(), passwordHash },
            where: { id: existingUser.id },
          })
        : await database.user.create({
            data: { email, fullName: input.fullName.trim(), passwordHash },
          });
      const developmentVerificationCode = await issueVerificationCode({
        appEnvironment: config.APP_ENV,
        database,
        email: user.email,
        userId: user.id,
        verificationMailer,
      });
      return reply.code(201).send({
        ...(developmentVerificationCode ? { developmentVerificationCode } : {}),
        email: user.email,
        verificationRequired: true,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApiError(
          409,
          'EMAIL_ALREADY_EXISTS',
          'Ya existe una cuenta con ese correo.',
        );
      }
      throw error;
    }
  });

  app.post('/v1/auth/login', async (request) => {
    const input = signInSchema.parse(request.body);
    const user = await database.user.findUnique({
      where: { email: normalizeEmail(input.email) },
    });
    if (
      !user?.passwordHash ||
      !(await verifyPassword(input.password, user.passwordHash))
    ) {
      throw new ApiError(
        401,
        'INVALID_CREDENTIALS',
        'El correo o la contraseña son incorrectos.',
      );
    }
    if (!user.emailVerifiedAt) {
      throw new ApiError(
        403,
        'EMAIL_NOT_VERIFIED',
        'Verifica tu correo antes de iniciar sesión.',
      );
    }
    return {
      session: await createSession(database, user.id),
      user: publicUser(user),
    };
  });

  app.post('/v1/auth/verify-email', async (request) => {
    const input = verifyEmailSchema.parse(request.body);
    const email = normalizeEmail(input.email);
    const user = await database.user.findUnique({ where: { email } });
    if (!user) {
      throw new ApiError(
        400,
        'INVALID_VERIFICATION_CODE',
        'El código no es válido o ya venció.',
      );
    }
    await database.$transaction(async (transaction) => {
      const verification = await transaction.emailVerificationCode.findFirst({
        where: {
          codeHash: hashOpaqueToken(input.code),
          expiresAt: { gt: new Date() },
          usedAt: null,
          userId: user.id,
        },
      });
      if (!verification) {
        throw new ApiError(
          400,
          'INVALID_VERIFICATION_CODE',
          'El código no es válido o ya venció.',
        );
      }
      const now = new Date();
      const consumed = await transaction.emailVerificationCode.updateMany({
        data: { usedAt: now },
        where: { id: verification.id, usedAt: null },
      });
      if (consumed.count !== 1) {
        throw new ApiError(
          400,
          'INVALID_VERIFICATION_CODE',
          'El código no es válido o ya fue utilizado.',
        );
      }
      await transaction.user.update({
        data: { emailVerifiedAt: now },
        where: { id: user.id },
      });
    });
    return {
      session: await createSession(database, user.id),
      user: publicUser(user),
    };
  });

  app.post('/v1/auth/resend-verification', async (request) => {
    const { email: rawEmail } = resendVerificationSchema.parse(request.body);
    const email = normalizeEmail(rawEmail);
    const user = await database.user.findUnique({ where: { email } });
    let developmentVerificationCode: string | undefined;
    if (user && !user.emailVerifiedAt) {
      developmentVerificationCode = await issueVerificationCode({
        appEnvironment: config.APP_ENV,
        database,
        email: user.email,
        userId: user.id,
        verificationMailer,
      });
    }
    return {
      ...(developmentVerificationCode ? { developmentVerificationCode } : {}),
      message: 'Si la cuenta está pendiente, recibirás un nuevo código.',
    };
  });

  app.get('/v1/auth/session', async (request) => {
    const { session, user } = await authenticate(database, request);
    return {
      session: { expiresAt: session.expiresAt.toISOString() },
      user: publicUser(user),
    };
  });

  app.post('/v1/auth/logout', async (request, reply) => {
    const { session } = await authenticate(database, request);
    await database.session.update({
      data: { revokedAt: new Date() },
      where: { id: session.id },
    });
    return reply.code(204).send();
  });

  app.post('/v1/auth/recover', async (request) => {
    const { email } = recoverAccessSchema.parse(request.body);
    const user = await database.user.findUnique({
      where: { email: normalizeEmail(email) },
    });
    let developmentResetToken: string | undefined;
    if (user) {
      const token = createOpaqueToken();
      await database.passwordResetToken.create({
        data: {
          expiresAt: new Date(Date.now() + RESET_DURATION_MS),
          tokenHash: hashOpaqueToken(token),
          userId: user.id,
        },
      });
      const separator = config.MOBILE_RESET_URL.includes('?') ? '&' : '?';
      const resetUrl = `${config.MOBILE_RESET_URL}${separator}token=${encodeURIComponent(token)}`;
      if (recoveryMailer)
        await recoveryMailer.send({ email: user.email, resetUrl });
      else if (config.APP_ENV === 'local') developmentResetToken = token;
    }
    return {
      ...(developmentResetToken ? { developmentResetToken } : {}),
      message:
        'Si la cuenta existe, recibirás un enlace para cambiar la contraseña.',
    };
  });

  app.post('/v1/auth/reset-password', async (request, reply) => {
    const input = resetPasswordSchema.parse(request.body);
    const resetToken = await database.passwordResetToken.findFirst({
      include: { user: true },
      where: {
        expiresAt: { gt: new Date() },
        tokenHash: hashOpaqueToken(input.token),
        usedAt: null,
      },
    });
    if (!resetToken) {
      throw new ApiError(
        400,
        'INVALID_RESET_TOKEN',
        'El enlace de recuperación no es válido o ya venció.',
      );
    }
    const passwordHash = await hashPassword(input.password);
    await database.$transaction([
      database.user.update({
        data: { passwordHash },
        where: { id: resetToken.userId },
      }),
      database.passwordResetToken.update({
        data: { usedAt: new Date() },
        where: { id: resetToken.id },
      }),
      database.session.updateMany({
        data: { revokedAt: new Date() },
        where: { revokedAt: null, userId: resetToken.userId },
      }),
    ]);
    return reply.code(204).send();
  });

  app.post('/v1/onboarding', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = completeOnboardingSchema.parse(request.body);
    try {
      const result = await database.$transaction(async (transaction) => {
        const existingMembership = await transaction.membership.findFirst({
          where: { status: MembershipStatus.ACTIVE, userId: user.id },
        });
        if (existingMembership) {
          throw new ApiError(
            409,
            'ONBOARDING_ALREADY_COMPLETED',
            'Tu cuenta ya pertenece a una barbería.',
          );
        }
        const organization = await transaction.organization.create({
          data: {
            currencyCode: input.location.currencyCode,
            defaultTimezone: input.location.timezone,
            name: input.name,
            slug: input.slug,
          },
        });
        const location = await transaction.location.create({
          data: {
            addressLine: input.location.addressLine || null,
            city: input.location.city || null,
            countryCode: input.location.countryCode,
            currencyCode: input.location.currencyCode,
            email: input.location.email || null,
            name: input.location.name,
            organizationId: organization.id,
            phone: input.location.phone,
            slug: input.location.slug,
            timezone: input.location.timezone,
            whatsappPhone: input.location.whatsappPhone,
          },
        });
        const membership = await transaction.membership.create({
          data: {
            organizationId: organization.id,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE,
            userId: user.id,
          },
        });
        await transaction.memberLocation.create({
          data: { locationId: location.id, membershipId: membership.id },
        });
        await transaction.auditLog.create({
          data: {
            action: 'onboarding.completed',
            actorUserId: user.id,
            afterData: {
              locationId: location.id,
              organizationId: organization.id,
            },
            entityId: organization.id,
            entityType: 'organization',
            locationId: location.id,
            organizationId: organization.id,
          },
        });
        return { locationId: location.id, organizationId: organization.id };
      });
      return reply.code(201).send(result);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApiError(
          409,
          'SLUG_ALREADY_EXISTS',
          'Ese enlace ya está en uso. Elige otro identificador.',
        );
      }
      throw error;
    }
  });

  app.get('/v1/organizations/current', async (request) => {
    const { user } = await authenticate(database, request);
    const membership = await database.membership.findFirst({
      include: {
        memberLocations: { include: { location: true }, take: 1 },
        organization: true,
      },
      where: { status: MembershipStatus.ACTIVE, userId: user.id },
    });
    if (!membership) return { organization: null };
    const location = membership.memberLocations[0]?.location ?? null;
    return {
      location,
      membership: {
        id: membership.id,
        role: membership.role.toLowerCase(),
        status: membership.status.toLowerCase(),
      },
      organization: membership.organization,
    };
  });

  registerOperationsRoutes(
    app,
    database,
    authenticate,
    invitationMailer,
    config,
  );
  registerAgendaRoutes(app, database, authenticate);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: error.issues[0]?.message ?? 'Revisa los datos enviados.',
      });
    }
    if (error instanceof ApiError) {
      return reply
        .code(error.statusCode)
        .send({ code: error.code, message: error.message });
    }
    app.log.error(error);
    return reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado. Inténtalo nuevamente.',
    });
  });

  app.addHook('onClose', async () => database.$disconnect());
  return app;
}
