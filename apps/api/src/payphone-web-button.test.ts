import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  confirmPayphoneWebButton,
  PayphonePrepareRejectedError,
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
    expect(JSON.parse(String(request.body))).toEqual({
      amount: 1993,
      amountWithTax: 0,
      amountWithoutTax: 1993,
      cancellationUrl: 'https://navacloud.app/checkout/payphone/cancel',
      clientTransactionId: 'N12345678901234',
      currency: 'USD',
      reference: 'Suscripción Nava Local',
      responseUrl: 'https://navacloud.app/checkout/payphone/confirm',
      service: 0,
      storeId: 'store-test',
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

  it('conserva diagnóstico saneado cuando PayPhone rechaza Prepare', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            errorCode: 1001,
            errors: [
              {
                code: 'INVALID_REFERENCE',
                field: 'reference',
                message: 'La referencia no es válida.',
                rejectedValue: 'no debe registrarse',
              },
            ],
            message:
              'Esta solicitud no cumple los parámetros necesarios: store-sensitive / secret-not-logged.',
            token: 'no debe registrarse',
          }),
          { status: 400 },
        ),
      ),
    );

    let rejected: unknown;
    try {
      await preparePayphoneWebButton({
        amountCents: 200,
        cancellationUrl: 'https://navacloud.app/checkout/payphone/cancel',
        clientTransactionId: 'NAVA200428',
        currencyCode: 'USD',
        reference: 'Prueba Nava',
        responseUrl: 'https://navacloud.app/checkout/payphone/confirm',
        storeId: 'store-sensitive',
        token: 'secret-not-logged',
      });
    } catch (error) {
      rejected = error;
    }

    expect(rejected).toBeInstanceOf(PayphonePrepareRejectedError);
    expect(rejected).toMatchObject({
      code: 'PAYPHONE_PREPARE_REJECTED',
      diagnostics: {
        amountCents: 200,
        cancellationUrlHostname: 'navacloud.app',
        clientTransactionIdLength: 10,
        currencyCode: 'USD',
        errorCode: 1001,
        message:
          'Esta solicitud no cumple los parámetros necesarios: [redacted] / [redacted].',
        responseUrlHostname: 'navacloud.app',
        statusCode: 400,
        validationErrors: [
          {
            code: 'INVALID_REFERENCE',
            field: 'reference',
            message: 'La referencia no es válida.',
          },
        ],
      },
    });
    expect(JSON.stringify(rejected)).not.toContain('secret-not-logged');
    expect(JSON.stringify(rejected)).not.toContain('store-sensitive');
    expect(JSON.stringify(rejected)).not.toContain('no debe registrarse');
  });

  it('acepta paymentId string y usa payWithPayPhone si no hay tarjeta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            payWithPayPhone:
              'https://pay.payphonetodoesposible.com/PayPhone/Index?paymentId=abc',
            paymentId: 'abc',
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      preparePayphoneWebButton({
        amountCents: 200,
        cancellationUrl: 'https://navacloud.app/checkout/payphone/cancel',
        clientTransactionId: 'NAVA200428',
        currencyCode: 'USD',
        reference: 'Prueba Nava',
        responseUrl: 'https://navacloud.app/checkout/payphone/confirm',
        storeId: 'store-test',
        token: 'secret-not-logged',
      }),
    ).resolves.toEqual({
      paymentUrl:
        'https://pay.payphonetodoesposible.com/PayPhone/Index?paymentId=abc',
      providerPayload: { paymentId: 'abc' },
    });
  });
});
