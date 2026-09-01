import {
  AppNotificationType,
  CashMovementType,
  CashRegisterStatus,
  MembershipRole,
  MembershipStatus,
  type PaymentMethod,
  type ProductOrderPaymentMethod,
  ProductOrderStatus,
  StockDirection,
  StockMovementType,
  type DatabaseClient,
  type Prisma,
} from '@barber-saas/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { ApiConfig } from './config';
import { ApiError } from './errors';
import { payphoneEncryptionKey } from './payphone';
import { requestPayphoneLink } from './payphone-payments';
import { decryptPaymentCredential } from './security';
import {
  cashIncomeRecipientUserIds,
  type AppointmentNotifier,
} from './notifications';

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{ readonly user: { readonly id: string } }>;

const publicOrderSchema = z
  .object({
    customerEmail: z.string().trim().email().max(254).optional(),
    customerName: z.string().trim().min(2).max(120),
    customerPhone: z.string().trim().min(7).max(32),
    items: z
      .array(
        z.object({
          productId: z.uuid(),
          quantity: z.number().int().min(1).max(20),
        }),
      )
      .min(1)
      .max(20),
    paymentMethod: z.enum(['card', 'pickup', 'transfer']),
  })
  .superRefine((value, context) => {
    const ids = new Set<string>();
    value.items.forEach((item, index) => {
      if (ids.has(item.productId))
        context.addIssue({
          code: 'custom',
          message: 'Un producto solo puede aparecer una vez.',
          path: ['items', index, 'productId'],
        });
      ids.add(item.productId);
    });
  });
const publicLocationParams = z.object({
  locationSlug: z.string().trim().min(1).max(80),
  organizationSlug: z.string().trim().min(1).max(80),
});
const orderIdParams = z.object({ orderId: z.uuid() });
const orderQuery = z.object({
  locationId: z.uuid().optional(),
  status: z.nativeEnum(ProductOrderStatus).optional(),
});
const paymentConfirmationSchema = z.object({
  paymentMethod: z.enum(['card', 'cash', 'transfer']),
  providerReference: z.string().trim().min(1).max(100).optional(),
});

function lockKey(locationId: string, productId: string) {
  return `${locationId}:${productId}`;
}

async function lockInventory(
  transaction: Prisma.TransactionClient,
  locationId: string,
  productId: string,
) {
  await transaction.$queryRaw`WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${lockKey(locationId, productId)}))) SELECT 1 AS locked FROM lock`;
}

async function managerScope(database: DatabaseClient, userId: string) {
  const membership = await database.membership.findFirst({
    include: { memberLocations: true, user: { select: { fullName: true } } },
    where: { status: MembershipStatus.ACTIVE, userId },
  });
  if (
    !membership ||
    (membership.role !== MembershipRole.OWNER &&
      membership.role !== MembershipRole.MANAGER)
  )
    throw new ApiError(
      403,
      'FORBIDDEN',
      'No tienes permiso para gestionar pedidos.',
    );
  const locations =
    membership.role === MembershipRole.OWNER
      ? await database.location.findMany({
          where: { isActive: true, organizationId: membership.organizationId },
        })
      : await database.location.findMany({
          where: {
            id: {
              in: membership.memberLocations.map(
                ({ locationId }) => locationId,
              ),
            },
            isActive: true,
          },
        });
  return { locations, membership };
}

function orderResponse(order: {
  customerEmail: string | null;
  customerName: string;
  customerPhone: string;
  createdAt: Date;
  currencyCode: string;
  expiresAt: Date;
  fulfilledAt: Date | null;
  id: string;
  items: ReadonlyArray<{
    productId: string;
    productName: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  paidAt: Date | null;
  paymentMethod: ProductOrderPaymentMethod;
  paymentReference: string | null;
  paymentUrl: string | null;
  readyAt: Date | null;
  status: ProductOrderStatus;
  totalCents: number;
}) {
  return {
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    createdAt: order.createdAt.toISOString(),
    currencyCode: order.currencyCode,
    expiresAt: order.expiresAt.toISOString(),
    fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
    id: order.id,
    items: order.items,
    paidAt: order.paidAt?.toISOString() ?? null,
    paymentMethod: order.paymentMethod.toLowerCase(),
    paymentReference: order.paymentReference,
    paymentUrl: order.paymentUrl,
    readyAt: order.readyAt?.toISOString() ?? null,
    status: order.status.toLowerCase(),
    totalCents: order.totalCents,
  };
}

async function releaseOrderReservation(
  transaction: Prisma.TransactionClient,
  order: {
    id: string;
    items: ReadonlyArray<{ productId: string; quantity: number }>;
    locationId: string;
  },
) {
  for (const item of order.items) {
    await lockInventory(transaction, order.locationId, item.productId);
    await transaction.locationInventory.update({
      data: { quantityReserved: { decrement: item.quantity } },
      where: {
        locationId_productId: {
          locationId: order.locationId,
          productId: item.productId,
        },
      },
    });
  }
}

export async function processProductOrderLifecycle(database: DatabaseClient) {
  const expired = await database.productOrder.findMany({
    include: { items: true },
    where: {
      expiresAt: { lte: new Date() },
      status: {
        in: [ProductOrderStatus.PENDING_PAYMENT, ProductOrderStatus.RESERVED],
      },
    },
  });
  for (const order of expired)
    await database.$transaction(async (transaction) => {
      const current = await transaction.productOrder.findUnique({
        include: { items: true },
        where: { id: order.id },
      });
      if (
        !current ||
        (current.status !== ProductOrderStatus.PENDING_PAYMENT &&
          current.status !== ProductOrderStatus.RESERVED) ||
        current.expiresAt > new Date()
      )
        return;
      await releaseOrderReservation(transaction, current);
      await transaction.productOrder.update({
        data: { status: ProductOrderStatus.EXPIRED },
        where: { id: current.id },
      });
    });
}

export function registerProductOrderRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
  config: ApiConfig,
  notifier: AppointmentNotifier | null = null,
) {
  app.post(
    '/v1/public/:organizationSlug/:locationSlug/orders',
    async (request, reply) => {
      const params = publicLocationParams.parse(request.params);
      const input = publicOrderSchema.parse(request.body);
      const location = await database.location.findFirst({
        include: { organization: true },
        where: {
          isActive: true,
          organization: { slug: params.organizationSlug },
          slug: params.locationSlug,
        },
      });
      if (!location)
        throw new ApiError(
          404,
          'PUBLIC_LOCATION_NOT_FOUND',
          'Este enlace no está disponible.',
        );
      const payphone =
        input.paymentMethod === 'card'
          ? await database.payphoneConfiguration.findUnique({
              where: { organizationId: location.organizationId },
            })
          : null;
      if (
        input.paymentMethod === 'card' &&
        (!payphone?.isEnabled || payphone.connectionStatus !== 'CONNECTED')
      )
        throw new ApiError(
          409,
          'PAYPHONE_NOT_AVAILABLE',
          'Este negocio no tiene pagos con tarjeta disponibles.',
        );
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() +
          (input.paymentMethod === 'pickup' ? 2 * 60 : 30) * 60_000,
      );
      const order = await database.$transaction(async (transaction) => {
        const products = await transaction.product.findMany({
          where: {
            id: { in: input.items.map(({ productId }) => productId) },
            isActive: true,
            organizationId: location.organizationId,
          },
        });
        if (products.length !== input.items.length)
          throw new ApiError(
            404,
            'PRODUCT_NOT_FOUND',
            'Uno de los productos ya no está disponible.',
          );
        const byId = new Map(products.map((product) => [product.id, product]));
        for (const item of input.items) {
          const product = byId.get(item.productId)!;
          if (!product.stockTrackingEnabled) continue;
          await lockInventory(transaction, location.id, product.id);
          const inventory = await transaction.locationInventory.upsert({
            create: {
              locationId: location.id,
              productId: product.id,
              quantityOnHand: 0,
            },
            update: {},
            where: {
              locationId_productId: {
                locationId: location.id,
                productId: product.id,
              },
            },
          });
          if (
            inventory.quantityOnHand - inventory.quantityReserved <
            item.quantity
          )
            throw new ApiError(
              409,
              'INSUFFICIENT_STOCK',
              `No hay unidades suficientes de ${product.name}.`,
            );
          await transaction.locationInventory.update({
            data: { quantityReserved: { increment: item.quantity } },
            where: {
              locationId_productId: {
                locationId: location.id,
                productId: product.id,
              },
            },
          });
        }
        return transaction.productOrder.create({
          data: {
            customerEmail: input.customerEmail ?? null,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            currencyCode: location.currencyCode,
            expiresAt,
            items: {
              create: input.items.map((item) => {
                const product = byId.get(item.productId)!;
                return {
                  productId: product.id,
                  productName: product.name,
                  quantity: item.quantity,
                  unitPriceCents: product.salePriceCents,
                };
              }),
            },
            locationId: location.id,
            organizationId: location.organizationId,
            paymentMethod:
              input.paymentMethod.toUpperCase() as ProductOrderPaymentMethod,
            status:
              input.paymentMethod === 'pickup'
                ? ProductOrderStatus.RESERVED
                : ProductOrderStatus.PENDING_PAYMENT,
            totalCents: input.items.reduce(
              (total, item) =>
                total +
                byId.get(item.productId)!.salePriceCents * item.quantity,
              0,
            ),
          },
          include: { items: true },
        });
      });
      if (input.paymentMethod !== 'card')
        return reply.code(201).send({ order: orderResponse(order) });
      const activePayphone = payphone!;
      try {
        const paymentUrl = await requestPayphoneLink({
          amountCents: order.totalCents,
          clientTransactionId: `O${order.id.replace(/-/gu, '').slice(0, 14)}`,
          reference: `Pedido Nava ${order.id.slice(0, 8)}`,
          storeId: activePayphone.storeId,
          token: decryptPaymentCredential({
            encodedKey: payphoneEncryptionKey(config),
            encryptedSecret: activePayphone.encryptedToken,
            organizationId: location.organizationId,
          }),
        });
        const updated = await database.productOrder.update({
          data: { paymentRequestedAt: now, paymentUrl },
          include: { items: true },
          where: { id: order.id },
        });
        return reply.code(201).send({ order: orderResponse(updated) });
      } catch (error) {
        await database.$transaction(async (transaction) => {
          const current = await transaction.productOrder.findUnique({
            include: { items: true },
            where: { id: order.id },
          });
          if (!current || current.status !== ProductOrderStatus.PENDING_PAYMENT)
            return;
          await releaseOrderReservation(transaction, current);
          await transaction.productOrder.update({
            data: { status: ProductOrderStatus.CANCELLED },
            where: { id: current.id },
          });
        });
        throw error;
      }
    },
  );

  app.get('/v1/product-orders', async (request) => {
    const { user } = await authenticate(database, request);
    const input = orderQuery.parse(request.query);
    const current = await managerScope(database, user.id);
    const locationIds = current.locations.map(({ id }) => id);
    const orders = await database.productOrder.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
      where: {
        locationId: input.locationId ? input.locationId : { in: locationIds },
        organizationId: current.membership.organizationId,
        ...(input.status ? { status: input.status } : {}),
      },
    });
    return { orders: orders.map(orderResponse) };
  });

  app.post('/v1/product-orders/:orderId/cancel', async (request) => {
    const { user } = await authenticate(database, request);
    const { orderId } = orderIdParams.parse(request.params);
    const current = await managerScope(database, user.id);
    const order = await database.$transaction(async (transaction) => {
      const target = await transaction.productOrder.findFirst({
        include: { items: true },
        where: {
          id: orderId,
          organizationId: current.membership.organizationId,
        },
      });
      if (!target)
        throw new ApiError(404, 'ORDER_NOT_FOUND', 'El pedido no existe.');
      if (
        target.status !== ProductOrderStatus.PENDING_PAYMENT &&
        target.status !== ProductOrderStatus.RESERVED
      )
        throw new ApiError(
          409,
          'ORDER_CANNOT_CANCEL',
          'Este pedido ya no se puede cancelar.',
        );
      await releaseOrderReservation(transaction, target);
      return transaction.productOrder.update({
        data: { status: ProductOrderStatus.CANCELLED },
        include: { items: true },
        where: { id: target.id },
      });
    });
    return { order: orderResponse(order) };
  });

  app.post('/v1/product-orders/:orderId/confirm-payment', async (request) => {
    const { user } = await authenticate(database, request);
    const { orderId } = orderIdParams.parse(request.params);
    const input = paymentConfirmationSchema.parse(request.body);
    const current = await managerScope(database, user.id);
    const result = await database.$transaction(async (transaction) => {
      const target = await transaction.productOrder.findFirst({
        include: { items: { include: { product: true } } },
        where: {
          id: orderId,
          organizationId: current.membership.organizationId,
        },
      });
      if (!target)
        throw new ApiError(404, 'ORDER_NOT_FOUND', 'El pedido no existe.');
      if (
        target.status !== ProductOrderStatus.PENDING_PAYMENT &&
        target.status !== ProductOrderStatus.RESERVED
      )
        throw new ApiError(
          409,
          'ORDER_ALREADY_PAID',
          'El pedido ya fue procesado.',
        );
      if (target.expiresAt <= new Date())
        throw new ApiError(409, 'ORDER_EXPIRED', 'El pedido ya venció.');
      const session = await transaction.cashRegisterSession.findFirst({
        where: {
          locationId: target.locationId,
          organizationId: target.organizationId,
          status: CashRegisterStatus.OPEN,
        },
      });
      if (!session)
        throw new ApiError(
          409,
          'CASH_REGISTER_CLOSED',
          'Abre la caja de esta sucursal antes de confirmar el pago.',
        );
      for (const item of target.items) {
        if (item.product.stockTrackingEnabled) {
          await lockInventory(transaction, target.locationId, item.productId);
          const inventory = await transaction.locationInventory.findUnique({
            where: {
              locationId_productId: {
                locationId: target.locationId,
                productId: item.productId,
              },
            },
          });
          if (
            !inventory ||
            inventory.quantityOnHand < item.quantity ||
            inventory.quantityReserved < item.quantity
          )
            throw new ApiError(
              409,
              'ORDER_STOCK_CONFLICT',
              'El stock del pedido cambió. Cancela el pedido y contacta al cliente.',
            );
          const resultingQuantity = inventory.quantityOnHand - item.quantity;
          await transaction.locationInventory.update({
            data: {
              quantityOnHand: { decrement: item.quantity },
              quantityReserved: { decrement: item.quantity },
            },
            where: {
              locationId_productId: {
                locationId: target.locationId,
                productId: item.productId,
              },
            },
          });
          const movement = await transaction.cashMovement.create({
            data: {
              amountCents: item.unitPriceCents * item.quantity,
              cashRegisterSessionId: session.id,
              createdByUserId: user.id,
              description: `Pedido ${target.id.slice(0, 8)}: ${item.productName}`,
              paymentMethod: input.paymentMethod.toUpperCase() as PaymentMethod,
              productId: item.productId,
              productQuantity: item.quantity,
              recordedByNameSnapshot: current.membership.user.fullName,
              type: CashMovementType.SALE,
            },
          });
          await transaction.stockMovement.create({
            data: {
              cashMovementId: movement.id,
              createdByUserId: user.id,
              direction: StockDirection.OUT,
              locationId: target.locationId,
              notes: `Pedido ${target.id.slice(0, 8)}`,
              organizationId: target.organizationId,
              productId: item.productId,
              quantity: item.quantity,
              resultingQuantity,
              type: StockMovementType.SALE,
              unitCostCents: item.product.costCents,
            },
          });
        } else
          await transaction.cashMovement.create({
            data: {
              amountCents: item.unitPriceCents * item.quantity,
              cashRegisterSessionId: session.id,
              createdByUserId: user.id,
              description: `Pedido ${target.id.slice(0, 8)}: ${item.productName}`,
              paymentMethod: input.paymentMethod.toUpperCase() as PaymentMethod,
              productId: item.productId,
              productQuantity: item.quantity,
              recordedByNameSnapshot: current.membership.user.fullName,
              type: CashMovementType.SALE,
            },
          });
      }
      const order = await transaction.productOrder.update({
        data: {
          paidAt: new Date(),
          paymentReference: input.providerReference ?? null,
          status: ProductOrderStatus.PAID,
        },
        include: { items: true },
        where: { id: target.id },
      });
      return {
        amountCents: target.items.reduce(
          (total, item) => total + item.unitPriceCents * item.quantity,
          0,
        ),
        locationId: target.locationId,
        order,
      };
    });
    if (notifier?.notifyOperational)
      try {
        const userIds = await cashIncomeRecipientUserIds(
          database,
          current.membership.organizationId,
          result.locationId,
        );
        await notifier.notifyOperational({
          actorUserId: user.id,
          body: `Pedido de productos: ingresaron $${(result.amountCents / 100).toFixed(2)} a Caja.`,
          data: { route: '/cash-register', type: 'cash_income_recorded' },
          organizationId: current.membership.organizationId,
          title: 'Nuevo ingreso en Caja',
          type: AppNotificationType.CASH_INCOME_RECORDED,
          userIds,
        });
      } catch {
        // El pedido ya fue cobrado y no debe fallar por una alerta fallida.
      }
    return { order: orderResponse(result.order) };
  });

  app.post('/v1/product-orders/:orderId/:action', async (request) => {
    const { user } = await authenticate(database, request);
    const { action, orderId } = z
      .object({ action: z.enum(['fulfill', 'ready']), orderId: z.uuid() })
      .parse(request.params);
    const current = await managerScope(database, user.id);
    const order = await database.productOrder.findFirst({
      include: { items: true },
      where: { id: orderId, organizationId: current.membership.organizationId },
    });
    if (!order)
      throw new ApiError(404, 'ORDER_NOT_FOUND', 'El pedido no existe.');
    if (
      order.status !== ProductOrderStatus.PAID &&
      !(
        action === 'fulfill' &&
        order.status === ProductOrderStatus.READY_FOR_PICKUP
      )
    )
      throw new ApiError(
        409,
        'ORDER_NOT_READY',
        'Confirma el pago antes de entregar el pedido.',
      );
    const updated = await database.productOrder.update({
      data:
        action === 'ready'
          ? { readyAt: new Date(), status: ProductOrderStatus.READY_FOR_PICKUP }
          : { fulfilledAt: new Date(), status: ProductOrderStatus.FULFILLED },
      include: { items: true },
      where: { id: order.id },
    });
    return { order: orderResponse(updated) };
  });
}
