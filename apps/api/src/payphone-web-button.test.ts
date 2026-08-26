import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  confirmPayphoneWebButton,
  preparePayphoneWebButton,
} from './payphone-web-button';

afterEach(() => vi.unstubAllGlobals());

describe('PayPhone Botón WEB', () => {
  it('prepara un cobro sin impuestos con importes consistentes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          payWithCard: 'https://pay.payphonetodoesposible.com/card/123',
          paymentId: 123,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await preparePayphoneWebButton({
      amountCents: 1993,
      cancellationUrl: 'https://navacloud.app/checkout/payphone/cancel',
      clientTransactionId: 'N12345678901234',
      currencyCode: 'USD',
      reference: 'Suscripción Nava Local',
      responseUrl: 'https://navacloud.app/checkout/payphone/confirm',
      storeId: 'store-test',
      token: 'secret-not-logged',
    });

    expect(result.paymentUrl).toBe(
      'https://pay.payphonetodoesposible.com/card/123',
    );
    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      amount: 1993,
      amountWithTax: 0,
      amountWithoutTax: 1993,
      service: 0,
      tax: 0,
      tip: 0,
    });
    expect(request.headers).toMatchObject({
      authorization: 'Bearer secret-not-logged',
    });
  });

  it('acepta únicamente la confirmación oficial correspondiente', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            amount: 1993,
            clientTransactionId: 'N12345678901234',
            currency: 'USD',
            statusCode: 3,
            transactionId: 445566,
            transactionStatus: 'Approved',
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      confirmPayphoneWebButton({
        clientTransactionId: 'N12345678901234',
        providerTransactionId: '445566',
        token: 'secret-not-logged',
      }),
    ).resolves.toMatchObject({
      amountCents: 1993,
      currencyCode: 'USD',
      providerTransactionId: '445566',
      status: 'approved',
    });
  });
});
