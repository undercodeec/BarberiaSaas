import {
  CashMovementType,
  CashRegisterStatus,
  MembershipRole,
  MembershipStatus,
  StockDirection,
  StockMovementType,
  type DatabaseClient,
  type Prisma,
} from '@barber-saas/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { ApiError, isUniqueConstraintError } from './errors';

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{ readonly user: { readonly id: string } }>;

const productFieldsSchema = z.object({
  barcode: z.string().trim().min(1).max(80).optional(),
  costCents: z.number().int().min(0).max(100_000_000),
  imageData: z.string().trim().max(2_000_000).nullish(),
  minimumStock: z.number().int().min(0).max(1_000_000),
  name: z.string().trim().min(2).max(120),
  salePriceCents: z.number().int().min(1).max(100_000_000),
  sku: z.string().trim().min(1).max(80).optional(),
  stockTrackingEnabled: z.boolean(),
});
const createProductSchema = productFieldsSchema
  .extend({
    initialStock: z.number().int().min(0).max(1_000_000).default(0),
    locationId: z.uuid().optional(),
  })
  .superRefine((value, context) => {
    if (!value.stockTrackingEnabled && value.initialStock > 0)
      context.addIssue({
        code: 'custom',
        message:
          'Activa el control de existencias para registrar stock inicial.',
        path: ['initialStock'],
      });
  });
const updateProductSchema = productFieldsSchema
  .partial()
  .extend({
    initialStock: z.number().int().min(0).max(1_000_000).optional(),
    isActive: z.boolean().optional(),
    locationId: z.uuid().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'Debes modificar al menos un campo.',
  );
const inventoryQuerySchema = z.object({
  includeInactive: z.coerce.boolean().default(false),
  locationId: z.uuid().optional(),
  lowStockOnly: z.coerce.boolean().default(false),
});
const adjustmentSchema = z.object({
  locationId: z.uuid(),
  notes: z.string().trim().min(2).max(500),
  productId: z.uuid(),
  quantityDelta: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine(
      (value) => value !== 0,
      'La cantidad del ajuste no puede ser cero.',
    ),
  type: z.enum(['opening', 'purchase', 'adjustment', 'return', 'loss']),
  unitCostCents: z.number().int().min(0).max(100_000_000).optional(),
});
const movementQuerySchema = z.object({
  locationId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  productId: z.uuid().optional(),
});
const reverseProductSaleSchema = z.object({
  reason: z.string().trim().min(3).max(240),
});

async function inventoryScope(database: DatabaseClient, userId: string) {
  const membership = await database.membership.findFirst({
    include: {
      memberLocations: {
        include: { location: true },
        where: { location: { isActive: true } },
      },
      organization: true,
    },
    where: { status: MembershipStatus.ACTIVE, userId },
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
      'No tienes permiso para administrar inventario.',
    );
  const locations =
    membership.role === MembershipRole.OWNER
      ? await database.location.findMany({
          orderBy: { createdAt: 'asc' },
          where: {
            isActive: true,
            organizationId: membership.organizationId,
          },
        })
      : membership.memberLocations.map(({ location }) => location);
  if (!locations.length)
    throw new ApiError(
      409,
      'INVENTORY_LOCATION_REQUIRED',
      'Configura al menos una sucursal para administrar inventario.',
    );
  return { locations, membership };
}

function selectedLocation(
  locations: Awaited<ReturnType<typeof inventoryScope>>['locations'],
  locationId: string | undefined,
) {
  const location = locationId
    ? locations.find(({ id }) => id === locationId)
    : locations[0];
  if (!location)
    throw new ApiError(
      404,
      'LOCATION_NOT_FOUND',
      'La sucursal no existe o no está dentro de tu alcance.',
    );
  return location;
}

function productResponse(
  product: {
    barcode: string | null;
    costCents: number;
    createdAt: Date;
    currencyCode: string;
    id: string;
    imageData: string | null;
    inventory: ReadonlyArray<{
      locationId: string;
      quantityOnHand: number;
    }>;
    isActive: boolean;
    minimumStock: number;
    name: string;
    salePriceCents: number;
    sku: string | null;
    stockTrackingEnabled: boolean;
    updatedAt: Date;
  },
  locationId: string,
) {
  const quantityOnHand =
    product.inventory.find((record) => record.locationId === locationId)
      ?.quantityOnHand ?? 0;
  return {
    barcode: product.barcode,
    costCents: product.costCents,
    createdAt: product.createdAt.toISOString(),
    currencyCode: product.currencyCode,
    id: product.id,
    imageData: product.imageData,
    isActive: product.isActive,
    isLowStock:
      product.stockTrackingEnabled && quantityOnHand <= product.minimumStock,
    minimumStock: product.minimumStock,
    name: product.name,
    quantityOnHand,
    salePriceCents: product.salePriceCents,
    sku: product.sku,
    stockTrackingEnabled: product.stockTrackingEnabled,
    updatedAt: product.updatedAt.toISOString(),
  };
}

async function lockInventory(
  transaction: Prisma.TransactionClient,
  locationId: string,
  productId: string,
) {
  await transaction.$queryRaw`
    WITH lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtext(${`${locationId}:${productId}`}))
    )
    SELECT 1 AS locked FROM lock
  `;
}

function validateAdjustmentDirection(input: z.infer<typeof adjustmentSchema>) {
  const positiveTypes = ['opening', 'purchase', 'return'];
  if (positiveTypes.includes(input.type) && input.quantityDelta < 0)
    throw new ApiError(
      400,
      'INVENTORY_DIRECTION_INVALID',
      'Este tipo de movimiento debe aumentar las existencias.',
    );
  if (input.type === 'loss' && input.quantityDelta > 0)
    throw new ApiError(
      400,
      'INVENTORY_DIRECTION_INVALID',
      'Una pérdida debe reducir las existencias.',
    );
}

export function registerInventoryRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
) {
  app.get('/v1/inventory', async (request) => {
    const { user } = await authenticate(database, request);
    const input = inventoryQuerySchema.parse(request.query);
    const currentScope = await inventoryScope(database, user.id);
    const location = selectedLocation(currentScope.locations, input.locationId);
    const products = await database.product.findMany({
      include: {
        inventory: {
          where: {
            locationId: { in: currentScope.locations.map(({ id }) => id) },
          },
        },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      where: {
        organizationId: currentScope.membership.organizationId,
        ...(input.includeInactive ? {} : { isActive: true }),
      },
    });
    const rows = products
      .map((product) => productResponse(product, location.id))
      .filter((product) => !input.lowStockOnly || product.isLowStock);
    return {
      accessibleLocations: currentScope.locations.map(({ id, name }) => ({
        id,
        name,
      })),
      currencyCode: location.currencyCode,
      locationId: location.id,
      products: rows,
      summary: {
        activeProducts: rows.filter(({ isActive }) => isActive).length,
        inventoryCostCents: rows.reduce(
          (total, product) =>
            total + product.costCents * product.quantityOnHand,
          0,
        ),
        lowStockProducts: rows.filter(({ isLowStock }) => isLowStock).length,
        totalUnits: rows.reduce(
          (total, product) => total + product.quantityOnHand,
          0,
        ),
      },
    };
  });

  app.post('/v1/inventory/products', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = createProductSchema.parse(request.body);
    const currentScope = await inventoryScope(database, user.id);
    const location = selectedLocation(currentScope.locations, input.locationId);
    try {
      const product = await database.$transaction(async (transaction) => {
        const created = await transaction.product.create({
          data: {
            barcode: input.barcode || null,
            costCents: input.costCents,
            imageData: input.imageData || null,
            currencyCode: currentScope.membership.organization.currencyCode,
            minimumStock: input.minimumStock,
            name: input.name,
            organizationId: currentScope.membership.organizationId,
            salePriceCents: input.salePriceCents,
            sku: input.sku || null,
            stockTrackingEnabled: input.stockTrackingEnabled,
          },
        });
        await transaction.locationInventory.createMany({
          data: currentScope.locations.map(({ id }) => ({
            locationId: id,
            productId: created.id,
            quantityOnHand: id === location.id ? input.initialStock : 0,
          })),
        });
        if (input.initialStock > 0) {
          await transaction.stockMovement.create({
            data: {
              createdByUserId: user.id,
              direction: StockDirection.IN,
              locationId: location.id,
              notes: 'Existencia inicial',
              organizationId: currentScope.membership.organizationId,
              productId: created.id,
              quantity: input.initialStock,
              resultingQuantity: input.initialStock,
              type: StockMovementType.OPENING,
              unitCostCents: input.costCents,
            },
          });
        }
        await transaction.auditLog.create({
          data: {
            action: 'inventory.product_created',
            actorUserId: user.id,
            afterData: {
              initialStock: input.initialStock,
              minimumStock: created.minimumStock,
              name: created.name,
              salePriceCents: created.salePriceCents,
            },
            entityId: created.id,
            entityType: 'product',
            locationId: location.id,
            organizationId: currentScope.membership.organizationId,
          },
        });
        return transaction.product.findUniqueOrThrow({
          include: { inventory: true },
          where: { id: created.id },
        });
      });
      return reply
        .code(201)
        .send({ product: productResponse(product, location.id) });
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw new ApiError(
          409,
          'PRODUCT_ALREADY_EXISTS',
          'Ya existe un producto con ese nombre, SKU o código de barras.',
        );
      throw error;
    }
  });

  app.patch('/v1/inventory/products/:productId', async (request) => {
    const { user } = await authenticate(database, request);
    const { productId } = z
      .object({ productId: z.uuid() })
      .parse(request.params);
    const input = updateProductSchema.parse(request.body);
    const currentScope = await inventoryScope(database, user.id);
    const location = selectedLocation(currentScope.locations, input.locationId);
    const existing = await database.product.findFirst({
      where: {
        id: productId,
        organizationId: currentScope.membership.organizationId,
      },
    });
    if (!existing)
      throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'El producto no existe.');
    if (
      input.initialStock !== undefined &&
      input.stockTrackingEnabled !== true &&
      !existing.stockTrackingEnabled
    )
      throw new ApiError(
        409,
        'STOCK_TRACKING_DISABLED',
        'Activa el control de existencias antes de modificar la existencia inicial.',
      );
    try {
      const product = await database.$transaction(async (transaction) => {
        const updated = await transaction.product.update({
          data: {
            ...(input.barcode !== undefined
              ? { barcode: input.barcode || null }
              : {}),
            ...(input.costCents !== undefined
              ? { costCents: input.costCents }
              : {}),
            ...(input.imageData !== undefined
              ? { imageData: input.imageData || null }
              : {}),
            ...(input.isActive !== undefined
              ? { isActive: input.isActive }
              : {}),
            ...(input.minimumStock !== undefined
              ? { minimumStock: input.minimumStock }
              : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.salePriceCents !== undefined
              ? { salePriceCents: input.salePriceCents }
              : {}),
            ...(input.sku !== undefined ? { sku: input.sku || null } : {}),
            ...(input.stockTrackingEnabled !== undefined
              ? { stockTrackingEnabled: input.stockTrackingEnabled }
              : {}),
          },
          where: { id: existing.id },
        });
        if (input.initialStock !== undefined) {
          await lockInventory(transaction, location.id, existing.id);
          const inventory = await transaction.locationInventory.upsert({
            create: {
              locationId: location.id,
              productId: existing.id,
              quantityOnHand: 0,
            },
            update: {},
            where: {
              locationId_productId: {
                locationId: location.id,
                productId: existing.id,
              },
            },
          });
          const quantityDelta = input.initialStock - inventory.quantityOnHand;
          if (quantityDelta !== 0) {
            await transaction.locationInventory.update({
              data: { quantityOnHand: input.initialStock },
              where: {
                locationId_productId: {
                  locationId: location.id,
                  productId: existing.id,
                },
              },
            });
            await transaction.stockMovement.create({
              data: {
                createdByUserId: user.id,
                direction:
                  quantityDelta > 0 ? StockDirection.IN : StockDirection.OUT,
                locationId: location.id,
                notes: 'Actualización de existencia inicial',
                organizationId: currentScope.membership.organizationId,
                productId: existing.id,
                quantity: Math.abs(quantityDelta),
                resultingQuantity: input.initialStock,
                type: StockMovementType.ADJUSTMENT,
                unitCostCents: input.costCents ?? existing.costCents,
              },
            });
          }
        }
        await transaction.auditLog.create({
          data: {
            action: 'inventory.product_updated',
            actorUserId: user.id,
            afterData: input,
            beforeData: {
              costCents: existing.costCents,
              isActive: existing.isActive,
              minimumStock: existing.minimumStock,
              name: existing.name,
              quantityOnHand: input.initialStock,
              salePriceCents: existing.salePriceCents,
            },
            entityId: existing.id,
            entityType: 'product',
            organizationId: currentScope.membership.organizationId,
          },
        });
        return transaction.product.findUniqueOrThrow({
          include: { inventory: true },
          where: { id: updated.id },
        });
      });
      return {
        product: productResponse(product, location.id),
      };
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw new ApiError(
          409,
          'PRODUCT_ALREADY_EXISTS',
          'Ya existe un producto con ese nombre, SKU o código de barras.',
        );
      throw error;
    }
  });

  app.post('/v1/inventory/adjustments', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const input = adjustmentSchema.parse(request.body);
    validateAdjustmentDirection(input);
    const currentScope = await inventoryScope(database, user.id);
    const location = selectedLocation(currentScope.locations, input.locationId);
    const result = await database.$transaction(async (transaction) => {
      await lockInventory(transaction, location.id, input.productId);
      const product = await transaction.product.findFirst({
        where: {
          id: input.productId,
          organizationId: currentScope.membership.organizationId,
        },
      });
      if (!product)
        throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'El producto no existe.');
      if (!product.stockTrackingEnabled)
        throw new ApiError(
          409,
          'STOCK_TRACKING_DISABLED',
          'Activa el control de existencias antes de registrar ajustes.',
        );
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
      const resultingQuantity = inventory.quantityOnHand + input.quantityDelta;
      if (resultingQuantity < 0)
        throw new ApiError(
          409,
          'INSUFFICIENT_STOCK',
          'El ajuste dejaría existencias negativas.',
        );
      await transaction.locationInventory.update({
        data: { quantityOnHand: resultingQuantity },
        where: {
          locationId_productId: {
            locationId: location.id,
            productId: product.id,
          },
        },
      });
      const movement = await transaction.stockMovement.create({
        data: {
          createdByUserId: user.id,
          direction:
            input.quantityDelta > 0 ? StockDirection.IN : StockDirection.OUT,
          locationId: location.id,
          notes: input.notes,
          organizationId: currentScope.membership.organizationId,
          productId: product.id,
          quantity: Math.abs(input.quantityDelta),
          resultingQuantity,
          type: input.type.toUpperCase() as StockMovementType,
          unitCostCents: input.unitCostCents ?? null,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'inventory.stock_adjusted',
          actorUserId: user.id,
          afterData: {
            movementId: movement.id,
            quantityDelta: input.quantityDelta,
            resultingQuantity,
            type: movement.type,
          },
          beforeData: { quantityOnHand: inventory.quantityOnHand },
          entityId: product.id,
          entityType: 'product_inventory',
          locationId: location.id,
          organizationId: currentScope.membership.organizationId,
        },
      });
      return { movement, product, resultingQuantity };
    });
    return reply.code(201).send({
      movement: {
        createdAt: result.movement.createdAt.toISOString(),
        direction: result.movement.direction.toLowerCase(),
        id: result.movement.id,
        notes: result.movement.notes,
        productId: result.product.id,
        productName: result.product.name,
        quantity: result.movement.quantity,
        resultingQuantity: result.resultingQuantity,
        type: result.movement.type.toLowerCase(),
      },
    });
  });

  app.get('/v1/inventory/movements', async (request) => {
    const { user } = await authenticate(database, request);
    const input = movementQuerySchema.parse(request.query);
    const currentScope = await inventoryScope(database, user.id);
    const location = selectedLocation(currentScope.locations, input.locationId);
    const where = {
      locationId: location.id,
      organizationId: currentScope.membership.organizationId,
      ...(input.productId ? { productId: input.productId } : {}),
    };
    const [total, movements] = await Promise.all([
      database.stockMovement.count({ where }),
      database.stockMovement.findMany({
        include: {
          cashMovement: { select: { reversedAt: true } },
          product: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        where,
      }),
    ]);
    return {
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      },
      rows: movements.map((movement) => ({
        cashMovementId: movement.cashMovementId,
        cashMovementReversedAt:
          movement.cashMovement?.reversedAt?.toISOString() ?? null,
        createdAt: movement.createdAt.toISOString(),
        direction: movement.direction.toLowerCase(),
        id: movement.id,
        notes: movement.notes,
        productId: movement.productId,
        productName: movement.product.name,
        quantity: movement.quantity,
        resultingQuantity: movement.resultingQuantity,
        type: movement.type.toLowerCase(),
        unitCostCents: movement.unitCostCents,
      })),
    };
  });

  app.post(
    '/v1/inventory/product-sales/:cashMovementId/reverse',
    async (request) => {
      const { user } = await authenticate(database, request);
      const { cashMovementId } = z
        .object({ cashMovementId: z.uuid() })
        .parse(request.params);
      const input = reverseProductSaleSchema.parse(request.body);
      const currentScope = await inventoryScope(database, user.id);
      return database.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          WITH lock AS MATERIALIZED (
            SELECT pg_advisory_xact_lock(hashtext(${cashMovementId}))
          )
          SELECT 1 AS locked FROM lock
        `;
        const sale = await transaction.cashMovement.findFirst({
          include: { cashRegisterSession: true, product: true },
          where: {
            id: cashMovementId,
            productId: { not: null },
            cashRegisterSession: {
              organizationId: currentScope.membership.organizationId,
            },
            type: CashMovementType.SALE,
          },
        });
        if (!sale || !sale.product || !sale.productId || !sale.productQuantity)
          throw new ApiError(
            404,
            'PRODUCT_SALE_NOT_FOUND',
            'La venta de producto no existe.',
          );
        if (sale.reversedAt)
          throw new ApiError(
            409,
            'PRODUCT_SALE_ALREADY_REVERSED',
            'La venta de producto ya fue revertida.',
          );
        if (sale.cashRegisterSession.status !== CashRegisterStatus.OPEN)
          throw new ApiError(
            409,
            'CASH_REGISTER_CLOSED',
            'Solo puedes revertir una venta mientras su caja sigue abierta.',
          );
        const location = selectedLocation(
          currentScope.locations,
          sale.cashRegisterSession.locationId ?? undefined,
        );
        let resultingQuantity: number | null = null;
        let stockMovementId: string | null = null;
        if (sale.product.stockTrackingEnabled) {
          await lockInventory(transaction, location.id, sale.productId);
          const inventory = await transaction.locationInventory.findUnique({
            where: {
              locationId_productId: {
                locationId: location.id,
                productId: sale.productId,
              },
            },
          });
          resultingQuantity =
            (inventory?.quantityOnHand ?? 0) + sale.productQuantity;
          await transaction.locationInventory.upsert({
            create: {
              locationId: location.id,
              productId: sale.productId,
              quantityOnHand: resultingQuantity,
            },
            update: { quantityOnHand: resultingQuantity },
            where: {
              locationId_productId: {
                locationId: location.id,
                productId: sale.productId,
              },
            },
          });
          const stockMovement = await transaction.stockMovement.create({
            data: {
              cashMovementId: sale.id,
              createdByUserId: user.id,
              direction: StockDirection.IN,
              locationId: location.id,
              notes: input.reason,
              organizationId: currentScope.membership.organizationId,
              productId: sale.productId,
              quantity: sale.productQuantity,
              resultingQuantity,
              type: StockMovementType.RETURN,
              unitCostCents: sale.product.costCents,
            },
          });
          stockMovementId = stockMovement.id;
        }
        const reversed = await transaction.cashMovement.update({
          data: {
            reversalReason: input.reason,
            reversedAt: new Date(),
            reversedByUserId: user.id,
          },
          where: { id: sale.id },
        });
        await transaction.auditLog.create({
          data: {
            action: 'inventory.product_sale_reversed',
            actorUserId: user.id,
            afterData: {
              cashMovementId: sale.id,
              quantityRestored: sale.product.stockTrackingEnabled
                ? sale.productQuantity
                : 0,
              reason: input.reason,
              resultingQuantity,
              stockMovementId,
            },
            entityId: sale.id,
            entityType: 'cash_movement',
            locationId: location.id,
            organizationId: currentScope.membership.organizationId,
          },
        });
        return {
          movement: {
            ...reversed,
            createdAt: reversed.createdAt.toISOString(),
            reversedAt: reversed.reversedAt?.toISOString() ?? null,
            type: reversed.type.toLowerCase(),
          },
          resultingQuantity,
        };
      });
    },
  );
}
