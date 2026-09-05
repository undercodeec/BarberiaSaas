import {
  inventoryProductsQueryOptions,
  inventoryQueryState,
} from './inventory-queries';

const scope = {
  locationId: 'location-a',
  organizationId: 'organization-a',
  role: 'owner',
  userId: 'user-a',
};

describe('consultas de inventario v2', () => {
  it('no carga movimientos hasta que su pestaña sea visible', () => {
    expect(inventoryQueryState({ session: true, tab: 'products' })).toEqual({
      movementsEnabled: false,
      productsEnabled: true,
    });
  });

  it('crea una petición cursor limitada a una sede', async () => {
    const api = { request: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    const signal = new AbortController().signal;
    await inventoryProductsQueryOptions(api, scope, {
      locationId: 'location-a',
      search: 'cera',
    }).queryFn({ pageParam: 'cursor-1', signal });
    expect(api.request).toHaveBeenCalledWith(
      '/v2/inventory/products?locationId=location-a&limit=50&search=cera&cursor=cursor-1',
      { signal },
    );
  });
});
