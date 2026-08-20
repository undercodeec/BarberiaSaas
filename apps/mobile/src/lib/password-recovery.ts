import type { ApiClient, RecoverAccessResponse } from '@barber-saas/api-client';
import {
  recoverAccessSchema,
  resetPasswordSchema,
  type RecoverAccessInput,
  type ResetPasswordInput,
} from '@barber-saas/validation';
import { z } from 'zod';

export const resetPasswordFormSchema = resetPasswordSchema
  .extend({ confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

export type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>;

export function normalizeResetToken(
  token: string | readonly string[] | undefined,
): string {
  const value = Array.isArray(token) ? token[0] : token;
  return typeof value === 'string' ? value.trim() : '';
}

export async function requestPasswordRecovery(
  client: ApiClient,
  input: RecoverAccessInput,
): Promise<RecoverAccessResponse> {
  return client.request<RecoverAccessResponse>('/v1/auth/recover', {
    body: recoverAccessSchema.parse(input),
    method: 'POST',
  });
}

export async function submitNewPassword(
  client: ApiClient,
  input: ResetPasswordInput,
): Promise<void> {
  await client.request<void>('/v1/auth/reset-password', {
    body: resetPasswordSchema.parse(input),
    method: 'POST',
  });
}
