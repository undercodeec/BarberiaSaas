import { Prisma, type DatabaseClient } from '@barber-saas/database';
import {
  inventoryProductsPageQuerySchema,
  stockMovementsPageQuerySchema,
} from '@barber-saas/validation';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { decodeCursor, encodeCursor, sliceCursorPage } from './cursor-page';
import { ApiError } from './errors';
import { decodeDataUri, sendMedia } from './media-response';
import type { OperationalAccessLoader } from './operational-access';

type Authenticate = (
  database: DatabaseClient,
  request: FastifyRequest,
) => Promise<{ readonly user: { readonly id: string } }>;

interface InventoryAccess {
  readonly currencyCode: string;
  readonly locations: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly organizationId: string;
}

interface ProductRow {
  readonly activeProducts: number | bigint | null;
  readonly currencyCode: string;
  readonly costCents: number;
  readonly hasImage: boolean;
  readonly id: string;
  readonly isActive: boolean;
  readonly isLowStock: boolean;
  readonly inventoryCostCents: number | bigint | null;
  readonly minimumStock: number;
  readonly name: string;
  readonly quantityOnHand: number;
  readonly salePriceCents: number;
  readonly sku: string | null;
  readonly stockTrackingEnabled: boolean;
  readonly totalUnits: number | bigint | null;
  readonly lowStockProducts: number | bigint | null;
}

interface InventorySummaryRow {
  readonly activeProducts: number | bigint;
  readonly inventoryCostCents: number | bigint;
  readonly lowStockProducts: number | bigint;
  readonly totalUnits: number | bigint;
}

interface MovementRow {
  readonly cashMovementId: string | null;
  readonly cashMovementReversedAt: Date | null;
  readonly createdAt: Date;
  readonly direction: string;
  readonly id: string;
  readonly notes: string | null;
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly resultingQuantity: number;
  readonly type: string;
  readonly unitCostCents: number | null;
}

function requireInventoryAccess(
  access: Awaited<ReturnType<OperationalAccessLoader>>,
): InventoryAccess {
  if (access.role !== 'OWNER' && access.role !== 'MANAGER') {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'No tienes permiso para administrar inventario.',
    );
  }
  const assigned = new Set(access.assignedLocationIds);
  const locations = access.activeOrganizationLocations.filter(
    (location) => access.role === 'OWNER' || assigned.has(location.id),
  );
  if (locations.length === 0) {
    throw new ApiError(
      409,
      'INVENTORY_LOCATION_REQUIRED',
      'Configura al menos una sucursal para administrar inventario.',
    );
  }
  return {
    currencyCode: access.currencyCode,
    locations: locations.map(({ id, name }) => ({ id, name })),
    organizationId: access.organizationId,
  };
}

function requireLocation(access: InventoryAccess, locationId: string) {
  const location = access.locations.find((candidate) => candidate.id === locationId);
  if (!location) {
    throw new ApiError(
      404,
      'LOCATION_NOT_FOUND',
      'La sucursal no existe o no estÃ¡ dentro de tu alcance.',
    );
  }
  return location;
}

function summarySql(organizationId: string, locationId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE product.is_active)::integer AS "activeProducts",
      COALESCE(SUM(product.cost_cents * COALESCE(inventory.quantity_on_hand, 0)), 0)::bigint AS "inventoryCostCents",
      COUNT(*) FILTER (
        WHERE product.stock_tracking_enabled = TRUE
          AND COALESCE(inventory.quantity_on_hand, 0) <= product.minimum_stock
      )::integer AS "lowStockProducts",
      COALESCE(SUM(COALESCE(inventory.quantity_on_hand, 0)), 0)::bigint AS "totalUnits"
    FROM products AS product
    LEFT JOIN location_inventory AS inventory
      ON inventory.product_id = product.id
      AND inventory.location_id = ${locationId}::uuid
    WHERE product.organization_id = ${organizationId}::uuid
  `;
}

function mapSummary(row: InventorySummaryRow, locationId: string) {
  return {
    activeProducts: Number(row.activeProducts),
    inventoryCostCents: Number(row.inventoryCostCents),
    locationId,
    lowStockProducts: Number(row.lowStockProducts),
    totalUnits: Number(row.totalUnits),
  };
}

export function registerInventoryV2Routes(
  app: FastifyInstance,
  database: DatabaseClient,
  authenticate: Authenticate,
  loadOperationalAccess: OperationalAccessLoader,
): void {
  app.get('/v2/inventory/products', async (request) => {
    const { user } = await authenticate(database, request);
    const access = requireInventoryAccess(await loadOperationalAccess(request, user.id));
    const input = inventoryProductsPageQuerySchema.parse(request.query);
    requireLocation(access, input.locationId);
    const cursor = input.cursor
      ? decodeCursor(input.cursor, 'inventory-product')
      : undefined;
    const cursorName = cursor?.values[0];
    const cursorActive = cursor?.values[1];
    if (
      cursor &&
      (typeof cursorName !== 'string' || typeof cursorActive !== 'boolean')
    ) {
      throw new ApiError(400, 'INVALID_CURSOR', 'El cursor no es vÃ¡lido.');
    }
    const search = input.search?.replaceAll(/[\\%_]/gu, (value) => `\\${value}`);
    const searchSql = search
      ? Prisma.sql`AND LOWER(product.name) LIKE '%' || LOWER(${search}) || '%' ESCAPE '\\'`
      : Prisma.empty;
    const activeSql =
      input.isActive === undefined
        ? Prisma.empty
        : Prisma.sql`AND product.is_active = ${input.isActive}`;
    const lowStockSql = input.lowStock
      ? Prisma.sql`AND product.stock_tracking_enabled = TRUE AND COALESCE(inventory.quantity_on_hand, 0) <= product.minimum_stock`
      : Prisma.empty;
    const cursorSql = cursor
      ? Prisma.sql`AND (
          product.is_active < ${cursorActive}
          OR (
            product.is_active = ${cursorActive}
            AND (product.name, product.id) > (${cursorName}, ${cursor.id}::uuid)
          )
        )`
      : Prisma.empty;
    const summaryJoin = cursor
      ? Prisma.empty
      : Prisma.sql`CROSS JOIN LATERAL (${summarySql(access.organizationId, input.locationId)}) AS summary`;
    const summarySelect = cursor
      ? Prisma.sql`
          NULL::integer AS "activeProducts",
          NULL::bigint AS "inventoryCostCents",
          NULL::integer AS "lowStockProducts",
          NULL::bigint AS "totalUnits"
        `
      : Prisma.sql`
          summary."activeProducts",
          summary."inventoryCostCents",
          summary."lowStockProducts",
          summary."totalUnits"
        `;
    const products = await database.$queryRaw<readonly ProductRow[]>(
      Prisma.sql`
        SELECT
          product.id,
          product.name,
          product.is_active AS "isActive",
          product.minimum_stock AS "minimumStock",
          product.cost_cents AS "costCents",
          product.sale_price_cents AS "salePriceCents",
          product.sku,
          product.currency_code AS "currencyCode",
          product.stock_tracking_enabled AS "stockTrackingEnabled",
          COALESCE(inventory.quantity_on_hand, 0)::integer AS "quantityOnHand",
          (product.image_data IS NOT NULL) AS "hasImage",
          (product.stock_tracking_enabled = TRUE AND COALESCE(inventory.quantity_on_hand, 0) <= product.minimum_stock) AS "isLowStock",
          ${summarySelect}
        FROM products AS product
        LEFT JOIN location_inventory AS inventory
          ON inventory.product_id = product.id
          AND inventory.location_id = ${input.locationId}::uuid
        ${summaryJoin}
        WHERE product.organization_id = ${access.organizationId}::uuid
          ${activeSql}
          ${lowStockSql}
          ${searchSql}
          ${cursorSql}
        ORDER BY product.is_active DESC, product.name ASC, product.id ASC
        LIMIT ${input.limit + 1}
      `,
    );
    const page = sliceCursorPage(products, input.limit, (product) =>
      encodeCursor('inventory-product', [product.name, product.isActive], product.id),
    );
    const firstProduct = page.items[0];
    const summary =
      cursor ||
      !firstProduct ||
      firstProduct.activeProducts === null ||
      firstProduct.inventoryCostCents === null ||
      firstProduct.lowStockProducts === null ||
      firstProduct.totalUnits === null
        ? null
        : mapSummary(
            {
              activeProducts: firstProduct.activeProducts,
              inventoryCostCents: firstProduct.inventoryCostCents,
              lowStockProducts: firstProduct.lowStockProducts,
              totalUnits: firstProduct.totalUnits,
            },
            input.locationId,
          );
    return {
      accessibleLocations: access.locations,
      currencyCode: access.currencyCode,
      items: page.items.map((product) => ({
        costCents: product.costCents,
        currencyCode: product.currencyCode,
        id: product.id,
        imageUrl: product.hasImage
          ? `/v2/inventory/products/${product.id}/image`
          : null,
        isActive: product.isActive,
        isLowStock: product.isLowStock,
        minimumStock: product.minimumStock,
        name: product.name,
        quantityOnHand: product.quantityOnHand,
        salePriceCents: product.salePriceCents,
        sku: product.sku,
        stockTrackingEnabled: product.stockTrackingEnabled,
      })),
      locationId: input.locationId,
      nextCursor: page.nextCursor,
      summary,
    };
  });

  app.get('/v2/inventory/summary', async (request) => {
    const { user } = await authenticate(database, request);
    const access = requireInventoryAccess(await loadOperationalAccess(request, user.id));
    const { locationId } = inventoryProductsPageQuerySchema
      .pick({ locationId: true })
      .parse(request.query);
    requireLocation(access, locationId);
    const row = (await database.$queryRaw<readonly InventorySummaryRow[]>(
      summarySql(access.organizationId, locationId),
    ))[0]!;
    return mapSummary(row, locationId);
  });

  app.get('/v2/inventory/movements', async (request) => {
    const { user } = await authenticate(database, request);
    const access = requireInventoryAccess(await loadOperationalAccess(request, user.id));
    const input = stockMovementsPageQuerySchema.parse(request.query);
    requireLocation(access, input.locationId);
    const cursor = input.cursor
      ? decodeCursor(input.cursor, 'stock-movement')
      : undefined;
    const cursorDateValue = cursor?.values[0];
    if (cursor && typeof cursorDateValue !== 'string') {
      throw new ApiError(400, 'INVALID_CURSOR', 'El cursor no es vÃ¡lido.');
    }
    const cursorDate =
      typeof cursorDateValue === 'string'
        ? new Date(cursorDateValue)
        : undefined;
    if (cursorDate && Number.isNaN(cursorDate.valueOf())) {
      throw new ApiError(400, 'INVALID_CURSOR', 'El cursor no es vÃ¡lido.');
    }
    const cursorSql = cursor && cursorDate
      ? Prisma.sql`AND (movement.created_at, movement.id) < (${cursorDate}, ${cursor.id}::uuid)`
      : Prisma.empty;
    const productSql = input.productId
      ? Prisma.sql`AND movement.product_id = ${input.productId}::uuid`
      : Prisma.empty;
    const movements = await database.$queryRaw<readonly MovementRow[]>(
      Prisma.sql`
        SELECT
          movement.id,
          movement.product_id AS "productId",
          product.name AS "productName",
          movement.cash_movement_id AS "cashMovementId",
          cash_movement.reversed_at AS "cashMovementReversedAt",
          movement.created_at AS "createdAt",
          movement.direction,
          movement.notes,
          movement.quantity,
          movement.resulting_quantity AS "resultingQuantity",
          movement.type,
          movement.unit_cost_cents AS "unitCostCents"
        FROM stock_movements AS movement
        INNER JOIN products AS product ON product.id = movement.product_id
        LEFT JOIN cash_movements AS cash_movement ON cash_movement.id = movement.cash_movement_id
        WHERE movement.organization_id = ${access.organizationId}::uuid
          AND movement.location_id = ${input.locationId}::uuid
          ${productSql}
          ${cursorSql}
        ORDER BY movement.created_at DESC, movement.id DESC
        LIMIT ${input.limit + 1}
      `,
    );
    const page = sliceCursorPage(movements, input.limit, (movement) =>
      encodeCursor('stock-movement', [movement.createdAt.toISOString()], movement.id),
    );
    return {
      items: page.items.map((movement) => ({
        cashMovementId: movement.cashMovementId,
        cashMovementReversedAt: movement.cashMovementReversedAt?.toISOString() ?? null,
        createdAt: movement.createdAt.toISOString(),
        direction: movement.direction.toLowerCase(),
        id: movement.id,
        notes: movement.notes,
        productId: movement.productId,
        productName: movement.productName,
        quantity: movement.quantity,
        resultingQuantity: movement.resultingQuantity,
        type: movement.type.toLowerCase(),
        unitCostCents: movement.unitCostCents,
      })),
      nextCursor: page.nextCursor,
    };
  });

  app.get('/v2/inventory/products/:productId/image', async (request, reply) => {
    const { user } = await authenticate(database, request);
    const access = requireInventoryAccess(await loadOperationalAccess(request, user.id));
    const { productId } = request.params as { readonly productId: string };
    const product = await database.product.findFirst({
      select: { imageData: true },
      where: { id: productId, imageData: { not: null }, organizationId: access.organizationId },
    });
    if (!product?.imageData) {
      throw new ApiError(404, 'PRODUCT_IMAGE_NOT_FOUND', 'La imagen no existe.');
    }
    return sendMedia(reply, decodeDataUri(product.imageData), 'private');
  });
}
