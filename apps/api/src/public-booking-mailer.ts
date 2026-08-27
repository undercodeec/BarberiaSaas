import nodemailer from 'nodemailer';

import type { ApiConfig } from './config';
import { ApiError } from './errors';
import type { PublicBookingMailer } from './public-booking';

function formatAppointmentDate(startsAt: Date, timeZone: string) {
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone,
  }).format(startsAt);
}

export function createPublicBookingMailer(
  config: ApiConfig,
): PublicBookingMailer | null {
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
  const send = async (message: {
    subject: string;
    text: string;
    to: string;
  }) => {
    try {
      await transporter.sendMail({ ...message, from: config.SMTP_FROM });
    } catch {
      throw new ApiError(
        503,
        'BOOKING_EMAIL_UNAVAILABLE',
        'No pudimos enviar el correo de la reserva. Inténtalo nuevamente.',
      );
    }
  };
  return {
    sendCancellation(message) {
      return send({
        subject: `Cita cancelada en ${message.organizationName}`,
        text: [
          'Tu cita fue cancelada.',
          '',
          `${message.professionalName} · ${formatAppointmentDate(
            message.startsAt,
            message.timeZone,
          )}`,
          '',
          `Consulta los detalles: ${message.manageUrl}`,
        ].join('\n'),
        to: message.email,
      });
    },
    sendConfirmation(message) {
      return send({
        subject: `Cita confirmada en ${message.organizationName}`,
        text: [
          'Tu cita está confirmada.',
          '',
          `${message.professionalName} · ${formatAppointmentDate(
            message.startsAt,
            message.timeZone,
          )}`,
          '',
          'Conserva este enlace privado para confirmar asistencia, reprogramar o cancelar:',
          message.manageUrl,
        ].join('\n'),
        to: message.email,
      });
    },
    sendReviewRequest(message) {
      return send({
        subject: `¿Cómo fue tu cita en ${message.organizationName}?`,
        text: [
          'Gracias por visitarnos.',
          '',
          `${message.professionalName} · ${formatAppointmentDate(
            message.startsAt,
            message.timeZone,
          )}`,
          '',
          'Tu opinión ayuda a otros clientes. Califica tu experiencia desde este enlace privado:',
          message.manageUrl,
        ].join('\n'),
        to: message.email,
      });
    },
    sendReminder(message) {
      return send({
        subject: `Confirma tu asistencia a ${message.organizationName}`,
        text: [
          'Tu cita se aproxima.',
          '',
          `${message.professionalName} · ${formatAppointmentDate(
            message.startsAt,
            message.timeZone,
          )}`,
          '',
          'Confirma tu asistencia o gestiona la cita desde tu enlace privado:',
          message.manageUrl,
        ].join('\n'),
        to: message.email,
      });
    },
    sendVerification({ code, email, organizationName }) {
      return send({
        subject: `Verifica tu reserva en ${organizationName}`,
        text: [
          'Tu código para confirmar la reserva es:',
          '',
          code,
          '',
          'El código vence en 10 minutos. Si no lo ingresas, el horario volverá a quedar disponible.',
        ].join('\n'),
        to: email,
      });
    },
  };
}
