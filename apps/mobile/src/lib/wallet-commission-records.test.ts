import { splitCommissionEntries } from './wallet-commission-records';

describe('splitCommissionEntries', () => {
  it('separa las comisiones vigentes de las que pertenecen al historial', () => {
    const entries = [
      { id: 'pending', settlementId: null, status: 'pending' as const },
      { id: 'draft', settlementId: 'settlement-1', status: 'pending' as const },
      { id: 'paid', settlementId: 'settlement-2', status: 'settled' as const },
      { id: 'reversed', settlementId: null, status: 'reversed' as const },
    ];

    expect(splitCommissionEntries(entries)).toEqual({
      historical: [entries[1], entries[2], entries[3]],
      current: [entries[0]],
    });
  });
});
