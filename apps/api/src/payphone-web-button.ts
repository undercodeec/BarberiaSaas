import { z } from 'zod';

import { ApiError } from './errors';

const PAYPHONE_BUTTON_PREPARE_URL =
  'https://pay.payphonetodoesposible.com/api/button/Prepare';
const PAYPHONE_BUTTON_CONFIRM_URL =
  'https://pay.payphonetodoesposible.com/api/button/V2/Confirm';

const prepareResponseSchema = z.object({
paymentId: z
  .union([
    z.string().trim().min(1),
    z.number().int().positive(),
  ])
  .transform(String)
  .optional(),  payWithCard: z.string().url().optional(),
  payWithPayPhone: z.string().url().optional(),
});

const confirmResponseSchema = z.object({
  amount: z.coerce.number().int().positive(),
  clientTransactionId: z.string().trim().min(1).max(15),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  statusCode: z.coerce.number().int(),
  transactionId: z.union([z.string(), z.number().int()]).transform(String),
  transactionStatus: z.string().trim().min(1).max(80),
});

export interface PayphoneWebButtonConfirmation {
  readonly amountCents: number;
  readonly clientTransactionId: string;
  readonly currencyCode: string;
  readonly payload: unknown;
  readonly providerTransactionId: string;
  readonly status: 'approved' | 'rejected';
}

function authorizationHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiError(
      502,
      'PAYPHONE_INVALID_RESPONSE',
      'PayPhone devolvió una respuesta inválida.',
    );
  }
}

function paymentUrl(value: string | undefined): string {
  if (!value)
    throw new ApiError(
      502,
      'PAYPHONE_PREPARE_INVALID_RESPONSE',
      'PayPhone no devolvió una URL de pago.',
    );
  try {
    if (new URL(value).protocol !== 'https:') throw new Error('not https');
  } catch {
    throw new ApiError(
      502,
      'PAYPHONE_PREPARE_INVALID_RESPONSE',
      'PayPhone devolvió una URL de pago inválida.',
    );
  }
  return value;
}

export async function preparePayphoneWebButton(input: {
  readonly amountCents: number;
  readonly cancellationUrl: string;
  readonly clientTransactionId: string;
  readonly currencyCode: string;
  readonly reference: string;
  readonly responseUrl: string;
  readonly storeId: string;
  readonly token: string;
}) {
  const amountWithTax = 0;
  const amountWithoutTax = input.amountCents;
  const service = 0;
  const tax = 0;
  const tip = 0;
  const amount = amountWithoutTax + amountWithTax + tax + service + tip;
  if (amount !== input.amountCents)
    throw new ApiError(
      500,
      'PAYPHONE_AMOUNT_BREAKDOWN_INVALID',
      'La configuración del importe de suscripción no es válida.',
    );

  let response: Response;
  try {
    response = await fetch(PAYPHONE_BUTTON_PREPARE_URL, {
      body: JSON.stringify({
        amount,
        amountWithTax,
        amountWithoutTax,
        cancellationUrl: input.cancellationUrl,
        clientTransactionId: input.clientTransactionId,
        currency: input.currencyCode,
        reference: input.reference,
        responseUrl: input.responseUrl,
        service,
        storeId: input.storeId,
        tax,
        tip,
      }),
      headers: authorizationHeaders(input.token),
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(
      502,
      'PAYPHONE_PREPARE_UNAVAILABLE',
      'No fue posible preparar el pago con PayPhone.',
    );
  }
  const payload = await responseJson(response);
  if (!response.ok)
    throw new ApiError(
      502,
      'PAYPHONE_PREPARE_REJECTED',
      'PayPhone rechazó la preparación del pago.',
    );
  const parsed = prepareResponseSchema.safeParse(payload);
  if (!parsed.success)
    throw new ApiError(
      502,
      'PAYPHONE_PREPARE_INVALID_RESPONSE',
      'PayPhone devolvió una preparación de pago inválida.',
    );
  return {
    paymentUrl: paymentUrl(
      parsed.data.payWithCard ?? parsed.data.payWithPayPhone,
    ),
    providerPayload: {
      paymentId: parsed.data.paymentId ?? null,
    },
  };
}

export async function confirmPayphoneWebButton(input: {
  readonly clientTransactionId: string;
  readonly providerTransactionId: string;
  readonly token: string;
}): Promise<PayphoneWebButtonConfirmation> {
  let response: Response;
  try {
    response = await fetch(PAYPHONE_BUTTON_CONFIRM_URL, {
      body: JSON.stringify({
        clientTxId: input.clientTransactionId,
        id: Number(input.providerTransactionId),
      }),
      headers: authorizationHeaders(input.token),
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(
      502,
      'PAYPHONE_CONFIRM_UNAVAILABLE',
      'No pudimos confirmar el pago con PayPhone. Inténtalo nuevamente.',
    );
  }
  const payload = await responseJson(response);
  if (!response.ok)
    throw new ApiError(
      502,
      'PAYPHONE_CONFIRM_REJECTED',
      'PayPhone no pudo confirmar la transacción.',
    );
  const parsed = confirmResponseSchema.safeParse(payload);
  if (!parsed.success)
    throw new ApiError(
      502,
      'PAYPHONE_CONFIRM_INVALID_RESPONSE',
      'PayPhone devolvió una confirmación inválida.',
    );
  if (parsed.data.clientTransactionId !== input.clientTransactionId)
    throw new ApiError(
      409,
      'PAYPHONE_CONFIRM_REFERENCE_MISMATCH',
      'PayPhone devolvió una referencia que no corresponde al pago.',
    );
  if (parsed.data.transactionId !== input.providerTransactionId)
    throw new ApiError(
      409,
      'PAYPHONE_CONFIRM_TRANSACTION_MISMATCH',
      'PayPhone devolvió una transacción que no corresponde al pago.',
    );
  return {
    amountCents: parsed.data.amount,
    clientTransactionId: parsed.data.clientTransactionId,
    currencyCode: parsed.data.currency,
    payload,
    providerTransactionId: parsed.data.transactionId,
    status:
      parsed.data.statusCode === 3 &&
      parsed.data.transactionStatus.toLowerCase() === 'approved'
        ? 'approved'
        : 'rejected',
  };
}
