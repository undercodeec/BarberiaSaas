import type { ClientDetailResponse } from '@barber-saas/api-client';

export type Tab = 'comments' | 'history' | 'information' | 'notes';
export type HistoryOrder = 'newest' | 'oldest';
export type HistoryStatusFilter =
  'all' | 'active' | 'paid' | 'cancelled' | 'completed';

export const emptyValue = (value: string | null | undefined) =>
  value || 'Sin registrar';

export function formatDate(value: string | null) {
  if (!value) return 'Sin registrar';
  return new Intl.DateTimeFormat('es-EC', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat('es-EC', {
    currency: 'USD',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(cents / 100);
}

export function statusLabel(
  status: ClientDetailResponse['history'][number]['status'],
) {
  const labels = {
    cancelled: 'Cancelada',
    checked_in: 'En espera',
    completed: 'Completada',
    confirmed: 'Confirmada',
    in_progress: 'En curso',
    no_show: 'No asistió',
    scheduled: 'Agendada',
    waiting: 'En espera',
  } as const;
  return labels[status];
}
