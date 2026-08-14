import type {
  ClientLabelRecord,
  ClientRecord,
  ClientsResponse,
} from '@barber-saas/api-client';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function nullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function normalizeLabel(value: unknown): ClientLabelRecord | null {
  const label = asRecord(value);
  if (!label) return null;

  const id = nullableText(label.id);
  const name = nullableText(label.name);
  const color = nullableText(label.color);
  if (!id || !name || !color) return null;

  return { color, id, name };
}

/**
 * Normalizes API data before it is rendered or stored in the client cache.
 * A missing id or name cannot represent a usable client, so it is discarded.
 */
export function normalizeClientRecord(value: unknown): ClientRecord | null {
  const client = asRecord(value);
  if (!client) return null;

  const id = nullableText(client.id);
  const fullName = nullableText(client.fullName);
  if (!id || !fullName) return null;

  const rawLabels = Array.isArray(client.labels) ? client.labels : [];
  const labels = rawLabels.flatMap((label) => {
    const normalized = normalizeLabel(label);
    return normalized ? [normalized] : [];
  });

  return {
    addressLine: nullableText(client.addressLine),
    birthDate: nullableText(client.birthDate),
    documentNumber: nullableText(client.documentNumber),
    email: nullableText(client.email),
    fullName,
    id,
    labels,
    lastName: nullableText(client.lastName),
    notes: nullableText(client.notes),
    phone: nullableText(client.phone),
  };
}

export function normalizeClientsResponse(value: unknown): ClientsResponse {
  const response = asRecord(value);
  const rawClients = Array.isArray(response?.clients) ? response.clients : [];

  return {
    clients: rawClients.flatMap((client) => {
      const normalized = normalizeClientRecord(client);
      return normalized ? [normalized] : [];
    }),
  };
}
