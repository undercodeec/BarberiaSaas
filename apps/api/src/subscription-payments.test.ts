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
import { hashOpaqueToken } from './security';
import {
  addBillingDays,
  applyVerifiedPlatformPayment,
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
      where: { provider: 'payphone' },
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
        PLATFORM_SUBSCRIPTION_TAX_BASIS_POINTS: '0',
        PLATFORM_SUBSCRIPTION_TERMS_VERSION: 'sandbox-2026-08',
      }),
      database,
      platformPaymentProvider: {
        async createLink(input) {
          return {
            paymentUrl: `https://sandbox.example.test/pay/${input.internalReference}`,
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
    const verifiedPayment = {
      amountCents: storedAttempt.amountCents,
      currencyCode: storedAttempt.currencyCode,
      internalReference: storedAttempt.internalReference,
      payload: {
        Amount: storedAttempt.amountCents,
        Document: 'sensitive-document',
        Email: 'sensitive@example.com',
        StatusCode: 3,
        TransactionId: 98_765,
      },
      providerTransactionId: '98765',
      status: 'approved' as const,
      storeId: storedAttempt.storeId,
      verifiedAt: new Date('2026-08-20T20:00:00Z'),
    };
    await expect(
      applyVerifiedPlatformPayment(database, {
        ...verifiedPayment,
        amountCents: storedAttempt.amountCents + 1,
        providerTransactionId: 'mismatch-98765',
      }),
    ).resolves.toMatchObject({ applied: false, reason: 'AMOUNT_MISMATCH' });
    expect(
      (
        await database.subscriptionPaymentAttempt.findUniqueOrThrow({
          where: { id: paymentAttemptId },
        })
      ).status,
    ).toBe(SubscriptionPaymentStatus.PENDING_PROVIDER);

    await expect(
      applyVerifiedPlatformPayment(database, verifiedPayment),
    ).resolves.toMatchObject({ applied: true, duplicate: false });
    await expect(
      applyVerifiedPlatformPayment(database, verifiedPayment),
    ).resolves.toMatchObject({ applied: true, duplicate: true });

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
    expect(events).toHaveLength(2);
    expect(
      events.every(
        (event) => event.source === PaymentProviderEventSource.RECONCILIATION,
      ),
    ).toBe(true);
    expect(JSON.stringify(attempt.providerPayload)).not.toContain(
      'sensitive@example.com',
    );
    expect(JSON.stringify(attempt.providerPayload)).not.toContain(
      'sensitive-document',
    );

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
    await expect(
      applyVerifiedPlatformPayment(database, {
        amountCents: rejectedAttempt.amountCents,
        currencyCode: rejectedAttempt.currencyCode,
        internalReference: rejectedAttempt.internalReference,
        payload: { StatusCode: 2, TransactionId: 98_766 },
        providerTransactionId: '98766',
        status: 'rejected',
        storeId: rejectedAttempt.storeId,
      }),
    ).resolves.toMatchObject({
      applied: false,
      reason: 'PROVIDER_REJECTED',
    });
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
