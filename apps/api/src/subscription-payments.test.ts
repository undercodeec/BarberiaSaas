import { randomUUID } from 'node:crypto';

import {
  MembershipRole,
  MembershipStatus,
  PaymentProviderEventSource,
  PlatformPaymentConfigurationStatus,
  SubscriptionInvoiceStatus,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
  createDatabaseClient,
} from '@barber-saas/database';
import { afterAll, describe, expect, it } from 'vitest';

import { buildApi } from './app';
import { readConfig } from './config';
import { ApiError } from './errors';
import { hashOpaqueToken } from './security';
import {
  addBillingDays,
  expireStaleSubscriptionPayments,
  inclusiveTaxBreakdown,
  platformPaymentEventHash,
  resolveFounderPromotion,
  sanitizePlatformProviderPayload,
} from './subscription-payments';

describe('dominio de pagos de suscripción', () => {
  it('calcula el período comercial exacto de 30 días', () => {
    expect(addBillingDays(new Date('2026-01-31T12:00:00Z'), 30)).toEqual(
      new Date('2026-03-02T12:00:00Z'),
    );
  });

  it('desglosa impuestos sin alterar el precio final publicado', () => {
    expect(inclusiveTaxBreakdown(1993, 1500)).toEqual({
      subtotalCents: 1733,
      taxCents: 260,
    });
  });

  it('minimiza payloads y genera una huella estable por evento', () => {
    expect(
      sanitizePlatformProviderPayload({
        Amount: 983,
        Document: '0100000000',
        Email: 'persona@example.com',
        StatusCode: 3,
        TransactionId: 123,
      }),
    ).toEqual({ amount: 983, statuscode: 3, transactionid: 123 });
    const event = {
      internalReference: 'N12345678901234',
      providerTransactionId: '123',
      status: 'approved' as const,
    };
    expect(platformPaymentEventHash(event)).toBe(
      platformPaymentEventHash(event),
    );
    expect(platformPaymentEventHash(event)).toHaveLength(64);
  });

  it('aplica el código fundador solo a Nava Local y conserva el beneficio activo', () => {
    expect(
      resolveFounderPromotion({
        configuredCode: 'NAVA-FOUNDER',
        founderPriceEligible: false,
        founderPriceLostAt: null,
        planCode: 'local',
        submittedCode: 'nava-founder',
      }),
    ).toMatchObject({
      applied: true,
      error: null,
      promotionCode: 'NAVA-FOUNDER',
    });
    expect(
      resolveFounderPromotion({
        configuredCode: 'NAVA-FOUNDER',
        founderPriceEligible: true,
        founderPriceLostAt: null,
        planCode: 'local',
        submittedCode: undefined,
      }),
    ).toMatchObject({ applied: true, error: null });
    expect(
      resolveFounderPromotion({
        configuredCode: 'NAVA-FOUNDER',
        founderPriceEligible: false,
        founderPriceLostAt: new Date(),
        planCode: 'local',
        submittedCode: 'NAVA-FOUNDER',
      }),
    ).toMatchObject({
      applied: false,
      error: 'FOUNDER_PRICE_CONTINUITY_LOST',
    });
  });
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase('checkout de suscripción en PostgreSQL', () => {
  const database = createDatabaseClient({ connectionString: testDatabaseUrl! });
  const suffix = randomUUID().slice(0, 8);
  const firstToken = `subscription-owner-${suffix}`;
  const secondToken = `subscription-other-${suffix}`;
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  let app: Awaited<ReturnType<typeof buildApi>>;
  let paymentAttemptId = '';

  afterAll(async () => {
    if (organizationIds.length > 0) {
      await database.paymentProviderEvent.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await database.subscriptionChange.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await database.subscriptionPaymentAttempt.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await database.subscriptionInvoice.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await database.auditLog.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await database.subscription.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await database.membership.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await database.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }
    if (userIds.length > 0) {
      await database.session.deleteMany({ where: { userId: { in: userIds } } });
      await database.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await database.platformPaymentConfiguration.deleteMany({
      where: { provider: 'payphone_web_button' },
    });
    await app?.close();
  });

  it('crea una intención una vez, aísla tenants y aplica solo verificación exacta', async () => {
    const firstUser = await database.user.create({
      data: {
        email: `subscription-${suffix}@example.com`,
        emailVerifiedAt: new Date(),
        fullName: 'Owner Suscripción',
      },
    });
    const secondUser = await database.user.create({
      data: {
        email: `subscription-other-${suffix}@example.com`,
        emailVerifiedAt: new Date(),
        fullName: 'Owner Otro Tenant',
      },
    });
    userIds.push(firstUser.id, secondUser.id);
    const firstOrganization = await database.organization.create({
      data: { name: `Suscripción ${suffix}`, slug: `subscription-${suffix}` },
    });
    const secondOrganization = await database.organization.create({
      data: {
        name: `Otro ${suffix}`,
        slug: `subscription-other-${suffix}`,
      },
    });
    organizationIds.push(firstOrganization.id, secondOrganization.id);
    await database.membership.createMany({
      data: [
        {
          organizationId: firstOrganization.id,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
          userId: firstUser.id,
        },
        {
          organizationId: secondOrganization.id,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
          userId: secondUser.id,
        },
      ],
    });
    await database.session.createMany({
      data: [
        {
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          tokenHash: hashOpaqueToken(firstToken),
          userId: firstUser.id,
        },
        {
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          tokenHash: hashOpaqueToken(secondToken),
          userId: secondUser.id,
        },
      ],
    });
    await database.platformPaymentConfiguration.create({
      data: {
        encryptedToken: 'encrypted-only-for-provider-override',
        isEnabled: true,
        provider: 'payphone_web_button',
        status: PlatformPaymentConfigurationStatus.READY,
        storeId: 'nava-store-sandbox',
        webhookAuthorizedAt: new Date(),
      },
    });
    app = await buildApi({
      config: readConfig({
        APP_ENV: 'local',
        CORS_ORIGIN: 'http://localhost:3000',
        DATABASE_URL: testDatabaseUrl!,
        PLATFORM_PAYMENTS_ENABLED: 'true',
        PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(
          32,
          13,
        ).toString('base64'),
        PLATFORM_PAYPHONE_WEBHOOK_ALLOWED_IPS: '127.0.0.1',
        PLATFORM_SUBSCRIPTION_TAX_BASIS_POINTS: '0',
        PLATFORM_SUBSCRIPTION_TERMS_VERSION: 'sandbox-2026-08',
      }),
      database,
      platformPaymentProvider: {
        async preparePayment(input) {
          return {
            paymentUrl: `https://sandbox.example.test/pay/${input.internalReference}`,
          };
        },
        async confirmPayment(input) {
          if (input.providerTransactionId === '9006')
            throw new ApiError(
              502,
              'PAYPHONE_CONFIRM_UNAVAILABLE',
              'Timeout simulado de PayPhone.',
            );
          return {
            amountCents:
              input.providerTransactionId === '9002'
                ? input.amountCents + 1
                : input.amountCents,
            currencyCode:
              input.providerTransactionId === '9003'
                ? 'EUR'
                : input.currencyCode,
            internalReference: input.internalReference,
            payload: {
              Amount: input.amountCents,
              Document: 'sensitive-document',
              Email: 'sensitive@example.com',
              StatusCode: input.providerTransactionId === '9005' ? 2 : 3,
              TransactionId: input.providerTransactionId,
            },
            providerTransactionId: input.providerTransactionId,
            status:
              input.providerTransactionId === '9005' ? 'rejected' : 'approved',
            storeId: input.storeId,
          };
        },
      },
    });

    const headers = {
      authorization: `Bearer ${firstToken}`,
      'idempotency-key': `checkout-${suffix}`,
    };
    const first = await app.inject({
      headers,
      method: 'POST',
      payload: { planCode: 'essential' },
      url: '/v1/subscription/checkout',
    });
    expect(first.statusCode, first.body).toBe(201);
    const firstBody = first.json<{
      id: string;
      invoice: { planCode: string };
      status: string;
    }>();
    paymentAttemptId = firstBody.id;
    expect(firstBody).toMatchObject({
      invoice: { planCode: 'essential' },
      status: 'pending_provider',
    });

    const repeated = await app.inject({
      headers,
      method: 'POST',
      payload: { planCode: 'essential' },
      url: '/v1/subscription/checkout',
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json<{ id: string }>().id).toBe(paymentAttemptId);
    expect(
      await database.subscriptionPaymentAttempt.count({
        where: { organizationId: firstOrganization.id },
      }),
    ).toBe(1);
    expect(
      await database.subscriptionInvoice.count({
        where: { organizationId: firstOrganization.id },
      }),
    ).toBe(1);

    const foreignRead = await app.inject({
      headers: { authorization: `Bearer ${secondToken}` },
      method: 'GET',
      url: `/v1/subscription/payments/${paymentAttemptId}`,
    });
    expect(foreignRead.statusCode).toBe(404);

    const storedAttempt =
      await database.subscriptionPaymentAttempt.findUniqueOrThrow({
        where: { id: paymentAttemptId },
      });
    const auxiliaryWebhook = await app.inject({
      method: 'POST',
      payload: {
        Amount: storedAttempt.amountCents,
        ClientTransactionId: storedAttempt.internalReference,
        Currency: storedAttempt.currencyCode,
        StatusCode: 3,
        StoreId: storedAttempt.storeId,
        TransactionId: 9001,
        TransactionStatus: 'Approved',
      },
      url: '/v1/webhooks/payphone/platform',
    });
    expect(auxiliaryWebhook.statusCode).toBe(200);
    expect(
      (
        await database.subscriptionPaymentAttempt.findUniqueOrThrow({
          where: { id: paymentAttemptId },
        })
      ).status,
    ).toBe(SubscriptionPaymentStatus.PENDING_PROVIDER);

    const falseCallback = await app.inject({
      headers: { authorization: `Bearer ${firstToken}` },
      method: 'POST',
      payload: { clientTransactionId: 'N0000000000000', id: 9001 },
      url: '/v1/subscription/payments/confirm',
    });
    expect(falseCallback.statusCode).toBe(404);

    const timeoutConfirmation = await app.inject({
      headers: { authorization: `Bearer ${firstToken}` },
      method: 'POST',
      payload: {
        clientTransactionId: storedAttempt.internalReference,
        id: 9006,
      },
      url: '/v1/subscription/payments/confirm',
    });
    expect(timeoutConfirmation.statusCode).toBe(502);

    const amountMismatch = await app.inject({
      headers: { authorization: `Bearer ${firstToken}` },
      method: 'POST',
      payload: {
        clientTransactionId: storedAttempt.internalReference,
        id: 9002,
      },
      url: '/v1/subscription/payments/confirm',
    });
    expect(amountMismatch.statusCode).toBe(409);
    const currencyMismatch = await app.inject({
      headers: { authorization: `Bearer ${firstToken}` },
      method: 'POST',
      payload: {
        clientTransactionId: storedAttempt.internalReference,
        id: 9003,
      },
      url: '/v1/subscription/payments/confirm',
    });
    expect(currencyMismatch.statusCode).toBe(409);

    const confirmed = await app.inject({
      headers: { authorization: `Bearer ${firstToken}` },
      method: 'POST',
      payload: {
        clientTransactionId: storedAttempt.internalReference,
        id: 9001,
      },
      url: '/v1/subscription/payments/confirm',
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    expect(confirmed.json<{ status: string }>().status).toBe('applied');

    const [attempt, invoice, subscription, changes, auditEntries, events] =
      await Promise.all([
        database.subscriptionPaymentAttempt.findUniqueOrThrow({
          where: { id: paymentAttemptId },
        }),
        database.subscriptionInvoice.findFirstOrThrow({
          where: { organizationId: firstOrganization.id },
        }),
        database.subscription.findUniqueOrThrow({
          where: { organizationId: firstOrganization.id },
        }),
        database.subscriptionChange.count({
          where: { organizationId: firstOrganization.id },
        }),
        database.auditLog.count({
          where: {
            action: 'subscription.payment_applied',
            organizationId: firstOrganization.id,
          },
        }),
        database.paymentProviderEvent.findMany({
          where: { organizationId: firstOrganization.id },
        }),
      ]);
    expect(attempt.status).toBe(SubscriptionPaymentStatus.APPLIED);
    expect(invoice.status).toBe(SubscriptionInvoiceStatus.PAID);
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
    expect(changes).toBe(1);
    expect(auditEntries).toBe(1);
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(
      events.some(
        (event) => event.source === PaymentProviderEventSource.WEBHOOK,
      ),
    ).toBe(true);
    expect(JSON.stringify(attempt.providerPayload)).not.toContain(
      'sensitive@example.com',
    );
    expect(JSON.stringify(attempt.providerPayload)).not.toContain(
      'sensitive-document',
    );
    const previousPeriodEnd = subscription.currentPeriodEnd;
    const repeatedConfirmation = await app.inject({
      headers: { authorization: `Bearer ${firstToken}` },
      method: 'POST',
      payload: {
        clientTransactionId: storedAttempt.internalReference,
        id: 9001,
      },
      url: '/v1/subscription/payments/confirm',
    });
    expect(repeatedConfirmation.statusCode).toBe(200);
    expect(
      (
        await database.subscription.findUniqueOrThrow({
          where: { organizationId: firstOrganization.id },
        })
      ).currentPeriodEnd,
    ).toEqual(previousPeriodEnd);

    const rejectedCheckout = await app.inject({
      headers: {
        authorization: `Bearer ${firstToken}`,
        'idempotency-key': `rejected-${suffix}`,
      },
      method: 'POST',
      payload: { planCode: 'essential' },
      url: '/v1/subscription/checkout',
    });
    expect(rejectedCheckout.statusCode, rejectedCheckout.body).toBe(201);
    const rejectedAttempt =
      await database.subscriptionPaymentAttempt.findUniqueOrThrow({
        where: { id: rejectedCheckout.json<{ id: string }>().id },
      });
    const rejectedConfirmation = await app.inject({
      headers: { authorization: `Bearer ${firstToken}` },
      method: 'POST',
      payload: {
        clientTransactionId: rejectedAttempt.internalReference,
        id: 9005,
      },
      url: '/v1/subscription/payments/confirm',
    });
    expect(rejectedConfirmation.statusCode).toBe(200);
    expect(rejectedConfirmation.json<{ status: string }>().status).toBe(
      'rejected',
    );
    expect(
      (
        await database.subscriptionPaymentAttempt.findUniqueOrThrow({
          where: { id: rejectedAttempt.id },
        })
      ).status,
    ).toBe(SubscriptionPaymentStatus.REJECTED);
    expect(
      await database.subscriptionChange.count({
        where: { organizationId: firstOrganization.id },
      }),
    ).toBe(1);

    const expiringCheckout = await app.inject({
      headers: {
        authorization: `Bearer ${firstToken}`,
        'idempotency-key': `expired-${suffix}`,
      },
      method: 'POST',
      payload: { planCode: 'essential' },
      url: '/v1/subscription/checkout',
    });
    expect(expiringCheckout.statusCode, expiringCheckout.body).toBe(201);
    const expiringId = expiringCheckout.json<{ id: string }>().id;
    await database.subscriptionPaymentAttempt.update({
      data: { expiresAt: new Date('2026-08-19T00:00:00Z') },
      where: { id: expiringId },
    });
    await expect(
      expireStaleSubscriptionPayments(
        database,
        new Date('2026-08-20T00:00:00Z'),
      ),
    ).resolves.toBe(1);
    const expiredAttempt =
      await database.subscriptionPaymentAttempt.findUniqueOrThrow({
        include: { invoice: true },
        where: { id: expiringId },
      });
    expect(expiredAttempt.status).toBe(SubscriptionPaymentStatus.EXPIRED);
    expect(expiredAttempt.invoice.status).toBe(
      SubscriptionInvoiceStatus.EXPIRED,
    );
  });
});
