interface CommissionEntry {
  readonly settlementId: string | null;
  readonly status: 'approved' | 'pending' | 'reversed' | 'settled';
}

export function splitCommissionEntries<T extends CommissionEntry>(
  entries: readonly T[],
): { readonly current: readonly T[]; readonly historical: readonly T[] } {
  return entries.reduce<{ current: T[]; historical: T[] }>(
    (result, entry) => {
      if (entry.status === 'pending' && entry.settlementId === null) {
        result.current.push(entry);
      } else {
        result.historical.push(entry);
      }
      return result;
    },
    { current: [], historical: [] },
  );
}
