import {
  MembershipRole,
  MembershipStatus,
  PayphoneConnectionStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { ApiConfig } from './config';
import { ApiError } from './errors';
import { decryptPaymentCredential, encryptPaymentCredential } from './security';

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{
  readonly user: { readonly email: string; readonly id: string };
}>;

const PAYPHONE_LINKS_URL = 'https://pay.payphonetodoesposible.com/api/Links';

const saveConfigurationSchema = z.object({
  storeId: z.string().trim().min(1).max(160),
  token: z.string().trim().min(16).max(4_096),
});
const enableConfigurationSchema = z.object({ enabled: z.boolean() });

async function activeMembership(database: DatabaseClient, userId: string) {
  return database.membership.findFirst({
    where: { status: MembershipStatus.ACTIVE, userId },
  });
}

async function ownerScope(database: DatabaseClient, userId: string) {
  const membership = await activeMembership(database, userId);
  if (!membership)
    throw new ApiError(
      403,
      'ORGANIZATION_ACCESS_REQUIRED',
      'No tienes una organizacion activa.',
    );
  if (membership.role !== MembershipRole.OWNER)
    throw new ApiError(
      403,
      'PAYPHONE_OWNER_REQUIRED',
      'Solo el propietario puede administrar PayPhone.',
    );
  return membership;
}

function publicConfiguration(
  configuration: {
    connectionStatus: PayphoneConnectionStatus;
    connectedAt: Date | null;
    isEnabled: boolean;
    lastTestedAt: Date | null;
    storeId: string;
  } | null,
  encryptionConfigured: boolean,
) {
  if (!configuration)
    return {
      configuration: null,
      encryptionConfigured,
    };
  return {
    configuration: {
      connectedAt: configuration.connectedAt?.toISOString() ?? null,
      isEnabled: configuration.isEnabled,
      lastTestedAt: configuration.lastTestedAt?.toISOString() ?? null,
      status: configuration.connectionStatus.toLowerCase() as
        'connected' | 'error' | 'requires_attention',
      storeIdHint: `••••${configuration.storeId.slice(-4)}`,
    },
    encryptionConfigured,
  };
}

export function payphoneEncryptionKey(config: ApiConfig): string {
  if (!config.PAYPHONE_CREDENTIALS_ENCRYPTION_KEY)
    throw new ApiError(
      503,
      'PAYPHONE_ENCRYPTION_NOT_CONFIGURED',
      'El servidor aun no esta listo para guardar credenciales de PayPhone. Contacta al administrador de Nava.',
    );
  return config.PAYPHONE_CREDENTIALS_ENCRYPTION_KEY;
}

async function verifyCredentials(
  token: string,
  storeId: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(PAYPHONE_LINKS_URL, {
      body: JSON.stringify({
        amount: 1,
        amountWithoutTax: 1,
        clientTransactionId: `NAVA${Date.now().toString(36)}`.slice(0, 15),
        currency: 'USD',
        expireIn: 1,
        oneTime: true,
        reference: 'Validacion de configuracion Nava',
        storeId,
      }),
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(
      502,
      'PAYPHONE_CONNECTION_UNAVAILABLE',
      'No fue posible contactar a PayPhone. Intentalo nuevamente en unos minutos.',
    );
  }
  // Crear un link no cobra dinero: el pago solo se procesa si alguien abre y
  // completa el formulario. Este link unico de un centavo verifica Token y StoreID.
  if (response.ok) return;
  if (response.status === 401 || response.status === 403)
    throw new ApiError(
      422,
      'PAYPHONE_AUTH_FAILED',
      'PayPhone rechazo el Token. Verifica que pertenezca a la cuenta PayPhone correcta.',
    );
  if (response.status >= 500)
    throw new ApiError(
      502,
      'PAYPHONE_CONNECTION_UNAVAILABLE',
      'PayPhone no esta disponible para validar la conexion. Intentalo mas tarde.',
    );
  throw new ApiError(
    422,
    'PAYPHONE_CONFIGURATION_REJECTED',
    'PayPhone rechazo el StoreID o la configuracion. Revisa ambos datos en PayPhone Business.',
  );
}

export function registerPayphoneRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
  config: ApiConfig,
) {
  app.get('/v1/payphone/configuration', async (request) => {
    const { user } = await authenticate(database, request);
    const membership = await activeMembership(database, user.id);
    if (!membership)
      throw new ApiError(
        403,
        'ORGANIZATION_ACCESS_REQUIRED',
        'No tienes una organizacion activa.',
      );
    const configuration = await database.payphoneConfiguration.findUnique({
      where: { organizationId: membership.organizationId },
    });
    return publicConfiguration(
      configuration,
      Boolean(config.PAYPHONE_CREDENTIALS_ENCRYPTION_KEY),
    );
  });

  app.post('/v1/payphone/configuration', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const membership = await ownerScope(database, user.id);
    const input = saveConfigurationSchema.parse(request.body);
    const key = payphoneEncryptionKey(config);
    let encryptedToken: string;
    try {
      encryptedToken = encryptPaymentCredential({
        encodedKey: key,
        organizationId: membership.organizationId,
        secret: input.token,
      });
    } catch {
      throw new ApiError(
        503,
        'PAYPHONE_ENCRYPTION_NOT_CONFIGURED',
        'La clave de cifrado de PayPhone del servidor no es valida.',
      );
    }
    const configuration = await database.payphoneConfiguration.upsert({
      create: {
        connectionStatus: PayphoneConnectionStatus.REQUIRES_ATTENTION,
        encryptedToken,
        isEnabled: false,
        organizationId: membership.organizationId,
        storeId: input.storeId,
      },
      update: {
        connectedAt: null,
        connectionStatus: PayphoneConnectionStatus.REQUIRES_ATTENTION,
        encryptedToken,
        isEnabled: false,
        lastErrorCode: null,
        lastTestedAt: null,
        storeId: input.storeId,
      },
      where: { organizationId: membership.organizationId },
    });
    await database.auditLog.create({
      data: {
        action: 'payphone.configuration_saved',
        actorUserId: user.id,
        afterData: { storeIdChanged: true },
        entityId: configuration.id,
        entityType: 'payphone_configuration',
        organizationId: membership.organizationId,
      },
    });
    return reply.code(201).send(publicConfiguration(configuration, true));
  });

  app.post('/v1/payphone/configuration/test', async (request) => {
    const { user } = await authenticate(database, request);
    const membership = await ownerScope(database, user.id);
    const configuration = await database.payphoneConfiguration.findUnique({
      where: { organizationId: membership.organizationId },
    });
    if (!configuration)
      throw new ApiError(
        404,
        'PAYPHONE_NOT_CONFIGURED',
        'Guarda Token y StoreID antes de probar la conexion.',
      );

    try {
      const token = decryptPaymentCredential({
        encodedKey: payphoneEncryptionKey(config),
        encryptedSecret: configuration.encryptedToken,
        organizationId: membership.organizationId,
      });
      await verifyCredentials(token, configuration.storeId);
      const updated = await database.payphoneConfiguration.update({
        data: {
          connectedAt: new Date(),
          connectionStatus: PayphoneConnectionStatus.CONNECTED,
          lastErrorCode: null,
          lastTestedAt: new Date(),
        },
        where: { id: configuration.id },
      });
      await database.auditLog.create({
        data: {
          action: 'payphone.connection_tested',
          actorUserId: user.id,
          afterData: { result: 'connected' },
          entityId: updated.id,
          entityType: 'payphone_configuration',
          organizationId: membership.organizationId,
        },
      });
      return publicConfiguration(updated, true);
    } catch (error) {
      const code =
        error instanceof ApiError ? error.code : 'PAYPHONE_DECRYPT_FAILED';
      await database.payphoneConfiguration.update({
        data: {
          connectionStatus: PayphoneConnectionStatus.ERROR,
          isEnabled: false,
          lastErrorCode: code,
          lastTestedAt: new Date(),
        },
        where: { id: configuration.id },
      });
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        422,
        code,
        'No fue posible leer las credenciales de PayPhone. Guardalas nuevamente.',
      );
    }
  });

  app.patch('/v1/payphone/configuration', async (request) => {
    const { user } = await authenticate(database, request);
    const membership = await ownerScope(database, user.id);
    const input = enableConfigurationSchema.parse(request.body);
    const configuration = await database.payphoneConfiguration.findUnique({
      where: { organizationId: membership.organizationId },
    });
    if (!configuration)
      throw new ApiError(
        404,
        'PAYPHONE_NOT_CONFIGURED',
        'Configura PayPhone antes de activarlo.',
      );
    if (
      input.enabled &&
      configuration.connectionStatus !== PayphoneConnectionStatus.CONNECTED
    )
      throw new ApiError(
        409,
        'PAYPHONE_TEST_REQUIRED',
        'Prueba la conexion antes de activar PayPhone.',
      );
    const updated = await database.payphoneConfiguration.update({
      data: { isEnabled: input.enabled },
      where: { id: configuration.id },
    });
    await database.auditLog.create({
      data: {
        action: input.enabled ? 'payphone.enabled' : 'payphone.disabled',
        actorUserId: user.id,
        afterData: { enabled: input.enabled },
        entityId: updated.id,
        entityType: 'payphone_configuration',
        organizationId: membership.organizationId,
      },
    });
    return publicConfiguration(updated, true);
  });

  app.delete('/v1/payphone/configuration', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const membership = await ownerScope(database, user.id);
    const configuration = await database.payphoneConfiguration.findUnique({
      where: { organizationId: membership.organizationId },
    });
    if (!configuration) return reply.code(204).send();
    await database.payphoneConfiguration.delete({
      where: { id: configuration.id },
    });
    await database.auditLog.create({
      data: {
        action: 'payphone.disconnected',
        actorUserId: user.id,
        afterData: { disconnected: true },
        entityId: configuration.id,
        entityType: 'payphone_configuration',
        organizationId: membership.organizationId,
      },
    });
    return reply.code(204).send();
  });
}
