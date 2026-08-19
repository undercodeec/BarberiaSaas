interface TenantCacheController {
  readonly cancelQueries: () => Promise<void>;
  readonly clear: () => void;
}

export async function runTenantTransition<TResult>(
  cache: TenantCacheController,
  transition: () => Promise<TResult>,
): Promise<TResult> {
  await cache.cancelQueries();
  cache.clear();
  try {
    return await transition();
  } finally {
    cache.clear();
  }
}
