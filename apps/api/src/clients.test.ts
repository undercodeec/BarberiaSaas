import {
  AppointmentPaymentStatus,
  AppointmentSource,
  AppointmentStatus,
  MembershipRole,
} from '@barber-saas/database';
import { describe, expect, it } from 'vitest';

import { publicAppointment } from './agenda';
import { clientScope, maskClientPhone } from './clients';

describe('protección de contacto de clientes', () => {
  it('conserva solo los últimos cuatro caracteres del teléfono', () => {
    expect(maskClientPhone('+593991234567')).toBe('*********4567');
    expect(maskClientPhone(null)).toBeNull();
  });

  it('no entrega correo ni teléfono completo en una cita restringida', () => {
    const appointment = publicAppointment(
      {
        clientEmail: 'cliente@example.com',
        clientName: 'Cliente',
        clientPhone: '+593991234567',
        endsAt: new Date('2026-08-26T16:30:00.000Z'),
        id: 'appointment-id',
        locationId: 'location-id',
        notes: null,
        paymentStatus: AppointmentPaymentStatus.PENDING,
        professionalMembershipId: 'membership-id',
        source: AppointmentSource.MANUAL,
        startsAt: new Date('2026-08-26T16:00:00.000Z'),
        status: AppointmentStatus.SCHEDULED,
      },
      false,
    );

    expect(appointment.clientEmail).toBeNull();
    expect(appointment.clientPhone).toBe('*********4567');
    expect(JSON.stringify(appointment)).not.toContain('cliente@example.com');
    expect(JSON.stringify(appointment)).not.toContain('+593991234567');
  });

  it('limita recepción por sucursal y al barbero por citas propias', () => {
    const base = {
      locationIds: ['location-a'],
      membershipId: 'membership-a',
      organizationId: 'organization-a',
      userId: 'user-a',
    };

    expect(
      clientScope({ ...base, role: MembershipRole.RECEPTIONIST }),
    ).toMatchObject({
      appointments: {
        some: { locationId: { in: ['location-a'] } },
      },
      organizationId: 'organization-a',
    });
    expect(clientScope({ ...base, role: MembershipRole.BARBER })).toMatchObject(
      {
        appointments: {
          some: { professionalMembershipId: 'membership-a' },
        },
        organizationId: 'organization-a',
      },
    );
    expect(clientScope({ ...base, role: MembershipRole.MANAGER })).toEqual({
      deletedAt: null,
      organizationId: 'organization-a',
    });
  });
});
