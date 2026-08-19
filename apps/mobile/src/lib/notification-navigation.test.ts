import {
  createNotificationResponseConsumer,
  notificationDestination,
} from './notification-navigation';

describe('notificationDestination', () => {
  it('mapea tipos conocidos a Agenda e ignora la ruta del payload', () => {
    expect(
      notificationDestination(
        { route: '/settings', type: 'appointment_created' },
        'receptionist',
      ),
    ).toBe('/agenda');
  });

  it('valida y codifica la fecha de la cita', () => {
    expect(
      notificationDestination(
        {
          appointmentStartsAt: '2026-08-19T20:30:00.000Z',
          type: 'rescheduled',
        },
        'barber',
      ),
    ).toBe('/agenda?date=2026-08-19T20%3A30%3A00.000Z');
  });

  it('rechaza tipos desconocidos, datos ausentes y roles no resueltos', () => {
    expect(notificationDestination({ type: 'admin' }, 'owner')).toBeNull();
    expect(notificationDestination({ route: '/settings' }, 'owner')).toBeNull();
    expect(
      notificationDestination({ type: 'appointment_created' }, undefined),
    ).toBeNull();
  });
});

describe('createNotificationResponseConsumer', () => {
  it('consume una respuesta una sola vez y limpia el cold start', async () => {
    const clearLastResponse = jest.fn().mockResolvedValue(undefined);
    const navigate = jest.fn();
    const consume = createNotificationResponseConsumer({
      clearLastResponse,
      navigate,
      role: 'owner',
    });
    const response = {
      data: { type: 'created' },
      id: 'notification-1',
    };

    await expect(consume(response)).resolves.toBe(true);
    await expect(consume(response)).resolves.toBe(false);
    expect(clearLastResponse).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/agenda');
  });
});
