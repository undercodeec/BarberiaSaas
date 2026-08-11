import { OnlinePaymentStatus } from '@barber-saas/database';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiConfig } from './config';
import { createPayphonePaymentLink } from './payphone-payments';
import { encryptPaymentCredential } from './security';

const organizationId = 'f025f4bd-e0dd-4b20-92a3-aa1158848c04';
const appointmentId = 'e5cf4e5b-cbe8-40b5-aec9-aed5f3a201a8';
const encryptionKey = Buffer.alloc(32, 7).toString('base64');

function databaseForLink() {
  const attempt = {
    amountCents: 1_250,
    clientTransactionId: 'NAbcdefghijklm',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    id: 'a31e6d7e-8a0e-4a38-8c41-f7db8718b8e1',
  };
  return {
    appointment: {
      findUnique: vi.fn().mockResolvedValue({
        id: appointmentId,
        locationId: '5083ccf2-d7fc-496a-99ca-f2d2d4189f90',
        organizationId,
        paymentStatus: 'PENDING',
        services: [{ priceCents: 1_250 }],
        status: 'CONFIRMED',
      }),
    },
    payphoneConfiguration: {
      findUnique: vi.fn().mockResolvedValue({
        connectionStatus: 'CONNECTED',
        encryptedToken: encryptPaymentCredential({
          encodedKey: encryptionKey,
          organizationId,
          secret: 'secret-token',
        }),
        isEnabled: true,
        storeId: 'store-123',
      }),
    },
    paymentAttempt: {
      create: vi.fn().mockResolvedValue(attempt),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...attempt, ...data }),
        ),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

const config = {
  PAYPHONE_CREDENTIALS_ENCRYPTION_KEY: encryptionKey,
} as ApiConfig;

afterEach(() => vi.unstubAllGlobals());

describe('API Link PayPhone', () => {
  it('envía el importe de la cita en centavos y vence en una hora', async () => {
    const database = databaseForLink();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('"https://pay.payphonetodoesposible.com/link/test"', {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createPayphonePaymentLink(
      database as never,
      config,
      appointmentId,
    );

    expect(result.status).toBe('pending_verification');
    expect(result.paymentUrl).toContain('https://');
    expect(database.paymentAttempt.create).toHaveBeenCalledOnce();
    expect(database.paymentAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: OnlinePaymentStatus.EXPIRED },
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      amount: 1_250,
      amountWithoutTax: 1_250,
      currency: 'USD',
      expireIn: 1,
      isAmountEditable: false,
      oneTime: true,
      storeId: 'store-123',
    });
  });

  it('reutiliza un enlace pendiente vigente sin crear otro', async () => {
    const database = databaseForLink();
    database.paymentAttempt.findFirst.mockResolvedValue({
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      paymentUrl: 'https://pay.payphonetodoesposible.com/link/existente',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await createPayphonePaymentLink(
      database as never,
      config,
      appointmentId,
    );

    expect(result.status).toBe('pending_verification');
    expect(database.paymentAttempt.create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
