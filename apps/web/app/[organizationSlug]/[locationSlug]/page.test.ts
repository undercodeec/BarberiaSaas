import { afterEach, describe, expect, it, vi } from 'vitest';

import PublicBookingPage from './page';

afterEach(() => vi.unstubAllGlobals());

describe('PublicBookingPage', () => {
  it('solicita el catálogo público v2 de la organización y sucursal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await PublicBookingPage({
      params: Promise.resolve({
        locationSlug: 'centro',
        organizationSlug: 'nava',
      }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/v2/public/nava/centro/catalog',
      { next: { revalidate: 60 } },
    );
  });
});
