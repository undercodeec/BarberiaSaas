import nodemailer from 'nodemailer';

import type { ApiConfig } from './config';
import { ApiError } from './errors';

export interface RecoveryMessage {
  readonly email: string;
  readonly resetUrl: string;
}

export interface RecoveryMailer {
  send(message: RecoveryMessage): Promise<void>;
}

export function createRecoveryMailer(config: ApiConfig): RecoveryMailer | null {
  if (!config.SMTP_HOST || !config.SMTP_FROM) return null;

  const transporter = nodemailer.createTransport({
    auth:
      config.SMTP_USER && config.SMTP_PASSWORD
        ? { pass: config.SMTP_PASSWORD, user: config.SMTP_USER }
        : undefined,
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE === 'true',
  });

  return {
    async send({ email, resetUrl }) {
      try {
        await transporter.sendMail({
          from: config.SMTP_FROM,
          subject: 'Recupera el acceso a tu cuenta',
          text: `Abre este enlace para crear una nueva contraseña: ${resetUrl}\n\nEl enlace vence en 30 minutos.`,
          to: email,
        });
      } catch {
        throw new ApiError(
          503,
          'RECOVERY_DELIVERY_UNAVAILABLE',
          'No fue posible enviar el correo de recuperación. Inténtalo nuevamente.',
        );
      }
    },
  };
}
