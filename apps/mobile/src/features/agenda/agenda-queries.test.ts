import {
  agendaPageQueryOptions,
  calendarSummaryQueryOptions,
} from './agenda-queries';

const scope = {
  locationId: 'location-a',
  organizationId: 'organization-a',
  role: 'owner',
  userId: 'user-a',
};

describe('consultas v2 de agenda', () => {
  it('usa una solicitud para todas las sedes seleccionadas', async () => {
    const api = {
      request: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };
    const options = agendaPageQueryOptions(api, scope, {
      from: '2026-09-01',
      locationIds: ['a', 'b', 'c'],
      to: '2026-09-07',
    });
    const signal = new AbortController().signal;

    await options.queryFn({ pageParam: null, signal });

    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request).toHaveBeenCalledWith(
      expect.stringContaining('locationIds=a%2Cb%2Cc'),
      { signal },
    );
  });

  it('solo habilita el resumen mensual cuando la vista lo solicita', () => {
    const api = { request: jest.fn() };
    expect(
      calendarSummaryQueryOptions(
        api,
        scope,
        { from: '2026-09-01', locationIds: ['a'], to: '2026-09-30' },
        false,
      ).enabled,
    ).toBe(false);
  });
});
