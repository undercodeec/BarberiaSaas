import { isNetworkOnline, latestDataUpdate } from './query-lifecycle';

describe('ciclo de vida de React Query', () => {
  it('solo considera online una conexión disponible y alcanzable', () => {
    expect(
      isNetworkOnline({ isConnected: true, isInternetReachable: true }),
    ).toBe(true);
    expect(
      isNetworkOnline({ isConnected: true, isInternetReachable: null }),
    ).toBe(true);
    expect(
      isNetworkOnline({ isConnected: null, isInternetReachable: null }),
    ).toBe(true);
    expect(
      isNetworkOnline({ isConnected: true, isInternetReachable: false }),
    ).toBe(false);
    expect(
      isNetworkOnline({ isConnected: false, isInternetReachable: null }),
    ).toBe(false);
  });

  it('obtiene la última actualización disponible en caché', () => {
    expect(
      latestDataUpdate([
        { state: { dataUpdatedAt: 100 } },
        { state: { dataUpdatedAt: 450 } },
        { state: { dataUpdatedAt: 200 } },
      ]),
    ).toBe(450);
  });
});
