import {
  AppointmentPaymentStatus,
  AppointmentStatus,
  CashMovementType,
  CommissionEntryStatus,
  CommissionSettlementStatus,
  MembershipRole,
  MembershipStatus,
  PaymentMethod,
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
const movementReportQuerySchema = z
  .object({
    format: z.enum(['csv', 'json']).default('json'),
    from: localDateSchema.optional(),
    kind: z.enum(['deposits', 'expenses', 'sales']),
    locationId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
    paymentMethod: z.enum(['cash', 'card', 'transfer', 'other']).optional(),
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
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: 'custom',
        message: 'El rango de fechas no es válido.',
        path: ['from'],
      });
    }
  });
const dailyReportQuerySchema = z
  .object({
    format: z.enum(['csv', 'json']).default('json'),
    from: localDateSchema.optional(),
    locationId: z.uuid().optional(),
    range: z
      .enum(['today', 'last_7_days', 'this_month', 'last_30_days'])
      .default('today'),
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

function namedAmountRows(
  records: ReadonlyArray<{
    readonly amountCents: number;
    readonly description: string;
  }>,
) {
  const grouped = new Map<string, { amountCents: number; count: number }>();
  for (const record of records) {
    const current = grouped.get(record.description) ?? {
      amountCents: 0,
      count: 0,
    };
    current.amountCents += record.amountCents;
    current.count += 1;
    grouped.set(record.description, current);
  }
  return [...grouped.entries()]
    .map(([description, values]) => ({ description, ...values }))
    .sort(
      (left, right) =>
        right.amountCents - left.amountCents ||
        left.description.localeCompare(right.description),
    );
}

function serviceSaleRows(
  sales: ReadonlyArray<{
    readonly amountCents: number;
    readonly serviceId: string | null;
  }>,
  services: ReadonlyArray<{ readonly id: string; readonly name: string }>,
) {
  const serviceNames = new Map(
    services.map(({ id, name }) => [id, name] as const),
  );
  const grouped = new Map<
    string,
    { name: string; quantity: number; revenueCents: number }
  >();
  for (const sale of sales) {
    if (!sale.serviceId) continue;
    const current = grouped.get(sale.serviceId) ?? {
      name: serviceNames.get(sale.serviceId) ?? 'Servicio eliminado',
      quantity: 0,
      revenueCents: 0,
    };
    current.quantity += 1;
    current.revenueCents += sale.amountCents;
    grouped.set(sale.serviceId, current);
  }
  return [...grouped.entries()]
    .map(([id, values]) => ({ id, ...values }))
    .sort(
      (left, right) =>
        right.revenueCents - left.revenueCents ||
        left.name.localeCompare(right.name),
    );
}

function csvCell(value: string | number | null) {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
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
          description: true,
          productId: true,
          productQuantity: true,
          product: { select: { id: true, name: true } },
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
          reversedAt: null,
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
    const otherIncomeCents = sum(
      movements
        .filter(
          ({ type }) =>
            type === CashMovementType.DEPOSIT ||
            type === CashMovementType.OTHER_INCOME,
        )
        .map(({ amountCents }) => amountCents),
    );
    const totalIncomeCents = grossSalesCents + otherIncomeCents;
    const serviceSalesCents = sum(
      sales
        .filter(({ appointmentId, serviceId }) => appointmentId || serviceId)
        .map(({ amountCents }) => amountCents),
    );
    const productSalesCents = sum(
      sales
        .filter(({ productId }) => productId)
        .map(({ amountCents }) => amountCents),
    );
    const uncategorizedSalesCents =
      grossSalesCents - serviceSalesCents - productSalesCents;
    const operatingExpensesCents = sum(
      movements
        .filter(({ type }) => type === CashMovementType.EXPENSE)
        .map(({ amountCents }) => amountCents),
    );
    const serviceIds = [
      ...new Set(
        sales.flatMap(({ serviceId }) => (serviceId ? [serviceId] : [])),
      ),
    ];
    const services = await database.service.findMany({
      select: { id: true, name: true },
      where: {
        id: { in: serviceIds },
        organizationId: membership.organizationId,
      },
    });
    const productRows = movements
      .filter(
        (
          movement,
        ): movement is typeof movement & {
          product: NonNullable<typeof movement.product>;
        } =>
          movement.type === CashMovementType.SALE && Boolean(movement.product),
      )
      .reduce((rows, movement) => {
        const current = rows.get(movement.product.id) ?? {
          id: movement.product.id,
          name: movement.product.name,
          quantity: 0,
          revenueCents: 0,
        };
        current.quantity += movement.productQuantity ?? 0;
        current.revenueCents += movement.amountCents;
        rows.set(movement.product.id, current);
        return rows;
      }, new Map<string, { id: string; name: string; quantity: number; revenueCents: number }>());
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
      details: {
        expenses: namedAmountRows(
          movements.filter(({ type }) => type === CashMovementType.EXPENSE),
        ),
        otherIncome: namedAmountRows(
          movements.filter(
            ({ type }) =>
              type === CashMovementType.DEPOSIT ||
              type === CashMovementType.OTHER_INCOME,
          ),
        ),
        products: [...productRows.values()].sort(
          (left, right) =>
            right.revenueCents - left.revenueCents ||
            left.name.localeCompare(right.name),
        ),
        services: serviceSaleRows(sales, services),
      },
      expenses: {
        collaboratorPaymentsCents,
        operatingCents: operatingExpensesCents,
        totalCents: totalExpensesCents,
      },
      income: {
        otherIncomeCents,
        salesCents: grossSalesCents,
        totalCents: totalIncomeCents,
      },
      netResultCents: totalIncomeCents - totalExpensesCents,
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
        productsCents: productSalesCents,
        servicesCents: serviceSalesCents,
        transactionCount: sales.length,
        uncategorizedCents: uncategorizedSalesCents,
      },
      withdrawalsCents,
    };
  });

  app.get('/v1/reports/daily', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = dailyReportQuerySchema.parse(request.query);
    const membership = await database.membership.findFirst({
      include: {
        memberLocations: {
          include: { location: true },
          where: { location: { isActive: true } },
        },
      },
      where: { status: MembershipStatus.ACTIVE, userId: user.id },
    });
    if (!membership)
      throw new ApiError(
        403,
        'ORGANIZATION_REQUIRED',
        'Tu cuenta no pertenece a un negocio activo.',
      );
    if (
      membership.role !== MembershipRole.OWNER &&
      membership.role !== MembershipRole.MANAGER
    )
      throw new ApiError(
        403,
        'FORBIDDEN',
        'No tienes permiso para consultar reportes globales.',
      );
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
    if (input.locationId && !selectedLocation)
      throw new ApiError(
        404,
        'LOCATION_NOT_FOUND',
        'La sucursal no existe o no está dentro de tu alcance.',
      );
    const reportLocations = selectedLocation
      ? [selectedLocation]
      : accessibleLocations;
    if (!reportLocations.length)
      throw new ApiError(
        409,
        'REPORT_LOCATION_REQUIRED',
        'Configura al menos una sucursal para consultar reportes.',
      );
    if (
      new Set(reportLocations.map(({ currencyCode }) => currencyCode)).size > 1
    )
      throw new ApiError(
        400,
        'REPORT_MIXED_CURRENCIES',
        'Selecciona una sucursal para evitar sumar monedas diferentes.',
      );

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
    const appointmentWindow = windows.map(({ end, location, start }) => ({
      locationId: location.id,
      startsAt: { gte: start, lt: end },
    }));
    const financialWindow = windows.map(({ end, location, start }) => ({
      cashRegisterSession: {
        locationId: location.id,
        organizationId: membership.organizationId,
      },
      createdAt: { gte: start, lt: end },
    }));
    const commissionWindow = windows.map(({ end, location, start }) => ({
      locationId: location.id,
      occurredAt: { gte: start, lt: end },
    }));
    const closureWindow = windows.map(({ end, location, start }) => ({
      closedAt: { gte: start, lt: end },
      locationId: location.id,
    }));
    const [appointments, movements, commissionEntries, cashClosures] =
      await Promise.all([
        database.appointment.findMany({
          select: {
            id: true,
            paymentStatus: true,
            professionalMembershipId: true,
            services: {
              select: { priceCents: true, serviceId: true, serviceName: true },
            },
            status: true,
          },
          where: {
            OR: appointmentWindow,
            organizationId: membership.organizationId,
            status: {
              notIn: [
                AppointmentStatus.PENDING_VERIFICATION,
                AppointmentStatus.EXPIRED,
              ],
            },
          },
        }),
        database.cashMovement.findMany({
          select: {
            amountCents: true,
            appointmentId: true,
            description: true,
            paymentMethod: true,
            productId: true,
            productQuantity: true,
            professionalMembershipId: true,
            serviceId: true,
            type: true,
          },
          where: {
            OR: financialWindow,
            reversedAt: null,
          },
        }),
        database.commissionEntry.findMany({
          select: {
            commissionAmountCents: true,
            professionalMembershipId: true,
          },
          where: {
            OR: commissionWindow,
            organizationId: membership.organizationId,
            status: { not: CommissionEntryStatus.REVERSED },
          },
        }),
        database.cashRegisterSession.findMany({
          select: {
            closingAmountCents: true,
            differenceCents: true,
            expectedAmountCents: true,
          },
          where: {
            OR: closureWindow,
            organizationId: membership.organizationId,
          },
        }),
      ]);

    const sales = movements.filter(
      ({ type }) => type === CashMovementType.SALE,
    );

    const missingAppointmentIds = sales.flatMap(({ appointmentId }) =>
      appointmentId && !appointments.some(({ id }) => id === appointmentId)
        ? [appointmentId]
        : [],
    );
    const linkedAppointments = missingAppointmentIds.length
      ? await database.appointment.findMany({
          select: { id: true, professionalMembershipId: true },
          where: {
            id: { in: missingAppointmentIds },
            organizationId: membership.organizationId,
          },
        })
      : [];
    const appointmentProfessionals = new Map([
      ...appointments.map(
        ({ id, professionalMembershipId }) =>
          [id, professionalMembershipId] as const,
      ),
      ...linkedAppointments.map(
        ({ id, professionalMembershipId }) =>
          [id, professionalMembershipId] as const,
      ),
    ]);
    const saleProfessionalId = (sale: (typeof sales)[number]) =>
      sale.professionalMembershipId ??
      (sale.appointmentId
        ? (appointmentProfessionals.get(sale.appointmentId) ?? null)
        : null);
    const professionalIds = [
      ...new Set([
        ...appointments.map(
          ({ professionalMembershipId }) => professionalMembershipId,
        ),
        ...sales.flatMap((sale) => {
          const professionalId = saleProfessionalId(sale);
          return professionalId ? [professionalId] : [];
        }),
        ...commissionEntries.map(
          ({ professionalMembershipId }) => professionalMembershipId,
        ),
      ]),
    ];
    const productIds = [
      ...new Set(
        sales.flatMap(({ productId }) => (productId ? [productId] : [])),
      ),
    ];
    const serviceIds = [
      ...new Set(
        sales.flatMap(({ serviceId }) => (serviceId ? [serviceId] : [])),
      ),
    ];
    const [professionals, products, services] = await Promise.all([
      database.membership.findMany({
        include: { user: { select: { fullName: true } } },
        where: {
          id: { in: professionalIds },
          organizationId: membership.organizationId,
        },
      }),
      database.product.findMany({
        select: { id: true, name: true },
        where: {
          id: { in: productIds },
          organizationId: membership.organizationId,
        },
      }),
      database.service.findMany({
        select: { id: true, name: true },
        where: {
          id: { in: serviceIds },
          organizationId: membership.organizationId,
        },
      }),
    ]);

    const grossSalesCents = sum(sales.map(({ amountCents }) => amountCents));
    const paymentTotals = {
      cardCents: 0,
      cashCents: 0,
      otherCents: 0,
      transferCents: 0,
    };
    for (const sale of sales) {
      if (sale.paymentMethod === PaymentMethod.CASH)
        paymentTotals.cashCents += sale.amountCents;
      else if (sale.paymentMethod === PaymentMethod.CARD)
        paymentTotals.cardCents += sale.amountCents;
      else if (sale.paymentMethod === PaymentMethod.TRANSFER)
        paymentTotals.transferCents += sale.amountCents;
      else paymentTotals.otherCents += sale.amountCents;
    }
    const professionalRows = professionals
      .map((professional) => {
        const professionalSales = sales.filter(
          (sale) => saleProfessionalId(sale) === professional.id,
        );
        return {
          commissionCents: sum(
            commissionEntries
              .filter(
                ({ professionalMembershipId }) =>
                  professionalMembershipId === professional.id,
              )
              .map(({ commissionAmountCents }) => commissionAmountCents),
          ),
          completedAppointments: appointments.filter(
            ({ professionalMembershipId, status }) =>
              professionalMembershipId === professional.id &&
              status === AppointmentStatus.COMPLETED,
          ).length,
          id: professional.id,
          name: professional.user.fullName,
          saleCount: professionalSales.length,
          salesCents: sum(
            professionalSales.map(({ amountCents }) => amountCents),
          ),
        };
      })
      .sort(
        (left, right) =>
          right.salesCents - left.salesCents ||
          left.name.localeCompare(right.name),
      );
    const productRows = products
      .map((product) => {
        const productSales = sales.filter(
          ({ productId }) => productId === product.id,
        );
        return {
          id: product.id,
          name: product.name,
          quantity: sum(
            productSales.map(({ productQuantity }) => productQuantity ?? 0),
          ),
          revenueCents: sum(productSales.map(({ amountCents }) => amountCents)),
        };
      })
      .sort(
        (left, right) =>
          right.quantity - left.quantity || left.name.localeCompare(right.name),
      );
    const paidAppointments = appointments.filter(
      ({ paymentStatus }) => paymentStatus === AppointmentPaymentStatus.PAID,
    );
    const expenseRows = namedAmountRows(
      movements.filter(({ type }) => type === CashMovementType.EXPENSE),
    );
    const serviceRows = serviceSaleRows(sales, services);
    const period = windows[0]?.period;
    if (!period) throw new Error('El reporte no tiene un período válido.');
    const response = {
      accessibleLocations: accessibleLocations.map(({ id, name }) => ({
        id,
        name,
      })),
      appointments: {
        attended: appointments.filter(
          ({ status }) => status === AppointmentStatus.COMPLETED,
        ).length,
        cancelled: appointments.filter(
          ({ status }) => status === AppointmentStatus.CANCELLED,
        ).length,
        noShow: appointments.filter(
          ({ status }) => status === AppointmentStatus.NO_SHOW,
        ).length,
        paid: paidAppointments.length,
        paidScheduledValueCents: sum(
          paidAppointments.flatMap(({ services }) =>
            services.map(({ priceCents }) => priceCents),
          ),
        ),
        total: appointments.length,
      },
      cashClosures: {
        closingAmountCents: sum(
          cashClosures.map(({ closingAmountCents }) => closingAmountCents ?? 0),
        ),
        count: cashClosures.length,
        differenceCents: sum(
          cashClosures.map(({ differenceCents }) => differenceCents ?? 0),
        ),
        expectedAmountCents: sum(
          cashClosures.map(
            ({ expectedAmountCents }) => expectedAmountCents ?? 0,
          ),
        ),
      },
      collections: { totalCents: grossSalesCents, ...paymentTotals },
      currencyCode: reportLocations[0]?.currencyCode ?? 'USD',
      expenses: expenseRows,
      period: {
        from: period.from,
        locationId: selectedLocation?.id ?? null,
        locationName: selectedLocation?.name ?? 'Todas las sucursales',
        preset: input.range,
        to: period.to,
      },
      products: productRows,
      professionals: professionalRows,
      services: serviceRows,
      sales: {
        averageTicketCents:
          sales.length > 0 ? Math.round(grossSalesCents / sales.length) : 0,
        grossCents: grossSalesCents,
        transactionCount: sales.length,
      },
    };
    if (input.format === 'csv') {
      const rows: Array<Array<string | number | null>> = [
        ['Sección', 'Indicador', 'Nombre', 'Cantidad', 'Monto centavos'],
        ['Citas', 'Total', null, response.appointments.total, null],
        ['Citas', 'Atendidas', null, response.appointments.attended, null],
        ['Citas', 'Canceladas', null, response.appointments.cancelled, null],
        ['Citas', 'No-show', null, response.appointments.noShow, null],
        [
          'Citas',
          'Pagadas',
          null,
          response.appointments.paid,
          response.appointments.paidScheduledValueCents,
        ],
        [
          'Ventas',
          'Transacciones',
          null,
          response.sales.transactionCount,
          response.sales.grossCents,
        ],
        [
          'Ventas',
          'Ticket promedio',
          null,
          null,
          response.sales.averageTicketCents,
        ],
        ['Cobros', 'Efectivo', null, null, response.collections.cashCents],
        ['Cobros', 'Tarjeta', null, null, response.collections.cardCents],
        [
          'Cobros',
          'Transferencia',
          null,
          null,
          response.collections.transferCents,
        ],
        ['Cobros', 'Otro', null, null, response.collections.otherCents],
        ...response.services.map((service) => [
          'Servicios cobrados',
          'Ventas',
          service.name,
          service.quantity,
          service.revenueCents,
        ]),
        ...response.expenses.map((expense) => [
          'Egresos',
          expense.description,
          null,
          expense.count,
          expense.amountCents,
        ]),
        [
          'Cierre de caja',
          'Cierres',
          null,
          response.cashClosures.count,
          response.cashClosures.closingAmountCents,
        ],
        [
          'Cierre de caja',
          'Efectivo esperado',
          null,
          null,
          response.cashClosures.expectedAmountCents,
        ],
        [
          'Cierre de caja',
          'Diferencia',
          null,
          null,
          response.cashClosures.differenceCents,
        ],
        ...response.professionals.flatMap((professional) => [
          [
            'Profesionales',
            'Ventas',
            professional.name,
            professional.saleCount,
            professional.salesCents,
          ],
          [
            'Profesionales',
            'Comisión',
            professional.name,
            professional.completedAppointments,
            professional.commissionCents,
          ],
        ]),
        ...response.products.map((product) => [
          'Productos',
          'Unidades vendidas',
          product.name,
          product.quantity,
          product.revenueCents,
        ]),
      ];
      const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
      return reply
        .header(
          'content-disposition',
          `attachment; filename="reporte-diario-${period.from}-${period.to}.csv"`,
        )
        .type('text/csv; charset=utf-8')
        .send(`\uFEFF${csv}`);
    }
    return response;
  });

  app.get('/v1/reports/movements', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = movementReportQuerySchema.parse(request.query);
    const membership = await database.membership.findFirst({
      include: {
        memberLocations: {
          include: { location: true },
          where: { location: { isActive: true } },
        },
      },
      where: { status: MembershipStatus.ACTIVE, userId: user.id },
    });
    if (!membership)
      throw new ApiError(
        403,
        'ORGANIZATION_REQUIRED',
        'Tu cuenta no pertenece a un negocio activo.',
      );
    if (
      membership.role !== MembershipRole.OWNER &&
      membership.role !== MembershipRole.MANAGER
    )
      throw new ApiError(
        403,
        'FORBIDDEN',
        'No tienes permiso para consultar reportes financieros.',
      );
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
    const reportLocations = input.locationId
      ? accessibleLocations.filter(({ id }) => id === input.locationId)
      : accessibleLocations;
    if (!reportLocations.length)
      throw new ApiError(
        404,
        'LOCATION_NOT_FOUND',
        'La sucursal no existe o no está dentro de tu alcance.',
      );
    const windows = reportLocations.map((location) => {
      const period = periodFor(new Date(), location.timezone, input);
      return {
        end: zonedDateTimeToUtc(shiftDate(period.to, 1), 0, location.timezone),
        location,
        period,
        start: zonedDateTimeToUtc(period.from, 0, location.timezone),
      };
    });
    const movementWhere = {
      OR: windows.map(({ end, location, start }) => ({
        cashRegisterSession: {
          locationId: location.id,
          organizationId: membership.organizationId,
        },
        createdAt: { gte: start, lt: end },
      })),
      ...(input.paymentMethod
        ? { paymentMethod: input.paymentMethod.toUpperCase() as never }
        : {}),
      type:
        input.kind === 'expenses'
          ? CashMovementType.EXPENSE
          : input.kind === 'sales'
            ? CashMovementType.SALE
            : {
                in: [CashMovementType.DEPOSIT, CashMovementType.OTHER_INCOME],
              },
      reversedAt: null,
    };
    const take = input.format === 'csv' ? 5_000 : input.pageSize;
    const [total, movements] = await Promise.all([
      database.cashMovement.count({ where: movementWhere }),
      database.cashMovement.findMany({
        include: { cashRegisterSession: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: input.format === 'csv' ? 0 : (input.page - 1) * input.pageSize,
        take,
        where: movementWhere,
      }),
    ]);
    const userIds = [
      ...new Set(movements.map(({ createdByUserId }) => createdByUserId)),
    ];
    const appointmentIds = movements.flatMap(({ appointmentId }) =>
      appointmentId ? [appointmentId] : [],
    );
    const serviceIds = movements.flatMap(({ serviceId }) =>
      serviceId ? [serviceId] : [],
    );
    const professionalIds = movements.flatMap(({ professionalMembershipId }) =>
      professionalMembershipId ? [professionalMembershipId] : [],
    );
    const productIds = movements.flatMap(({ productId }) =>
      productId ? [productId] : [],
    );
    const [users, appointments, services, professionals, products] =
      await Promise.all([
        database.user.findMany({
          select: { fullName: true, id: true },
          where: { id: { in: userIds } },
        }),
        database.appointment.findMany({
          select: { clientName: true, id: true },
          where: { id: { in: appointmentIds } },
        }),
        database.service.findMany({
          select: { id: true, name: true },
          where: { id: { in: serviceIds } },
        }),
        database.membership.findMany({
          include: { user: { select: { fullName: true } } },
          where: {
            id: { in: professionalIds },
            organizationId: membership.organizationId,
          },
        }),
        database.product.findMany({
          select: { id: true, name: true },
          where: {
            id: { in: productIds },
            organizationId: membership.organizationId,
          },
        }),
      ]);
    const names = new Map(users.map((record) => [record.id, record.fullName]));
    const clients = new Map(
      appointments.map((record) => [record.id, record.clientName]),
    );
    const serviceNames = new Map(
      services.map((record) => [record.id, record.name]),
    );
    const professionalNames = new Map(
      professionals.map((record) => [record.id, record.user.fullName]),
    );
    const productNames = new Map(
      products.map((record) => [record.id, record.name]),
    );
    const rows = movements.map((movement) => ({
      amountCents: movement.amountCents,
      appointmentId: movement.appointmentId,
      clientName: movement.appointmentId
        ? (clients.get(movement.appointmentId) ?? null)
        : null,
      createdAt: movement.createdAt.toISOString(),
      createdByName: names.get(movement.createdByUserId) ?? 'Usuario eliminado',
      description: movement.description,
      id: movement.id,
      locationId: movement.cashRegisterSession.locationId,
      locationName:
        reportLocations.find(
          ({ id }) => id === movement.cashRegisterSession.locationId,
        )?.name ?? 'Sin sucursal',
      paymentMethod: movement.paymentMethod?.toLowerCase() ?? null,
      productName: movement.productId
        ? (productNames.get(movement.productId) ?? null)
        : null,
      professionalName: movement.professionalMembershipId
        ? (professionalNames.get(movement.professionalMembershipId) ?? null)
        : null,
      serviceName: movement.serviceId
        ? (serviceNames.get(movement.serviceId) ?? null)
        : null,
      type: movement.type.toLowerCase(),
    }));
    if (input.format === 'csv') {
      const header = [
        'Fecha',
        'Sucursal',
        'Descripción',
        'Tipo',
        'Monto centavos',
        'Método',
        'Responsable',
        'Cliente',
        'Servicio',
        'Producto',
        'Profesional',
      ];
      const csv = [
        header,
        ...rows.map((row) => [
          row.createdAt,
          row.locationName,
          row.description,
          row.type,
          row.amountCents,
          row.paymentMethod,
          row.createdByName,
          row.clientName,
          row.serviceName,
          row.productName,
          row.professionalName,
        ]),
      ]
        .map((row) => row.map(csvCell).join(','))
        .join('\r\n');
      return reply
        .header(
          'content-disposition',
          `attachment; filename="${input.kind}-${windows[0]?.period.from}-${windows[0]?.period.to}.csv"`,
        )
        .type('text/csv; charset=utf-8')
        .send(`\uFEFF${csv}`);
    }
    return {
      accessibleLocations: accessibleLocations.map(({ id, name }) => ({
        id,
        name,
      })),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      },
      period: windows[0]?.period,
      rows,
      totalAmountCents: rows.reduce(
        (amount, row) => amount + row.amountCents,
        0,
      ),
    };
  });
}
