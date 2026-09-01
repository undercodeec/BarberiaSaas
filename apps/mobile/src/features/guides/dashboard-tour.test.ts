import { shouldStartDashboardTour } from './dashboard-tour';

describe('shouldStartDashboardTour', () => {
  it('solo inicia para quien puede ver todos los objetivos sin un bloqueo activo', () => {
    expect(
      shouldStartDashboardTour({
        activeGuideId: null,
        canAccessFinancialReports: true,
        firstStepsVisible: true,
        hasBlockingOverlay: false,
      }),
    ).toBe(true);
  });

  it('no reemplaza una guia existente ni deja el tour detenido sin Resumen', () => {
    expect(
      shouldStartDashboardTour({
        activeGuideId: 'add-client',
        canAccessFinancialReports: true,
        firstStepsVisible: true,
        hasBlockingOverlay: false,
      }),
    ).toBe(false);
    expect(
      shouldStartDashboardTour({
        activeGuideId: null,
        canAccessFinancialReports: false,
        firstStepsVisible: true,
        hasBlockingOverlay: false,
      }),
    ).toBe(false);
  });

  it('espera a que se cierren los modales prioritarios', () => {
    expect(
      shouldStartDashboardTour({
        activeGuideId: null,
        canAccessFinancialReports: true,
        firstStepsVisible: true,
        hasBlockingOverlay: true,
      }),
    ).toBe(false);
  });
});
