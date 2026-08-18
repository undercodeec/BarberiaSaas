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

export interface InvitationMessage {
  readonly email: string;
  readonly invitationUrl: string;
  readonly invitedBy: string;
  readonly organizationName: string;
}

export interface InvitationMailer {
  send(message: InvitationMessage): Promise<void>;
}

export interface VerificationMessage {
  readonly code: string;
  readonly email: string;
}

export interface VerificationMailer {
  send(message: VerificationMessage): Promise<void>;
}

export interface PlatformAccessMessage {
  readonly code: string;
  readonly email: string;
}

export interface PlatformAccessMailer {
  send(message: PlatformAccessMessage): Promise<void>;
}

function createTransporter(config: ApiConfig) {
  if (!config.SMTP_HOST || !config.SMTP_FROM) return null;

  return nodemailer.createTransport({
    auth:
      config.SMTP_USER && config.SMTP_PASSWORD
        ? { pass: config.SMTP_PASSWORD, user: config.SMTP_USER }
        : undefined,
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE === 'true',
  });
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    '&': '&amp;',
    "'": '&#39;',
    '"': '&quot;',
    '<': '&lt;',
    '>': '&gt;',
  };
  return value.replace(
    /[&<>'"]/g,
    (character) => entities[character] ?? character,
  );
}

export function createRecoveryMailer(config: ApiConfig): RecoveryMailer | null {
  const transporter = createTransporter(config);
  if (!transporter || !config.SMTP_FROM) return null;

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

export function createInvitationMailer(
  config: ApiConfig,
): InvitationMailer | null {
  const transporter = createTransporter(config);
  if (!transporter || !config.SMTP_FROM) return null;

  return {
    async send({ email, invitationUrl, invitedBy, organizationName }) {
      try {
        await transporter.sendMail({
          from: config.SMTP_FROM,
          html: [
            `<p>${escapeHtml(invitedBy)} te invitó a formar parte del equipo de ${escapeHtml(organizationName)}.</p>`,
            '<p>Abre el siguiente enlace para crear tu cuenta o iniciar sesión con el mismo correo y aceptar la invitación:</p>',
            `<p><a href="${escapeHtml(invitationUrl)}">Abrir invitación en Nava</a></p>`,
            '<p>La invitación vence en 7 días. Hasta aceptarla no podrás acceder ni operar dentro del equipo.</p>',
          ].join(''),
          subject: `Invitación al equipo de ${organizationName}`,
          text: [
            `${invitedBy} te invitó a formar parte del equipo de ${organizationName}.`,
            '',
            'Crea tu cuenta o inicia sesión con este mismo correo y abre el siguiente enlace para aceptar la invitación:',
            invitationUrl,
            '',
            'La invitación vence en 7 días. Hasta aceptarla no podrás acceder ni operar dentro del equipo.',
          ].join('\n'),
          to: email,
        });
      } catch {
        throw new ApiError(
          503,
          'INVITATION_DELIVERY_UNAVAILABLE',
          'El perfil fue creado, pero no fue posible enviar la invitación. Reintenta el envío.',
        );
      }
    },
  };
}

export function createVerificationMailer(
  config: ApiConfig,
): VerificationMailer | null {
  const transporter = createTransporter(config);
  if (!transporter || !config.SMTP_FROM) return null;

  return {
    async send({ code, email }) {
      try {
        await transporter.sendMail({
          from: config.SMTP_FROM,
          subject: 'Verifica tu cuenta de Nava',
          text: [
            'Tu código de verificación de Nava es:',
            '',
            code,
            '',
            'El código vence en 10 minutos y solo puede utilizarse una vez.',
            'Si no creaste esta cuenta, ignora este mensaje.',
          ].join('\n'),
          to: email,
        });
      } catch {
        throw new ApiError(
          503,
          'VERIFICATION_DELIVERY_UNAVAILABLE',
          'No fue posible enviar el código de verificación. Inténtalo nuevamente.',
        );
      }
    },
  };
}

export function createPlatformAccessMailer(
  config: ApiConfig,
): PlatformAccessMailer | null {
  const transporter = createTransporter(config);
  if (!transporter || !config.SMTP_FROM) return null;

  return {
    async send({ code, email }) {
      try {
        await transporter.sendMail({
          from: config.SMTP_FROM,
          subject: 'Código de acceso al panel de Nava',
          text: [
            'Tu código de acceso al panel interno de Nava es:',
            '',
            code,
            '',
            'El código vence en 5 minutos y solo puede utilizarse una vez.',
            'Si no intentaste acceder al panel, ignora este mensaje.',
          ].join('\n'),
          to: email,
        });
      } catch {
        throw new ApiError(
          503,
          'PLATFORM_ACCESS_DELIVERY_UNAVAILABLE',
          'No fue posible enviar el código de acceso. Inténtalo nuevamente.',
        );
      }
    },
  };
}
