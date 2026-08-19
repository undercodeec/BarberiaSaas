export interface NetworkStateLike {
  readonly isConnected: boolean | null;
  readonly isInternetReachable: boolean | null;
}

export function isNetworkOnline(state: NetworkStateLike): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

export function latestDataUpdate(
  queries: readonly { readonly state: { readonly dataUpdatedAt: number } }[],
): number {
  return queries.reduce(
    (latest, query) => Math.max(latest, query.state.dataUpdatedAt),
    0,
  );
}
