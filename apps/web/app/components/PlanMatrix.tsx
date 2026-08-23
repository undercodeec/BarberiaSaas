'use client';

import { useEffect, useState } from 'react';

interface Plan { readonly code: string; readonly currencyCode: string; readonly monthlyPriceCents: number | null; readonly name: string; }

const summaries: Record<string, string> = {
  essential: 'Operación individual',
  free: 'Conoce Nava',
  local: 'Barbería completa',
  multi: 'Más de una sede',
};

function price(plan: Plan | undefined) {
  if (!plan || plan.monthlyPriceCents === null) return 'Consultando';
  return new Intl.NumberFormat('es-EC', { currency: plan.currencyCode, minimumFractionDigits: 2, style: 'currency' }).format(plan.monthlyPriceCents / 100);
}

export function PlanMatrix() {
  const [plans, setPlans] = useState<readonly Plan[]>([]);
  useEffect(() => {
    void fetch('/api/checkout/plans', { cache: 'no-store' })
      .then(async (response) => response.ok ? (await response.json()) as { plans: readonly Plan[] } : { plans: [] })
      .then(({ plans: result }) => setPlans(result))
      .catch(() => setPlans([]));
  }, []);
  const ordered = ['free', 'essential', 'local', 'multi'];
  return <div className="plan-matrix"><div className="plan-matrix-head"><span>Plan</span><span>Para quién</span><span>Valor mensual</span><span /></div>{ordered.map((code) => { const plan = plans.find((item) => item.code === code); const name = plan?.name ?? `Nava ${code === 'free' ? 'Free' : code === 'essential' ? 'Esencial' : code === 'local' ? 'Local' : 'Multi'}`; return <div className="plan-matrix-row" key={code}><strong>{name}</strong><span>{summaries[code]}</span><b>{price(plan)}</b><a href="mailto:soporte@navacloud.app?subject=Quiero%20probar%20Nava">Comenzar →</a></div>; })}</div>;
}
