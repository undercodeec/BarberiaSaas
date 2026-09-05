import type { DatabaseClient, MembershipRole } from '@barber-saas/database';
import type { FastifyRequest } from 'fastify';

import { ApiError } from './errors';

export interface OperationalAccess {
  readonly activeOrganizationLocations: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly timezone: string;
  }>;
  readonly assignedLocationIds: readonly string[];
  readonly currencyCode: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly role: MembershipRole;
  readonly userId: string;
}

export type OperationalAccessLoader = (
  request: FastifyRequest,
  userId: string,
) => Promise<OperationalAccess>;

interface OperationalAccessRow {
  readonly active_organization_locations: unknown;
  readonly assigned_location_ids: unknown;
  readonly currency_code: unknown;
  readonly membership_id: unknown;
  readonly organization_id: unknown;
  readonly role: unknown;
  readonly user_id: unknown;
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function locationIds(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(requiredString);
  return values.every((item) => item !== null)
    ? (values as readonly string[])
    : null;
}

function organizationLocations(
  value: unknown,
): OperationalAccess['activeOrganizationLocations'] | null {
  if (!Array.isArray(value)) return null;
  const locations = value.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const location = item as Record<string, unknown>;
    const id = requiredString(location.id);
    const name = requiredString(location.name);
    const timezone = requiredString(location.timezone);
    return id && name && timezone ? { id, name, timezone } : null;
  });
  return locations.every((location) => location !== null)
    ? (locations as OperationalAccess['activeOrganizationLocations'])
    : null;
}

function membershipRole(value: unknown): MembershipRole | null {
  return typeof value === 'string' &&
    ['OWNER', 'MANAGER', 'RECEPTIONIST', 'BARBER'].includes(value)
    ? (value as MembershipRole)
    : null;
}

async function loadActiveOperationalAccess(
  database: DatabaseClient,
  userId: string,
): Promise<OperationalAccess> {
  const rows = await database.$queryRaw<readonly OperationalAccessRow[]>`
    SELECT
      membership.id AS membership_id,
      membership.organization_id,
      membership.user_id,
      membership.role,
      organization.currency_code,
      COALESCE(assignments.location_ids, '[]'::jsonb) AS assigned_location_ids,
      COALESCE(locations.rows, '[]'::jsonb) AS active_organization_locations
    FROM memberships AS membership
    INNER JOIN organizations AS organization
      ON organization.id = membership.organization_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(member_location.location_id ORDER BY member_location.location_id)
        AS location_ids
      FROM member_locations AS member_location
      WHERE member_location.membership_id = membership.id
    ) AS assignments ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', location.id,
          'name', location.name,
          'timezone', location.timezone
        )
        ORDER BY location.name, location.id
      ) AS rows
      FROM locations AS location
      WHERE location.organization_id = organization.id
        AND location.is_active = true
    ) AS locations ON true
    WHERE membership.user_id = ${userId}
      AND membership.status = 'ACTIVE'
      AND organization.deleted_at IS NULL
    ORDER BY membership.created_at, membership.id
    LIMIT 1
  `;
  const row = rows[0];
  const access = row
    ? {
        activeOrganizationLocations: organizationLocations(
          row.active_organization_locations,
        ),
        assignedLocationIds: locationIds(row.assigned_location_ids),
        currencyCode: requiredString(row.currency_code),
        membershipId: requiredString(row.membership_id),
        organizationId: requiredString(row.organization_id),
        role: membershipRole(row.role),
        userId: requiredString(row.user_id),
      }
    : null;
  if (
    !access ||
    !access.activeOrganizationLocations ||
    !access.assignedLocationIds ||
    !access.currencyCode ||
    !access.membershipId ||
    !access.organizationId ||
    !access.role ||
    !access.userId
  ) {
    throw new ApiError(
      403,
      'ORGANIZATION_REQUIRED',
      'Selecciona una organización activa para continuar.',
    );
  }
  return access as OperationalAccess;
}

export function createOperationalAccessLoader(
  database: DatabaseClient,
): OperationalAccessLoader {
  const requests = new WeakMap<FastifyRequest, Promise<OperationalAccess>>();
  return (request, userId) => {
    const cached = requests.get(request);
    if (cached) return cached;
    const pending = loadActiveOperationalAccess(database, userId);
    requests.set(request, pending);
    return pending;
  };
}
