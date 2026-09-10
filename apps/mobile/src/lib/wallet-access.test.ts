import { walletAccessForRole } from './wallet-access';

describe('walletAccessForRole', () => {
  it('muestra al barbero un resumen e historial de sus comisiones, no de caja', () => {
    expect(walletAccessForRole('barber')).toEqual({
      canReadCash: false,
      historySource: 'commissions',
      summarySource: 'commissions',
    });
  });

  it('conserva el resumen e historial de caja para quien puede leerla', () => {
    expect(walletAccessForRole('manager')).toEqual({
      canReadCash: true,
      historySource: 'cash',
      summarySource: 'cash',
    });
  });
});
