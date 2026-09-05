import {
  chunkContacts,
  clientPageQueryOptions,
  flattenClientPages,
} from './client-queries';

const scope = {
  locationId: 'location-a',
  organizationId: 'organization-a',
  role: 'owner',
  userId: 'user-a',
};

function client(id: string) {
  return {
    addressLine: null,
    birthDate: null,
    documentNumber: null,
    email: null,
    fullName: id,
    id,
    labels: [],
    lastName: null,
    notes: null,
    phone: null,
  };
}

describe('consultas paginadas de clientes', () => {
  it('solicita una página y reenvía la cancelación', async () => {
    const api = {
      request: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };
    const signal = new AbortController().signal;
    const options = clientPageQueryOptions(api, scope, { search: 'Ana' });

    await options.queryFn({ pageParam: null, signal });

    expect(api.request).toHaveBeenCalledWith(
      '/v2/clients?limit=50&search=Ana',
      {
        signal,
      },
    );
    expect(options.getNextPageParam({ items: [], nextCursor: 'next' })).toBe(
      'next',
    );
  });

  it('divide 205 contactos en lotes de máximo 100', () => {
    expect(
      chunkContacts(Array.from({ length: 205 }), 100).map(
        (part) => part.length,
      ),
    ).toEqual([100, 100, 5]);
  });

  it('aplana páginas sin perder el orden', () => {
    expect(
      flattenClientPages({
        pages: [
          { items: [client('first')], nextCursor: 'second' },
          { items: [client('second')], nextCursor: null },
        ],
      }),
    ).toEqual([client('first'), client('second')]);
  });
});
