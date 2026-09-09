import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApi } from './app';
import { readConfig } from './config';

const config = readConfig({
  API_HOST: '127.0.0.1',
  API_PORT: '4000',
  APP_ENV: 'local',
  CORS_ORIGIN: 'http://localhost:8081',
  DATABASE_URL: 'postgresql://unused/unused',
  MOBILE_INVITATION_URL: 'barbersaas://accept-invitation',
  MOBILE_RESET_URL: 'barbersaas://reset-password',
});

const apps: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('recordatorios push de agenda', () => {
  it('muestra la hora de la sucursal, no la zona horaria del servidor', async () => {
    const reminderBodies: string[] = [];
    const locationId = 'a52f8454-a6c1-4bde-bd67-4e4e50eddb29';
    const appointmentId = '7d7cf151-a9a6-4881-a2f7-9056be3f66a8';
    const startsAt = new Date(Date.now() + 20 * 60_000);
    const madridTime = new Intl.DateTimeFormat('en-CA', {
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      timeZone: 'Europe/Madrid',
    }).format(startsAt);
    const database = {
      $disconnect: vi.fn().mockResolvedValue(undefined),
      $transaction: async (operation: (transaction: unknown) => Promise<unknown>) =>
        operation({
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          appNotification: {
            create: vi.fn().mockImplementation(async ({ data }) => {
              reminderBodies.push(data.body);
            }),
            findFirst: vi.fn().mockResolvedValue(null),
          },
        }),
      appointment: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: appointmentId,
            organization: { bookingReminderMinutes: 30 },
            startsAt,
          },
        ]),
        findUnique: vi.fn().mockResolvedValue({
          clientName: 'Cliente Madrid',
          id: appointmentId,
          location: { timezone: 'Europe/Madrid' },
          locationId,
          organizationId: 'e20dca7c-eac5-4893-879d-869d44b4d5ee',
          professional: {
            memberLocations: [{ locationId }],
            status: 'ACTIVE',
            user: { fullName: 'Barbero Madrid' },
            userId: '0b08a56a-6676-47e5-854e-1f50ac7f2e4a',
          },
          startsAt,
        }),
      },
      appNotification: { findMany: vi.fn().mockResolvedValue([]) },
      notificationPreference: { findUnique: vi.fn().mockResolvedValue(null) },
    };

    const app = await buildApi({ config, database: database as never });
    apps.push(app);

    await vi.waitFor(() => {
      expect(reminderBodies).toHaveLength(1);
      expect(reminderBodies[0]).toContain(madridTime);
    });
  });

  it('usa los minutos configurados por el negocio para anticipar el recordatorio', async () => {
    const reminderBodies: string[] = [];
    const locationId = 'ef18477f-61d8-479c-abee-97dd4c592496';
    const appointmentId = '4a542f5c-8321-43d4-91ca-4a3a526baeb6';
    const startsAt = new Date(Date.now() + 45 * 60_000);
    const database = {
      $disconnect: vi.fn().mockResolvedValue(undefined),
      $transaction: async (operation: (transaction: unknown) => Promise<unknown>) =>
        operation({
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          appNotification: {
            create: vi.fn().mockImplementation(async ({ data }) => {
              reminderBodies.push(data.body);
            }),
            findFirst: vi.fn().mockResolvedValue(null),
          },
        }),
      appointment: {
        findMany: vi.fn().mockImplementation(async ({ where }) =>
          startsAt <= where.startsAt.lte
            ? [
                {
                  id: appointmentId,
                  organization: { bookingReminderMinutes: 60 },
                  startsAt,
                },
              ]
            : [],
        ),
        findUnique: vi.fn().mockResolvedValue({
          clientName: 'Cliente anticipado',
          id: appointmentId,
          location: { timezone: 'America/Guayaquil' },
          locationId,
          organizationId: 'ebdb0c45-89af-4104-80ed-dfb8dd4ba64f',
          professional: {
            memberLocations: [{ locationId }],
            status: 'ACTIVE',
            user: { fullName: 'Barbero anticipado' },
            userId: '7eab8bc7-b21e-46c6-a92f-1a76ff7b1e64',
          },
          startsAt,
        }),
      },
      appNotification: { findMany: vi.fn().mockResolvedValue([]) },
      notificationPreference: { findUnique: vi.fn().mockResolvedValue(null) },
    };

    const app = await buildApi({ config, database: database as never });
    apps.push(app);

    await vi.waitFor(() => {
      expect(reminderBodies).toHaveLength(1);
    });
  });
});
