'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  createPlatformSubscriptionDiscount,
  getPlatformSubscriptionDiscounts,
  setPlatformSubscriptionDiscountStatus,
  type PlatformSubscriptionDiscountList,
} from './platform-api';

const dateFormatter = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : 'Sin límite';
}

export function PlatformSubscriptionDiscounts({
  onToast,
  token,
}: {
  readonly onToast: (message: string) => void;
  readonly token: string;
}) {
  const [data, setData] = useState<PlatformSubscriptionDiscountList | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [percentage, setPercentage] = useState('');
  const [kind, setKind] = useState<'lifetime_continuity' | 'temporary'>('temporary');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [planIds, setPlanIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getPlatformSubscriptionDiscounts(token, { search, status }));
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'No fue posible cargar los cupones.');
    } finally {
      setLoading(false);
    }
  }, [onToast, search, status, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function togglePlan(planId: string) {
    setPlanIds((current) =>
      current.includes(planId)
        ? current.filter((id) => id !== planId)
        : [...current, planId],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await createPlatformSubscriptionDiscount(token, {
        code,
        description: description.trim() || null,
        endsAt: kind === 'temporary' && endsAt ? new Date(endsAt).toISOString() : null,
        kind,
        name,
        percentage: Number(percentage),
        planIds,
        reason,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      });
      setCode('');
      setName('');
      setDescription('');
      setPercentage('');
      setStartsAt('');
      setEndsAt('');
      setPlanIds([]);
      setReason('');
      onToast('Cupón creado correctamente.');
      await load();
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'No fue posible crear el cupón.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: string, isActive: boolean) {
    const action = isActive ? 'activar' : 'desactivar';
    const changeReason = window.prompt(`Motivo para ${action} el cupón (mínimo 10 caracteres):`);
    if (!changeReason) return;
    try {
      await setPlatformSubscriptionDiscountStatus(token, id, isActive, changeReason);
      onToast(`Cupón ${isActive ? 'activado' : 'desactivado'}.`);
      await load();
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'No fue posible actualizar el cupón.');
    }
  }

  return (
    <>
      <div className="section-header">
        <div>
          <h1>Cupones de descuento</h1>
          <p>Descuentos porcentuales para suscripciones. Cada cambio queda auditado.</p>
        </div>
        <div className="live-pill"><span /> Facturación</div>
      </div>

      <section className="content-card">
        <h2>Crear cupón</h2>
        <form className="filters-grid" onSubmit={(event) => void submit(event)}>
          <label>Código<input autoCapitalize="characters" maxLength={80} onChange={(event) => setCode(event.target.value)} required value={code} /></label>
          <label>Nombre<input maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} /></label>
          <label>Descuento (%)<input max="99" min="1" onChange={(event) => setPercentage(event.target.value)} required type="number" value={percentage} /></label>
          <label>Tipo<select onChange={(event) => setKind(event.target.value as typeof kind)} value={kind}><option value="temporary">Temporal</option><option value="lifetime_continuity">Vitalicio por continuidad</option></select></label>
          <label>Inicio (opcional)<input onChange={(event) => setStartsAt(event.target.value)} type="datetime-local" value={startsAt} /></label>
          {kind === 'temporary' ? <label>Finaliza<input onChange={(event) => setEndsAt(event.target.value)} required type="datetime-local" value={endsAt} /></label> : null}
          <label className="form-span">Descripción (opcional)<input maxLength={500} onChange={(event) => setDescription(event.target.value)} value={description} /></label>
          <fieldset className="form-span"><legend>Planes aplicables</legend><small>Sin selección aplica a todos los planes públicos de pago.</small><div className="checkbox-list">{data?.plans.map((plan) => <label key={plan.id}><input checked={planIds.includes(plan.id)} onChange={() => togglePlan(plan.id)} type="checkbox" /> {plan.name}</label>)}</div></fieldset>
          <label className="form-span">Motivo administrativo<input minLength={10} onChange={(event) => setReason(event.target.value)} required value={reason} /></label>
          <div><button className="button button--primary" disabled={saving} type="submit">{saving ? 'Guardando…' : 'Crear cupón'}</button></div>
        </form>
      </section>

      <section className="content-card subscription-filters-card">
        <div className="filters-grid">
          <label className="form-span">Buscar<input onChange={(event) => setSearch(event.target.value)} placeholder="Código o nombre" value={search} /></label>
          <label>Estado<select onChange={(event) => setStatus(event.target.value)} value={status}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label>
        </div>
      </section>

      <section className="subscription-list" aria-busy={loading}>
        {loading && !data ? <div className="panel-loader">Cargando cupones…</div> : null}
        {data?.coupons.map((coupon) => (
          <article className="subscription-card" key={coupon.id}>
            <header className="subscription-card-header"><div><span className="card-kicker">{coupon.kind === 'temporary' ? 'Temporal' : 'Vitalicio por continuidad'}</span><h2>{coupon.name}</h2><p>{coupon.description ?? 'Sin descripción'}</p></div><span className={`status-badge ${coupon.isActive ? 'status-badge--active' : ''}`}>{coupon.isActive ? 'Activo' : 'Inactivo'}</span></header>
            <div className="subscription-card-grid"><section><span className="subscription-card-label">Código</span><strong>{coupon.code} · {coupon.percentage}%</strong><small>{coupon.plans.length ? coupon.plans.map((plan) => plan.name).join(', ') : 'Todos los planes públicos de pago'}</small></section><section><span className="subscription-card-label">Vigencia</span><strong>Desde: {formatDate(coupon.startsAt)}</strong><small>Hasta: {formatDate(coupon.endsAt)}</small></section><section><span className="subscription-card-label">Historial</span><strong>{coupon.grantCount} canje(s)</strong><small>Creado: {formatDate(coupon.createdAt)}</small><button className="button button--ghost" onClick={() => void changeStatus(coupon.id, !coupon.isActive)} type="button">{coupon.isActive ? 'Desactivar' : 'Activar'}</button></section></div>
          </article>
        ))}
        {data && data.coupons.length === 0 ? <div className="empty-state">No hay cupones que coincidan con los filtros.</div> : null}
      </section>
    </>
  );
}
