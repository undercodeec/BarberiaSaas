import cors from '@fastify/cors';
import {
  createDatabaseClient,
  MembershipRole,
  MembershipStatus,
  OnboardingCollaboratorRole,
  RegistrationAccountType,
  type DatabaseClient,
} from '@barber-saas/database';
import {
  completeOnboardingSchema,
  createOnboardingCollaboratorSchema,
  createOnboardingServiceSchema,
  recoverAccessSchema,
  registrationAvailabilitySchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  updateOnboardingCollaboratorSchema,
  updateOnboardingServiceSchema,
  updateOnboardingAccountDetailsSchema,
  verifyEmailSchema,
} from '@barber-saas/validation';
import Fastify, { type FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';

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
const VERIFICATION_LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;
const onboardingCollaboratorParamsSchema = z.object({
  id: z.uuid('El identificador no es válido.'),
});
const onboardingServiceParamsSchema = z.object({
  id: z.uuid('El identificador no es válido.'),
});

interface BuildApiOptions {
  readonly config: ApiConfig;
  readonly database?: DatabaseClient;
  readonly invitationMailer?: InvitationMailer | null;
  readonly recoveryMailer?: RecoveryMailer | null;
  readonly verificationMailer?: VerificationMailer | null;
}

interface RegistrationProfileDraft {
  readonly accountType: RegistrationAccountType;
  readonly businessName: string;
  readonly city: string;
  readonly closingTime: string;
  readonly countryCode: string;
  readonly openingTime: string;
  readonly phone: string;
}

function completeRegistrationProfile(input: {
  readonly accountType: RegistrationAccountType | null;
  readonly businessName: string | null;
  readonly city: string | null;
  readonly closingTime: string | null;
  readonly countryCode: string | null;
  readonly openingTime: string | null;
  readonly phone: string | null;
}): RegistrationProfileDraft | null {
  if (
    !input.accountType ||
    !input.businessName ||
    !input.city ||
    !input.closingTime ||
    !input.countryCode ||
    !input.openingTime ||
    !input.phone
  ) {
    return null;
  }
  return {
    accountType: input.accountType,
    businessName: input.businessName,
    city: input.city,
    closingTime: input.closingTime,
    countryCode: input.countryCode,
    openingTime: input.openingTime,
    phone: input.phone,
  };
}

function onboardingCollaboratorData(input: {
  readonly agendaColor: string;
  readonly canPerformServices: boolean;
  readonly customRoleDescription?: string | null | undefined;
  readonly customRoleName?: string | null | undefined;
  readonly description?: string | null | undefined;
  readonly identification?: string | null | undefined;
  readonly name: string;
  readonly phone?: string | null | undefined;
  readonly photoUri?: string | null | undefined;
  readonly role: 'administrator' | 'barber' | 'custom';
}) {
  const role: Record<
    'administrator' | 'barber' | 'custom',
    OnboardingCollaboratorRole
  > = {
    administrator: OnboardingCollaboratorRole.ADMINISTRATOR,
    barber: OnboardingCollaboratorRole.BARBER,
    custom: OnboardingCollaboratorRole.CUSTOM,
  };
  return {
    agendaColor: input.agendaColor.toUpperCase(),
    canPerformServices: input.canPerformServices,
    customRoleDescription: input.customRoleDescription ?? null,
    customRoleName: input.customRoleName ?? null,
    description: input.description ?? null,
    identification: input.identification ?? null,
    name: input.name,
    phone: input.phone ?? null,
    photoUri: input.photoUri ?? null,
    role: role[input.role],
  };
}

function publicOnboardingCollaborator(collaborator: {
  readonly agendaColor: string;
  readonly canPerformServices: boolean;
  readonly customRoleDescription: string | null;
  readonly customRoleName: string | null;
  readonly description: string | null;
  readonly id: string;
  readonly identification: string | null;
  readonly name: string;
  readonly phone: string | null;
  readonly photoUri: string | null;
  readonly role: OnboardingCollaboratorRole;
}) {
  return {
    agendaColor: collaborator.agendaColor,
    canPerformServices: collaborator.canPerformServices,
    customRoleDescription: collaborator.customRoleDescription,
    customRoleName: collaborator.customRoleName,
    description: collaborator.description,
    id: collaborator.id,
    identification: collaborator.identification,
    name: collaborator.name,
    phone: collaborator.phone,
    photoUri: collaborator.photoUri,
    role: collaborator.role.toLowerCase(),
  };
}

function onboardingServiceData(input: {
  readonly agendaColor: string;
  readonly category: { readonly description: string; readonly name: string } | null;
  readonly description?: string | null | undefined;
  readonly downPaymentPercentage: number;
  readonly durationMinutes: number;
  readonly imageUri?: string | null | undefined;
  readonly name: string;
  readonly onlineBooking: boolean;
  readonly price: number;
  readonly priceType: 'fixed' | 'from' | 'free' | 'hidden';
  readonly showServiceTime: boolean;
  readonly tax: { readonly addAtCheckout: boolean; readonly addAtPurchaseEnd: boolean; readonly name: string; readonly percentage: number } | null;
}) {
  return {
    agendaColor: input.agendaColor.toUpperCase(),
    categoryDescription: input.category?.description || null,
    categoryName: input.category?.name || null,
    description: input.description || null,
    downPaymentPercentage: input.downPaymentPercentage,
    durationMinutes: input.durationMinutes,
    imageUri: input.imageUri || null,
    name: input.name,
    onlineBooking: input.onlineBooking,
    priceCents: Math.round(input.price * 100),
    priceType: input.priceType,
    showServiceTime: input.showServiceTime,
    taxAddAtCheckout: input.tax?.addAtCheckout ?? false,
    taxAddAtPurchaseEnd: input.tax?.addAtPurchaseEnd ?? false,
    taxName: input.tax?.name || null,
    taxPercentage: input.tax?.percentage ?? null,
  };
}

function publicOnboardingService(service: {
  readonly agendaColor: string; readonly categoryDescription: string | null; readonly categoryName: string | null;
  readonly description: string | null; readonly downPaymentPercentage: number; readonly durationMinutes: number;
  readonly id: string; readonly imageUri: string | null; readonly name: string; readonly onlineBooking: boolean;
  readonly priceCents: number; readonly priceType: string; readonly showServiceTime: boolean;
  readonly taxAddAtCheckout: boolean; readonly taxAddAtPurchaseEnd: boolean; readonly taxName: string | null; readonly taxPercentage: number | null;
}) {
  return {
    agendaColor: service.agendaColor,
    category: service.categoryName ? { description: service.categoryDescription ?? '', name: service.categoryName } : null,
    description: service.description,
    downPaymentPercentage: service.downPaymentPercentage,
    durationMinutes: service.durationMinutes,
    id: service.id,
    imageUri: service.imageUri,
    name: service.name,
    onlineBooking: service.onlineBooking,
    price: service.priceCents / 100,
    priceType: service.priceType as 'fixed' | 'from' | 'free' | 'hidden',
    showServiceTime: service.showServiceTime,
    tax: service.taxName && service.taxPercentage !== null ? { addAtCheckout: service.taxAddAtCheckout, addAtPurchaseEnd: service.taxAddAtPurchaseEnd, name: service.taxName, percentage: service.taxPercentage } : null,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeBusinessName(businessName: string): string {
  return businessName
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/gu, '');
}

function duplicateRegistrationError(
  duplicate: {
    readonly businessNameKey: string | null;
    readonly phoneKey: string | null;
  },
  businessNameKey: string,
  phoneKey: string,
): ApiError {
  if (duplicate.phoneKey === phoneKey) {
    return new ApiError(
      409,
      'PHONE_ALREADY_EXISTS',
      'Ese número telefónico ya está registrado.',
    );
  }
  if (duplicate.businessNameKey === businessNameKey) {
    return new ApiError(
      409,
      'BUSINESS_NAME_ALREADY_EXISTS',
      'Ese nombre de negocio ya está en uso.',
    );
  }
  return new ApiError(
    409,
    'REGISTRATION_DATA_ALREADY_EXISTS',
    'El correo, teléfono o nombre del negocio ya está registrado.',
  );
}

function publicUser(user: { email: string; fullName: string; id: string }) {
  return { email: user.email, fullName: user.fullName, id: user.id };
}

function verificationRateLimitError(lockedUntil: Date): ApiError {
  const remainingMinutes = Math.max(
    1,
    Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000),
  );
  return new ApiError(
    429,
    'VERIFICATION_RATE_LIMITED',
    `Demasiados intentos. Inténtalo nuevamente en ${remainingMinutes} minuto${remainingMinutes === 1 ? '' : 's'}.`,
  );
}

function assertVerificationNotLocked(lockedUntil: Date | null): void {
  if (!lockedUntil || lockedUntil <= new Date()) return;
  throw verificationRateLimitError(lockedUntil);
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
  fullName,
  passwordHash,
  registrationProfile,
  verificationMailer,
}: {
  readonly appEnvironment: ApiConfig['APP_ENV'];
  readonly database: DatabaseClient;
  readonly email: string;
  readonly fullName: string;
  readonly passwordHash: string;
  readonly registrationProfile?: RegistrationProfileDraft;
  readonly verificationMailer: VerificationMailer | null;
}) {
  const code = createVerificationCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VERIFICATION_DURATION_MS);
  const registrationData = registrationProfile
    ? {
        ...registrationProfile,
        businessNameKey: normalizeBusinessName(
          registrationProfile.businessName,
        ),
        phoneKey: normalizePhone(registrationProfile.phone),
      }
    : {};
  await database.pendingRegistration.upsert({
    create: {
      codeHash: hashOpaqueToken(code),
      email,
      expiresAt,
      fullName,
      passwordHash,
      ...registrationData,
    },
    update: {
      codeHash: hashOpaqueToken(code),
      expiresAt,
      failedAttempts: 0,
      fullName,
      lockedUntil: null,
      passwordHash,
      ...registrationData,
    },
    where: { email },
  });
  if (verificationMailer) await verificationMailer.send({ code, email });
  else if (appEnvironment !== 'local') {
    throw new ApiError(
      503,
      'VERIFICATION_DELIVERY_UNAVAILABLE',
      'El servicio de verificación por correo no está disponible.',
    );
  }
  return {
    developmentVerificationCode: appEnvironment === 'local' ? code : undefined,
    verificationExpiresAt: expiresAt.toISOString(),
  };
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
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: config.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/v1/auth/registration-availability', async (request) => {
    const input = registrationAvailabilitySchema.parse(request.body);
    const now = new Date();
    const email = input.email ? normalizeEmail(input.email) : null;
    const businessNameKey = input.businessName
      ? normalizeBusinessName(input.businessName)
      : null;
    const phoneKey = input.phone ? normalizePhone(input.phone) : null;
    const [
      existingUser,
      pendingEmail,
      profileBusiness,
      pendingBusiness,
      profilePhone,
      pendingPhone,
    ] = await Promise.all([
      email
        ? database.user.findUnique({
            select: { emailVerifiedAt: true, passwordHash: true },
            where: { email },
          })
        : null,
      email
        ? database.pendingRegistration.findFirst({
            select: { id: true },
            where: { email, expiresAt: { gt: now } },
          })
        : null,
      businessNameKey
        ? database.userRegistrationProfile.findUnique({
            select: { userId: true },
            where: { businessNameKey },
          })
        : null,
      businessNameKey
        ? database.pendingRegistration.findFirst({
            select: { id: true },
            where: { businessNameKey, expiresAt: { gt: now } },
          })
        : null,
      phoneKey
        ? database.userRegistrationProfile.findUnique({
            select: { userId: true },
            where: { phoneKey },
          })
        : null,
      phoneKey
        ? database.pendingRegistration.findFirst({
            select: { id: true },
            where: { expiresAt: { gt: now }, phoneKey },
          })
        : null,
    ]);
    return {
      conflicts: {
        ...(email &&
        ((existingUser?.passwordHash && existingUser.emailVerifiedAt) ||
          pendingEmail)
          ? { email: 'Ese correo ya está registrado.' }
          : {}),
        ...(businessNameKey && (profileBusiness || pendingBusiness)
          ? { businessName: 'Ese nombre de negocio ya está en uso.' }
          : {}),
        ...(phoneKey && (profilePhone || pendingPhone)
          ? { phone: 'Ese número telefónico ya está registrado.' }
          : {}),
      },
    };
  });

  app.post('/v1/auth/register', async (request, reply) => {
    const input = signUpSchema.parse(request.body);
    const email = normalizeEmail(input.email);
    const businessNameKey = normalizeBusinessName(input.businessName);
    const phoneKey = normalizePhone(input.phone);
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
      const pendingRegistration = await database.pendingRegistration.findUnique(
        { where: { email } },
      );
      assertVerificationNotLocked(pendingRegistration?.lockedUntil ?? null);
      if (pendingRegistration && pendingRegistration.expiresAt > new Date()) {
        throw new ApiError(
          409,
          'EMAIL_ALREADY_EXISTS',
          'Ese correo ya está registrado o pendiente de verificación.',
        );
      }
      await database.pendingRegistration.deleteMany({
        where: {
          email: { not: email },
          expiresAt: { lte: new Date() },
          OR: [{ businessNameKey }, { phoneKey }],
        },
      });
      const [duplicateProfile, duplicatePendingRegistration] =
        await Promise.all([
          database.userRegistrationProfile.findFirst({
            select: { businessNameKey: true, phoneKey: true },
            where: { OR: [{ businessNameKey }, { phoneKey }] },
          }),
          database.pendingRegistration.findFirst({
            select: { businessNameKey: true, phoneKey: true },
            where: {
              email: { not: email },
              expiresAt: { gt: new Date() },
              OR: [{ businessNameKey }, { phoneKey }],
            },
          }),
        ]);
      const duplicate = duplicateProfile ?? duplicatePendingRegistration;
      if (duplicate) {
        throw duplicateRegistrationError(duplicate, businessNameKey, phoneKey);
      }
      const verification = await issueVerificationCode({
        appEnvironment: config.APP_ENV,
        database,
        email,
        fullName: input.fullName.trim(),
        passwordHash,
        registrationProfile: {
          accountType:
            input.accountType === 'business'
              ? RegistrationAccountType.BUSINESS
              : RegistrationAccountType.PROFESSIONAL,
          businessName: input.businessName.trim(),
          city: input.city.trim(),
          closingTime: input.closingTime,
          countryCode: input.countryCode,
          openingTime: input.openingTime,
          phone: input.phone.trim(),
        },
        verificationMailer,
      });
      return reply.code(201).send({
        ...(verification.developmentVerificationCode
          ? {
              developmentVerificationCode:
                verification.developmentVerificationCode,
            }
          : {}),
        email,
        verificationExpiresAt: verification.verificationExpiresAt,
        verificationRequired: true,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApiError(
          409,
          'REGISTRATION_DATA_ALREADY_EXISTS',
          'El correo, teléfono o nombre del negocio ya está registrado.',
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
    const outcome = await database.$transaction(async (transaction) => {
      const now = new Date();
      await transaction.$queryRaw`
        SELECT "id"
        FROM "pending_registrations"
        WHERE "email" = ${email}
        FOR UPDATE
      `;
      const verification = await transaction.pendingRegistration.findUnique({
        where: { email },
      });
      if (!verification || verification.expiresAt <= now) {
        return { kind: 'invalid' as const, remainingAttempts: null };
      }
      if (verification.lockedUntil && verification.lockedUntil > now) {
        return {
          kind: 'locked' as const,
          lockedUntil: verification.lockedUntil,
        };
      }
      if (verification.codeHash !== hashOpaqueToken(input.code)) {
        const updated = await transaction.pendingRegistration.update({
          data: verification.lockedUntil
            ? { failedAttempts: 1, lockedUntil: null }
            : { failedAttempts: { increment: 1 } },
          where: { id: verification.id },
        });
        if (updated.failedAttempts >= MAX_VERIFICATION_ATTEMPTS) {
          const lockedUntil = new Date(
            now.getTime() + VERIFICATION_LOCK_DURATION_MS,
          );
          await transaction.pendingRegistration.update({
            data: { lockedUntil },
            where: { id: verification.id },
          });
          return { kind: 'locked' as const, lockedUntil };
        }
        return {
          kind: 'invalid' as const,
          remainingAttempts: MAX_VERIFICATION_ATTEMPTS - updated.failedAttempts,
        };
      }
      const consumed = await transaction.pendingRegistration.deleteMany({
        where: {
          codeHash: verification.codeHash,
          id: verification.id,
        },
      });
      if (consumed.count !== 1) {
        return { kind: 'invalid' as const, remainingAttempts: null };
      }
      const registrationProfile = completeRegistrationProfile(verification);
      const user = await transaction.user.upsert({
        create: {
          email: verification.email,
          emailVerifiedAt: now,
          fullName: verification.fullName,
          passwordHash: verification.passwordHash,
          ...(registrationProfile ? { phone: registrationProfile.phone } : {}),
        },
        update: {
          emailVerifiedAt: now,
          fullName: verification.fullName,
          passwordHash: verification.passwordHash,
          ...(registrationProfile ? { phone: registrationProfile.phone } : {}),
        },
        where: { email: verification.email },
      });
      if (registrationProfile) {
        const {
          accountType,
          businessName,
          city,
          closingTime,
          countryCode,
          openingTime,
        } = registrationProfile;
        const profileData = {
          accountType,
          businessName,
          businessNameKey: normalizeBusinessName(businessName),
          city,
          closingTime,
          countryCode,
          openingTime,
          phoneKey: normalizePhone(registrationProfile.phone),
        };
        await transaction.userRegistrationProfile.upsert({
          create: { ...profileData, userId: user.id },
          update: profileData,
          where: { userId: user.id },
        });
      }
      return { kind: 'verified' as const, user };
    });
    if (outcome.kind === 'locked') {
      throw verificationRateLimitError(outcome.lockedUntil);
    }
    if (outcome.kind === 'invalid') {
      throw new ApiError(
        400,
        'INVALID_VERIFICATION_CODE',
        outcome.remainingAttempts === null
          ? 'El código no es válido o ya venció.'
          : `El código no es válido. Te quedan ${outcome.remainingAttempts} intento${outcome.remainingAttempts === 1 ? '' : 's'}.`,
      );
    }
    return {
      session: await createSession(database, outcome.user.id),
      user: publicUser(outcome.user),
    };
  });

  app.post('/v1/auth/resend-verification', async (request) => {
    const { email: rawEmail } = resendVerificationSchema.parse(request.body);
    const email = normalizeEmail(rawEmail);
    const pendingRegistration = await database.pendingRegistration.findUnique({
      where: { email },
    });
    assertVerificationNotLocked(pendingRegistration?.lockedUntil ?? null);
    let developmentVerificationCode: string | undefined;
    let verificationExpiresAt = new Date(
      Date.now() + VERIFICATION_DURATION_MS,
    ).toISOString();
    if (pendingRegistration) {
      const registrationProfile =
        completeRegistrationProfile(pendingRegistration);
      const verification = await issueVerificationCode({
        appEnvironment: config.APP_ENV,
        database,
        email: pendingRegistration.email,
        fullName: pendingRegistration.fullName,
        passwordHash: pendingRegistration.passwordHash,
        ...(registrationProfile ? { registrationProfile } : {}),
        verificationMailer,
      });
      developmentVerificationCode = verification.developmentVerificationCode;
      verificationExpiresAt = verification.verificationExpiresAt;
    }
    return {
      ...(developmentVerificationCode ? { developmentVerificationCode } : {}),
      message: 'Si la cuenta está pendiente, recibirás un nuevo código.',
      verificationExpiresAt,
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

  app.get('/v1/onboarding/account-details', async (request) => {
    const { user } = await authenticate(database, request);
    const profile = await database.userRegistrationProfile.findUnique({
      where: { userId: user.id },
    });
    return {
      accountType: profile ? (profile.accountType.toLowerCase() as 'business' | 'professional') : null,
      addressLine: profile?.addressLine ?? null,
      businessName: profile?.businessName ?? null,
      bookingUrl: profile
        ? `https://book.weibook.co/${profile.businessNameKey}`
        : null,
      city: profile?.city ?? null,
      closingTime: profile?.closingTime ?? null,
      coverImageUri: profile?.coverImageUri ?? null,
      countryCode: profile?.countryCode ?? null,
      description: profile?.description ?? null,
      email: user.email,
      fullName: user.fullName,
      facebookUrl: profile?.facebookUrl ?? null,
      openingTime: profile?.openingTime ?? null,
      phone: user.phone,
      instagramUrl: profile?.instagramUrl ?? null,
    };
  });

  app.patch('/v1/onboarding/account-details', async (request) => {
    const { user } = await authenticate(database, request);
    const input = updateOnboardingAccountDetailsSchema.parse(request.body);
    const existingProfile = await database.userRegistrationProfile.findUnique({
      where: { userId: user.id },
    });
    if (!existingProfile) {
      throw new ApiError(
        404,
        'ONBOARDING_ACCOUNT_DETAILS_NOT_FOUND',
        'No encontramos la informaci\u00f3n de tu cuenta.',
      );
    }

    try {
      const [updatedUser, updatedProfile] = await database.$transaction([
        database.user.update({
          data: { phone: input.phone },
          where: { id: user.id },
        }),
        database.userRegistrationProfile.update({
          data: {
            addressLine: input.addressLine,
            businessName: input.businessName,
            businessNameKey: normalizeBusinessName(input.businessName),
            city: input.city,
            countryCode: input.countryCode,
            coverImageUri: input.coverImageUri,
            description: input.description,
            facebookUrl: input.facebookUrl,
            instagramUrl: input.instagramUrl,
            phoneKey: normalizePhone(input.phone),
          },
          where: { userId: user.id },
        }),
      ]);
      return {
        accountType: updatedProfile.accountType.toLowerCase() as
          | 'business'
          | 'professional',
        addressLine: updatedProfile.addressLine,
        businessName: updatedProfile.businessName,
        bookingUrl: 'https://book.weibook.co/' + updatedProfile.businessNameKey,
        city: updatedProfile.city,
        closingTime: updatedProfile.closingTime,
        coverImageUri: updatedProfile.coverImageUri,
        countryCode: updatedProfile.countryCode,
        description: updatedProfile.description,
        email: updatedUser.email,
        facebookUrl: updatedProfile.facebookUrl,
        fullName: updatedUser.fullName,
        instagramUrl: updatedProfile.instagramUrl,
        openingTime: updatedProfile.openingTime,
        phone: updatedUser.phone,
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApiError(
          409,
          'ONBOARDING_ACCOUNT_DETAILS_ALREADY_EXISTS',
          'El nombre del negocio o tel\u00e9fono ya est\u00e1 registrado.',
        );
      }
      throw error;
    }
  });


  app.get('/v1/onboarding/collaborators', async (request) => {
    const { user } = await authenticate(database, request);
    const collaborators = await database.onboardingCollaborator.findMany({
      orderBy: { createdAt: 'asc' },
      where: { ownerUserId: user.id },
    });
    return {
      collaborators: collaborators.map(publicOnboardingCollaborator),
    };
  });

  app.post('/v1/onboarding/collaborators', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = createOnboardingCollaboratorSchema.parse(request.body);
    const collaborator = await database.onboardingCollaborator.create({
      data: {
        ...onboardingCollaboratorData(input),
        ownerUserId: user.id,
      },
    });
    return reply
      .code(201)
      .send({ collaborator: publicOnboardingCollaborator(collaborator) });
  });

  app.patch('/v1/onboarding/collaborators/:id', async (request) => {
    const { user } = await authenticate(database, request);
    const { id } = onboardingCollaboratorParamsSchema.parse(request.params);
    const input = updateOnboardingCollaboratorSchema.parse(request.body);
    const existing = await database.onboardingCollaborator.findFirst({
      where: { id, ownerUserId: user.id },
    });
    if (!existing)
      throw new ApiError(
        404,
        'ONBOARDING_COLLABORATOR_NOT_FOUND',
        'El colaborador no existe.',
      );
    const collaborator = await database.onboardingCollaborator.update({
      data: onboardingCollaboratorData(input),
      where: { id: existing.id },
    });
    return { collaborator: publicOnboardingCollaborator(collaborator) };
  });

  app.delete('/v1/onboarding/collaborators/:id', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const { id } = onboardingCollaboratorParamsSchema.parse(request.params);
    const existing = await database.onboardingCollaborator.findFirst({
      where: { id, ownerUserId: user.id },
    });
    if (!existing)
      throw new ApiError(
        404,
        'ONBOARDING_COLLABORATOR_NOT_FOUND',
        'El colaborador no existe.',
      );
    await database.onboardingCollaborator.delete({
      where: { id: existing.id },
    });
    return reply.code(204).send();
  });

  app.get('/v1/onboarding/services', async (request) => {
    const { user } = await authenticate(database, request);
    const services = await database.onboardingService.findMany({ orderBy: { createdAt: 'asc' }, where: { ownerUserId: user.id } });
    return { services: services.map(publicOnboardingService) };
  });

  app.post('/v1/onboarding/services', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = createOnboardingServiceSchema.parse(request.body);
    const service = await database.onboardingService.create({ data: { ...onboardingServiceData(input), ownerUserId: user.id } });
    return reply.code(201).send({ service: publicOnboardingService(service) });
  });

  app.patch('/v1/onboarding/services/:id', async (request) => {
    const { user } = await authenticate(database, request);
    const { id } = onboardingServiceParamsSchema.parse(request.params);
    const input = updateOnboardingServiceSchema.parse(request.body);
    const existing = await database.onboardingService.findFirst({ where: { id, ownerUserId: user.id } });
    if (!existing) throw new ApiError(404, 'ONBOARDING_SERVICE_NOT_FOUND', 'El servicio no existe.');
    const service = await database.onboardingService.update({ data: onboardingServiceData(input), where: { id: existing.id } });
    return { service: publicOnboardingService(service) };
  });

  app.delete('/v1/onboarding/services/:id', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const { id } = onboardingServiceParamsSchema.parse(request.params);
    const existing = await database.onboardingService.findFirst({ where: { id, ownerUserId: user.id } });
    if (!existing) throw new ApiError(404, 'ONBOARDING_SERVICE_NOT_FOUND', 'El servicio no existe.');
    await database.onboardingService.delete({ where: { id: existing.id } });
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
