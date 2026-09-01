import {
  BUSINESS_CATEGORY_PROMPT_SNOOZE_MS,
  EXTRA_QUICK_ACTIONS,
  shouldCelebrateSubscriptionActivation,
  shouldShowBusinessCategoryPrompt,
  shouldShowWelcomeSurvey,
  canUseExtraQuickAction,
} from './dashboard-model';

describe('accesos rápidos del dashboard', () => {
  it('ofrece Sucursales y abre su administración', () => {
    expect(EXTRA_QUICK_ACTIONS).toContainEqual({
      icon: 'business-outline',
      id: 'locations',
      label: 'Sucursales',
      route: '/location-management',
    });
  });
});

describe('restricción de accesos del barbero', () => {
  it('solo permite las herramientas operativas del profesional', () => {
    expect(canUseExtraQuickAction('barber', 'agenda')).toBe(true);
    expect(canUseExtraQuickAction('barber', 'clients')).toBe(true);
    expect(canUseExtraQuickAction('barber', 'notifications')).toBe(true);
    expect(canUseExtraQuickAction('barber', 'cash-register')).toBe(false);
    expect(canUseExtraQuickAction('barber', 'collaborators')).toBe(false);
    expect(canUseExtraQuickAction('barber', 'booking-settings')).toBe(false);
    expect(canUseExtraQuickAction('barber', 'locations')).toBe(false);
    expect(canUseExtraQuickAction('barber', 'reviews-management')).toBe(false);
  });
});

describe('celebración de suscripción', () => {
  it('celebra cuando un plan de pago pasa a estar activo', () => {
    expect(
      shouldCelebrateSubscriptionActivation(
        { planCode: 'free', status: 'free' },
        { planCode: 'essential', status: 'active' },
      ),
    ).toBe(true);
  });

  it('no celebra al hidratar por primera vez una suscripción ya activa', () => {
    expect(
      shouldCelebrateSubscriptionActivation(null, {
        planCode: 'local',
        status: 'active',
      }),
    ).toBe(false);
  });

  it('no vuelve a celebrar una renovación del mismo plan activo', () => {
    expect(
      shouldCelebrateSubscriptionActivation(
        { planCode: 'essential', status: 'active' },
        { planCode: 'essential', status: 'active' },
      ),
    ).toBe(false);
  });
});

describe('encuesta de bienvenida', () => {
  it('solo se muestra cuando la API confirma que no existe respuesta', () => {
    expect(shouldShowWelcomeSurvey({ response: null })).toBe(true);
    expect(
      shouldShowWelcomeSurvey({
        response: {
          selectedOptions: ['Buscador'],
          submittedAt: '2026-08-28T00:00:00.000Z',
        },
      }),
    ).toBe(false);
  });
});

describe('recordatorio de categoría del negocio', () => {
  it('se muestra al no existir un descarte previo', () => {
    expect(shouldShowBusinessCategoryPrompt(null, 1_000)).toBe(true);
  });

  it('respeta el descarte durante catorce días y luego lo vuelve a mostrar', () => {
    const dismissedAt = 1_000;
    expect(
      shouldShowBusinessCategoryPrompt(
        dismissedAt,
        dismissedAt + BUSINESS_CATEGORY_PROMPT_SNOOZE_MS - 1,
      ),
    ).toBe(false);
    expect(
      shouldShowBusinessCategoryPrompt(
        dismissedAt,
        dismissedAt + BUSINESS_CATEGORY_PROMPT_SNOOZE_MS,
      ),
    ).toBe(true);
  });
});
