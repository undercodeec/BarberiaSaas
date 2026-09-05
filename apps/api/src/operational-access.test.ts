import { describe, expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';

import { createOperationalAccessLoader } from './operational-access';

function fakeDatabaseWithActiveOwner() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([
      {
        active_organization_locations: [
          {
            id: 'location-1',
            name: 'Centro',
            timezone: 'America/Guayaquil',
          },
        ],
        assigned_location_ids: ['location-1'],
        currency_code: 'USD',
        membership_id: 'membership-1',
        organization_id: 'organization-1',
        role: 'OWNER',
        user_id: 'user-1',
      },
    ]),
  };
}

describe('acceso operacional', () => {
  it('carga la membresía activa una sola vez por solicitud Fastify', async () => {
    const database = fakeDatabaseWithActiveOwner();
    const loadAccess = createOperationalAccessLoader(database as never);
    const request = {} as FastifyRequest;

    const [first, second] = await Promise.all([
      loadAccess(request, 'user-1'),
      loadAccess(request, 'user-1'),
    ]);

    expect(first).toBe(second);
    expect(database.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('no reutiliza acceso entre solicitudes', async () => {
    const database = fakeDatabaseWithActiveOwner();
    const loadAccess = createOperationalAccessLoader(database as never);

    await loadAccess({} as FastifyRequest, 'user-1');
    await loadAccess({} as FastifyRequest, 'user-1');

    expect(database.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
