import {
  CashMovementType,
  CommissionEntryStatus,
  CommissionSettlementStatus,
  MembershipRole,
  MembershipStatus,
  type DatabaseClient,
} from '@barber-saas/database';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { zonedDateTimeToUtc } from './agenda';
import { ApiError } from './errors';

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{ readonly user: { readonly id: string } }>;

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const summaryQuerySchema = z
  .object({
    from: localDateSchema.optional(),
    locationId: z.uuid().optional(),
    range: z
      .enum(['today', 'last_7_days', 'this_month', 'last_30_days'])
      .default('this_month'),
    to: localDateSchema.optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.from) !== Boolean(value.to)) {
      context.addIssue({
        code: 'custom',
        message: 'Debes indicar el inicio y fin del período.',
        path: value.from ? ['to'] : ['from'],
      });
    }
    if (value.from && value.to) {
      const from = Date.parse(`${value.from}T00:00:00.000Z`);
      const to = Date.parse(`${value.to}T00:00:00.000Z`);
      if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
        context.addIssue({
          code: 'custom',
          message: 'El rango de fechas no es válido.',
          path: ['from'],
        });
      } else if (to - from > 366 * 24 * 60 * 60 * 1000) {
        context.addIssue({
          code: 'custom',
          message: 'El reporte admite un máximo de 366 días.',
          path: ['to'],
        });
      }
    }
  });

function localDateFor(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDate(localDate: string, days: number) {
  const value = new Date(`${localDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function periodFor(
  now: Date,
  timeZone: string,
  input: z.infer<typeof summaryQuerySchema>,
) {
  if (input.from && input.to) return { from: input.from, to: input.to };
  const to = localDateFor(now, timeZone);
  if (input.range === 'today') return { from: to, to };
  if (input.range === 'last_7_days') return { from: shiftDate(to, -6), to };
  if (input.range === 'last_30_days') return { from: shiftDate(to, -29), to };
  return { from: `${to.slice(0, 8)}01`, to };
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function registerReportRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
) {
  app.get('/v1/reports/business-summary', async (request) => {
    const { user } = await authenticate(database, request);
    const input = summaryQuerySchema.parse(request.query);
    const membership = await database.membership.findFirst({
      include: {
        memberLocations: {
          include: { location: true },
          where: { location: { isActive: true } },
        },
      },
      where: { status: MembershipStatus.ACTIVE, userId: user.id },
    });
    if (!membership) {
      throw new ApiError(
        403,
        'ORGANIZATION_REQUIRED',
        'Tu cuenta no pertenece a un negocio activo.',
      );
    }
    if (
      membership.role !== MembershipRole.OWNER &&
      membership.role !== MembershipRole.MANAGER
    ) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'No tienes permiso para consultar reportes globales.',
      );
    }

    const accessibleLocations =
      membership.role === MembershipRole.OWNER
        ? await database.location.findMany({
            orderBy: { createdAt: 'asc' },
            where: {
              isActive: true,
              organizationId: membership.organizationId,
            },
          })
        : membership.memberLocations.map(({ location }) => location);
    const selectedLocation = input.locationId
      ? accessibleLocations.find(({ id }) => id === input.locationId)
      : null;
    if (input.locationId && !selectedLocation) {
      throw new ApiError(
        404,
        'LOCATION_NOT_FOUND',
        'La sucursal no existe o no está dentro de tu alcance.',
      );
    }
    const reportLocations = selectedLocation
      ? [selectedLocation]
      : accessibleLocations;
    if (reportLocations.length === 0) {
      throw new ApiError(
        409,
        'REPORT_LOCATION_REQUIRED',
        'Configura al menos una sucursal para consultar reportes.',
      );
    }
    const currencies = new Set(
      reportLocations.map(({ currencyCode }) => currencyCode),
    );
    if (currencies.size > 1) {
      throw new ApiError(
        400,
        'REPORT_MIXED_CURRENCIES',
        'Selecciona una sucursal para evitar sumar monedas diferentes.',
      );
    }

    const now = new Date();
    const windows = reportLocations.map((location) => {
      const period = periodFor(now, location.timezone, input);
      return {
        end: zonedDateTimeToUtc(shiftDate(period.to, 1), 0, location.timezone),
        location,
        period,
        start: zonedDateTimeToUtc(period.from, 0, location.timezone),
      };
    });
    const financialWindow = {
      end: windows.reduce(
        (latest, window) => (window.end > latest ? window.end : latest),
        windows[0]?.end ?? now,
      ),
      start: windows.reduce(
        (earliest, window) =>
          window.start < earliest ? window.start : earliest,
        windows[0]?.start ?? now,
      ),
    };
    const [
      movements,
      commissionEntries,
      professionalAdvances,
      paidSettlements,
    ] = await Promise.all([
      database.cashMovement.findMany({
        select: {
          amountCents: true,
          appointmentId: true,
          serviceId: true,
          type: true,
        },
        where: {
          OR: windows.map(({ end, location, start }) => ({
            cashRegisterSession: {
              locationId: location.id,
              organizationId: membership.organizationId,
            },
            createdAt: { gte: start, lt: end },
          })),
        },
      }),
      database.commissionEntry.findMany({
        select: { commissionAmountCents: true, status: true },
        where: {
          OR: windows.map(({ end, location, start }) => ({
            locationId: location.id,
            occurredAt: { gte: start, lt: end },
            organizationId: membership.organizationId,
          })),
        },
      }),
      database.professionalAdvance.findMany({
        select: {
          occurredAt: true,
          originalAmountCents: true,
          reversedAt: true,
        },
        where: {
          OR: [
            {
              occurredAt: {
                gte: financialWindow.start,
                lt: financialWindow.end,
              },
            },
            {
              reversedAt: {
                gte: financialWindow.start,
                lt: financialWindow.end,
              },
            },
          ],
          organizationId: membership.organizationId,
        },
      }),
      database.commissionSettlement.findMany({
        select: { totalPayableCents: true },
        where: {
          organizationId: membership.organizationId,
          paidAt: { gte: financialWindow.start, lt: financialWindow.end },
          status: CommissionSettlementStatus.PAID,
        },
      }),
    ]);

    const sales = movements.filter(
      ({ type }) => type === CashMovementType.SALE,
    );
    const grossSalesCents = sum(sales.map(({ amountCents }) => amountCents));
    const serviceSalesCents = sum(
      sales
        .filter(({ appointmentId, serviceId }) => appointmentId || serviceId)
        .map(({ amountCents }) => amountCents),
    );
    const uncategorizedSalesCents = grossSalesCents - serviceSalesCents;
    const operatingExpensesCents = sum(
      movements
        .filter(({ type }) => type === CashMovementType.EXPENSE)
        .map(({ amountCents }) => amountCents),
    );
    const isInFinancialWindow = (value: Date | null) =>
      Boolean(
        value && value >= financialWindow.start && value < financialWindow.end,
      );
    const advancePaymentsCents = sum(
      professionalAdvances.map(
        ({ occurredAt, originalAmountCents, reversedAt }) =>
          (isInFinancialWindow(occurredAt) ? originalAmountCents : 0) -
          (isInFinancialWindow(reversedAt) ? originalAmountCents : 0),
      ),
    );
    const collaboratorPaymentsCents =
      advancePaymentsCents +
      sum(paidSettlements.map(({ totalPayableCents }) => totalPayableCents));
    const withdrawalsCents = sum(
      movements
        .filter(({ type }) => type === CashMovementType.WITHDRAWAL)
        .map(({ amountCents }) => amountCents),
    );
    const servicesGeneratedCents = sum(
      commissionEntries
        .filter(({ status }) => status !== CommissionEntryStatus.REVERSED)
        .map(({ commissionAmountCents }) => commissionAmountCents),
    );
    const totalExpensesCents =
      operatingExpensesCents + collaboratorPaymentsCents;
    const period = windows[0]?.period;
    if (!period) throw new Error('El reporte no tiene un período válido.');

    return {
      accessibleLocations: accessibleLocations.map(({ id, name }) => ({
        id,
        name,
      })),
      commissions: {
        productsGeneratedCents: 0,
        servicesGeneratedCents,
        totalGeneratedCents: servicesGeneratedCents,
      },
      currencyCode: reportLocations[0]?.currencyCode ?? 'USD',
      expenses: {
        collaboratorPaymentsCents,
        operatingCents: operatingExpensesCents,
        totalCents: totalExpensesCents,
      },
      income: {
        otherIncomeCents: 0,
        salesCents: grossSalesCents,
        totalCents: grossSalesCents,
      },
      netResultCents: grossSalesCents - totalExpensesCents,
      period: {
        from: period.from,
        locationId: selectedLocation?.id ?? null,
        locationName: selectedLocation?.name ?? 'Todas las sucursales',
        preset: input.range,
        to: period.to,
      },
      sales: {
        averageTicketCents:
          sales.length > 0 ? Math.round(grossSalesCents / sales.length) : 0,
        grossCents: grossSalesCents,
        productsCents: 0,
        servicesCents: serviceSalesCents,
        transactionCount: sales.length,
        uncategorizedCents: uncategorizedSalesCents,
      },
      withdrawalsCents,
    };
  });
}
