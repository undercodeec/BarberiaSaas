'use client';

import { useEffect, useState } from 'react';

type PlanCode = 'free' | 'essential' | 'local' | 'multi';

interface PlanFromApi {
  readonly code: PlanCode;
  readonly currencyCode: string;
  readonly monthlyPriceCents: number | null;
  readonly name: string;
}

const planContent: ReadonlyArray<{
  readonly code: PlanCode;
  readonly description: string;
  readonly features: readonly string[];
}> = [
  {
    code: 'free',
    description: 'Para conocer Nava y organizar lo esencial.',
    features: ['1 profesional', '1 sucursal', '25 reservas cada 30 días'],
  },
  {
    code: 'essential',
    description: 'Para una operación individual que quiere avanzar.',
    features: [
      '1 profesional',
      'Clientes y reservas ilimitados',
      'Caja y reportes',
    ],
  },
  {
    code: 'local',
    description: 'Para una barbería completa en una sede.',
    features: [
      'Profesionales ilimitados',
      'Caja, POS e inventario',
      'Comisiones y reportes',
    ],
  },
  {
    code: 'multi',
    description: 'Para negocios que manejan más de una sede.',
    features: [
      'Múltiples sucursales',
      'Operación por sede',
      'Visión conectada del negocio',
    ],
  },
];

function displayPrice(plan: PlanFromApi | undefined) {
  if (!plan || plan.monthlyPriceCents === null) return 'Consultando…';
  return new Intl.NumberFormat('es-EC', {
    currency: plan.currencyCode,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(plan.monthlyPriceCents / 100);
}

export function PricingCards() {
  const [plans, setPlans] = useState<readonly PlanFromApi[]>([]);

  useEffect(() => {
    void fetch('/api/checkout/plans', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudieron cargar los planes.');
        return (await response.json()) as {
          readonly plans: readonly PlanFromApi[];
        };
      })
      .then(({ plans: result }) => setPlans(result))
      .catch(() => setPlans([]));
  }, []);

  return (
    <div className="plans-grid">
      {planContent.map(({ code, description, features }) => {
        const plan = plans.find((candidate) => candidate.code === code);
        const name =
          plan?.name ??
          `Nava ${code === 'free' ? 'Free' : code === 'essential' ? 'Esencial' : code === 'local' ? 'Local' : 'Multi'}`;
        return (
          <article className={code === 'local' ? 'recommended' : ''} key={code}>
            {code === 'local' ? (
              <b className="recommendation">RECOMENDADO</b>
            ) : null}
            <h3>{name}</h3>
            <p>{description}</p>
            <strong>
              {displayPrice(plan)}
              <small>{plan ? '/ mes' : ''}</small>
            </strong>
            {code === 'local' ? (
              <em>
                Precio fundador disponible para una suscripción continua.*
              </em>
            ) : null}
            <ul>
              {features.map((feature) => (
                <li key={feature}>✓ {feature}</li>
              ))}
            </ul>
            <a href="mailto:soporte@navacloud.app?subject=Quiero%20probar%20Nava">
              Comenzar <span>→</span>
            </a>
          </article>
        );
      })}
    </div>
  );
}
