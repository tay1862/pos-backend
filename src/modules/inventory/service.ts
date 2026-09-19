import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import type { Database } from "../../db";
import {
  locations,
  productVariants,
  purchaseOrderItems,
  purchaseOrders,
  purchaseReceiptItems,
  purchaseReceipts,
  recipeItems,
  recipes,
  stockCountItems,
  stockCounts,
  stockMovements,
  stockTransferItems,
  stockTransfers,
  warehouses
} from "../../db/schema";
import type { AppBindings, AppDependencies } from "../../http/context";
import { parseJsonBody } from "../../http/validation";
import { AppError } from "../../infra/errors";
import { writeAudit } from "../audit/service";
import { requireLocationAccess, requireOrganizationAccess } from "../platform/access";
import { addDecimals, compareDecimals, subtractDecimal } from "../sales/decimal";

const decimalString = z.string().regex(/^-?\d+(\.\d{1,6})?$/);
const positiveDecimalString = z.string().regex(/^\d+(\.\d{1,6})?$/).refine((value) => compareDecimals(value, "0.000000") > 0, "Must be positive");

const warehouseCreateSchema = z.object({
  locationId: z.string().uuid(),
  code: z.string().min(1).max(32),
  name: z.string().min(1),
  active: z.boolean().default(true)
});

const warehouseUpdateSchema = warehouseCreateSchema.partial().extend({ version: z.number().int().positive() });

const adjustmentSchema = z.object({
  warehouseId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantityDelta: decimalString,
  unitCost: positiveDecimalString.optional(),
  reason: z.string().min(1)
});

const stockCountCreateSchema = z.object({
  warehouseId: z.string().uuid(),
  notes: z.string().optional(),
  items: z.array(z.object({ variantId: z.string().uuid(), countedQuantity: positiveDecimalString.or(z.literal("0").or(z.literal("0.000000"))) })).min(1)
});

const postVersionSchema = z.object({ version: z.number().int().positive() });

const transferCreateSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  notes: z.string().optional(),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: positiveDecimalString })).min(1)
});

const purchaseOrderCreateSchema = z.object({
  warehouseId: z.string().uuid(),
  supplierName: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: positiveDecimalString, unitCost: positiveDecimalString.default("0.000000") })).min(1)
});

const receivePurchaseSchema = z.object({
  items: z.array(z.object({ purchaseOrderItemId: z.string().uuid(), quantity: positiveDecimalString, unitCost: positiveDecimalString.optional() })).min(1)
});

const recipeCreateSchema = z.object({
  outputVariantId: z.string().uuid(),
  name: z.string().min(1),
  outputQuantity: positiveDecimalString.default("1.000000"),
  items: z.array(z.object({ inputVariantId: z.string().uuid(), quantity: positiveDecimalString })).min(1)
});

export async function listWarehouses(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "inventory.view");
  const rows = await db.select().from(warehouses).where(and(eq(warehouses.organizationId, access.organizationId), access.isOwner ? undefined : inArray(warehouses.locationId, access.locationIds))).orderBy(asc(warehouses.name));
  return c.json({ data: rows });
}

export async function createWarehouse(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "inventory.manage");
  const body = await parseJsonBody(c, warehouseCreateSchema);
  await requireLocationAccess(db, access, body.locationId);
  const [location] = await db.select({ id: locations.id }).from(locations).where(and(eq(locations.organizationId, access.organizationId), eq(locations.id, body.locationId), eq(locations.active, true))).limit(1);
  if (!location) throw new AppError("location_not_found", "Location was not found or inactive", 404);
  const [created] = await db.insert(warehouses).values({ ...body, code: body.code.toUpperCase(), organizationId: access.organizationId }).returning();
  await writeAudit(db, auditInput(c, access, "CREATE", "warehouse", created?.id));
  return c.json({ data: created }, 201);
}

export async function updateWarehouse(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "inventory.manage");
  const body = await parseJsonBody(c, warehouseUpdateSchema);
  const id = readId(c);
  if (body.locationId) {
    await ensureExists(db, locations, access.organizationId, body.locationId, "location_not_found");
    await requireLocationAccess(db, access, body.locationId);
  }
  const [updated] = await db
    .update(warehouses)
    .set({ locationId: body.locationId, code: body.code?.toUpperCase(), name: body.name, active: body.active, version: sql`${warehouses.version} + 1` })
    .where(and(eq(warehouses.organizationId, access.organizationId), eq(warehouses.id, id), eq(warehouses.version, body.version)))
    .returning();

  if (!updated) throw new AppError("version_conflict", "Warehouse was changed by another request", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "warehouse", id));
  return c.json({ data: updated });
}

export async function getStockOnHand(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "inventory.view");
  const url = new URL(c.req.url);
  const warehouseId = url.searchParams.get("warehouseId");
  const variantId = url.searchParams.get("variantId");
  const assignedWarehouseIds = access.isOwner
    ? []
    : (await db.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.organizationId, access.organizationId), inArray(warehouses.locationId, access.locationIds)))).map((row) => row.id);
  const rows = await db
    .select({
      warehouseId: stockMovements.warehouseId,
      variantId: stockMovements.variantId,
      quantity: sql<string>`coalesce(sum(${stockMovements.quantityDelta}), 0)::text`
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.organizationId, access.organizationId),
        warehouseId ? eq(stockMovements.warehouseId, warehouseId) : undefined,
        variantId ? eq(stockMovements.variantId, variantId) : undefined,
        access.isOwner ? undefined : inArray(stockMovements.warehouseId, assignedWarehouseIds)
      )
    )
    .groupBy(stockMovements.warehouseId, stockMovements.variantId)
    .limit(500);

  return c.json({ data: rows });
}

export async function createAdjustment(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "inventory.manage");
  const body = await parseJsonBody(c, adjustmentSchema);
  const [warehouse] = await db.select().from(warehouses).where(and(eq(warehouses.organizationId, access.organizationId), eq(warehouses.id, body.warehouseId), eq(warehouses.active, true))).limit(1);
  if (!warehouse) throw new AppError("warehouse_not_found", "Warehouse was not found or is inactive", 404);
  await requireLocationAccess(db, access, warehouse.locationId);
  await ensureExists(db, productVariants, access.organizationId, body.variantId, "variant_not_found");
  const movement = await db.transaction(async (tx) => {
    await lockAggregate(tx, `stock:${access.organizationId}:${body.warehouseId}:${body.variantId}`);
    const [created] = await tx.insert(stockMovements).values({ organizationId: access.organizationId, warehouseId: body.warehouseId, variantId: body.variantId, type: "ADJUSTMENT", quantityDelta: body.quantityDelta, unitCost: body.unitCost, reason: body.reason, createdByUserId: access.actor.userId }).returning();
    return created;
  });

  await writeAudit(db, auditInput(c, access, "CREATE", "stock_movement", movement?.id));
  return c.json({ data: movement }, 201);
}

export async function createStockCount(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "inventory.manage");
  const body = await parseJsonBody(c, stockCountCreateSchema);
  const created = await db.transaction(async (tx) => {
    const [warehouse] = await tx.select().from(warehouses).where(and(eq(warehouses.organizationId, access.organizationId), eq(warehouses.id, body.warehouseId), eq(warehouses.active, true))).limit(1);
    if (!warehouse) throw new AppError("warehouse_not_found", "Warehouse was not found or is inactive", 404);
    await requireLocationAccess(tx as unknown as Database, access, warehouse.locationId);
    const [count] = await tx
      .insert(stockCounts)
      .values({ organizationId: access.organizationId, warehouseId: body.warehouseId, notes: body.notes, createdByUserId: access.actor.userId })
      .returning();
    if (!count) throw new AppError("stock_count_create_failed", "Unable to create stock count", 500);

    const items = [];
    for (const item of body.items) {
      await ensureExists(tx, productVariants, access.organizationId, item.variantId, "variant_not_found");
      const expected = await onHand(tx, access.organizationId, body.warehouseId, item.variantId);
      items.push({ organizationId: access.organizationId, stockCountId: count.id, variantId: item.variantId, countedQuantity: item.countedQuantity, expectedQuantitySnapshot: expected });
    }

    await tx.insert(stockCountItems).values(items);
    await writeAudit(tx, auditInput(c, access, "CREATE", "stock_count", count.id));
    return count;
  });

  return c.json({ data: created }, 201);
}

export async function postStockCount(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "inventory.manage");
  const id = readId(c);
  const body = await parseJsonBody(c, postVersionSchema);

  const posted = await db.transaction(async (tx) => {
    await lockAggregate(tx, `stock-count:${access.organizationId}:${id}`);
    const [count] = await tx.select().from(stockCounts).where(and(eq(stockCounts.organizationId, access.organizationId), eq(stockCounts.id, id), eq(stockCounts.version, body.version), eq(stockCounts.status, "DRAFT"))).limit(1);
    if (!count) throw new AppError("version_conflict", "Stock count was changed or is not draft", 409);
    const [countWarehouse] = await tx.select().from(warehouses).where(and(eq(warehouses.organizationId, access.organizationId), eq(warehouses.id, count.warehouseId))).limit(1);
    if (!countWarehouse) throw new AppError("warehouse_not_found", "Stock count warehouse was not found", 404);
    await requireLocationAccess(tx as unknown as Database, access, countWarehouse.locationId);
    const items = await tx.select().from(stockCountItems).where(and(eq(stockCountItems.organizationId, access.organizationId), eq(stockCountItems.stockCountId, id)));
    for (const item of items) {
      await lockAggregate(tx, `stock:${access.organizationId}:${count.warehouseId}:${item.variantId}`);
      const current = await onHand(tx, access.organizationId, count.warehouseId, item.variantId);
      const delta = subtractDecimal(item.countedQuantity, current);
      if (compareDecimals(delta, "0.000000") !== 0) {
        await tx.insert(stockMovements).values({
          organizationId: access.organizationId,
          warehouseId: count.warehouseId,
          variantId: item.variantId,
          type: "COUNT",
          quantityDelta: delta,
          referenceType: "stock_count",
          referenceId: count.id,
          reason: "Stock count posted",
          createdByUserId: access.actor.userId
        });
      }
    }
    const [updated] = await tx.update(stockCounts).set({ status: "POSTED", postedAt: new Date(), version: sql`${stockCounts.version} + 1` }).where(and(eq(stockCounts.organizationId, access.organizationId), eq(stockCounts.id, count.id), eq(stockCounts.version, body.version), eq(stockCounts.status, "DRAFT"))).returning();
    if (!updated) throw new AppError("version_conflict", "Stock count was changed while posting", 409);
    await writeAudit(tx, auditInput(c, access, "UPDATE", "stock_count", count.id));
    return updated;
  });

  return c.json({ data: posted });
}

export async function createTransfer(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "inventory.manage");
  const body = await parseJsonBody(c, transferCreateSchema);
  if (body.fromWarehouseId === body.toWarehouseId) throw new AppError("invalid_transfer", "Transfer warehouses must be different", 400);
  const created = await db.transaction(async (tx) => {
    const [fromWarehouse] = await tx.select().from(warehouses).where(and(eq(warehouses.organizationId, access.organizationId), eq(warehouses.id, body.fromWarehouseId), eq(warehouses.active, true))).limit(1);
    const [toWarehouse] = await tx.select().from(warehouses).where(and(eq(warehouses.organizationId, access.organizationId), eq(warehouses.id, body.toWarehouseId), eq(warehouses.active, true))).limit(1);
    if (!fromWarehouse) throw new AppError("from_warehouse_not_found", "Source warehouse was not found or inactive", 404);
    if (!toWarehouse) throw new AppError("to_warehouse_not_found", "Destination warehouse was not found or inactive", 404);
    await requireLocationAccess(tx as unknown as Database, access, fromWarehouse.locationId);
    await requireLocationAccess(tx as unknown as Database, access, toWarehouse.locationId);
    const [transfer] = await tx
      .insert(stockTransfers)
      .values({ organizationId: access.organizationId, fromWarehouseId: body.fromWarehouseId, toWarehouseId: body.toWarehouseId, notes: body.notes, createdByUserId: access.actor.userId })
      .returning();
    if (!transfer) throw new AppError("transfer_create_failed", "Unable to create transfer", 500);
    for (const item of body.items) {
      await ensureExists(tx, productVariants, access.organizationId, item.variantId, "variant_not_found");
    }
    await tx.insert(stockTransferItems).values(body.items.map((item) => ({ organizationId: access.organizationId, stockTransferId: transfer.id, variantId: item.variantId, quantity: item.quantity })));
    await writeAudit(tx, auditInput(c, access, "CREATE", "stock_transfer", transfer.id));
    return transfer;
  });
  return c.json({ data: created }, 201);
}

export async function postTransfer(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "inventory.manage");
  const id = readId(c);
  const body = await parseJsonBody(c, postVersionSchema);
  const posted = await db.transaction(async (tx) => {
    await lockAggregate(tx, `stock-transfer:${access.organizationId}:${id}`);
    const [transfer] = await tx.select().from(stockTransfers).where(and(eq(stockTransfers.organizationId, access.organizationId), eq(stockTransfers.id, id), eq(stockTransfers.version, body.version), eq(stockTransfers.status, "DRAFT"))).limit(1);
    if (!transfer) throw new AppError("version_conflict", "Transfer was changed or is not draft", 409);
    const [fromWarehouse] = await tx.select().from(warehouses).where(and(eq(warehouses.organizationId, access.organizationId), eq(warehouses.id, transfer.fromWarehouseId))).limit(1);
    const [toWarehouse] = await tx.select().from(warehouses).where(and(eq(warehouses.organizationId, access.organizationId), eq(warehouses.id, transfer.toWarehouseId))).limit(1);
    if (!fromWarehouse || !toWarehouse) throw new AppError("warehouse_not_found", "Transfer warehouse was not found", 404);
    await requireLocationAccess(tx as unknown as Database, access, fromWarehouse.locationId);
    await requireLocationAccess(tx as unknown as Database, access, toWarehouse.locationId);
    const items = await tx.select().from(stockTransferItems).where(and(eq(stockTransferItems.organizationId, access.organizationId), eq(stockTransferItems.stockTransferId, id)));
    for (const item of items) {
      await lockAggregate(tx, `stock:${access.organizationId}:${transfer.fromWarehouseId}:${item.variantId}`);
      await lockAggregate(tx, `stock:${access.organizationId}:${transfer.toWarehouseId}:${item.variantId}`);
      await tx.insert(stockMovements).values([
        { organizationId: access.organizationId, warehouseId: transfer.fromWarehouseId, variantId: item.variantId, type: "TRANSFER_OUT", quantityDelta: `-${item.quantity}`, referenceType: "stock_transfer", referenceId: transfer.id, createdByUserId: access.actor.userId },
        { organizationId: access.organizationId, warehouseId: transfer.toWarehouseId, variantId: item.variantId, type: "TRANSFER_IN", quantityDelta: item.quantity, referenceType: "stock_transfer", referenceId: transfer.id, createdByUserId: access.actor.userId }
      ]);
    }
    const [updated] = await tx.update(stockTransfers).set({ status: "POSTED", postedAt: new Date(), version: sql`${stockTransfers.version} + 1` }).where(and(eq(stockTransfers.organizationId, access.organizationId), eq(stockTransfers.id, transfer.id), eq(stockTransfers.version, body.version), eq(stockTransfers.status, "DRAFT"))).returning();
    if (!updated) throw new AppError("version_conflict", "Transfer was changed while posting", 409);
    await writeAudit(tx, auditInput(c, access, "UPDATE", "stock_transfer", transfer.id));
    return updated;
  });
  return c.json({ data: posted });
}

export async function createPurchaseOrder(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "purchasing.manage");
  const body = await parseJsonBody(c, purchaseOrderCreateSchema);
  const created = await db.transaction(async (tx) => {
    const [warehouse] = await tx.select().from(warehouses).where(and(eq(warehouses.organizationId, access.organizationId), eq(warehouses.id, body.warehouseId), eq(warehouses.active, true))).limit(1);
    if (!warehouse) throw new AppError("warehouse_not_found", "Warehouse was not found or inactive", 404);
    await requireLocationAccess(tx as unknown as Database, access, warehouse.locationId);
    const [purchase] = await tx.insert(purchaseOrders).values({ organizationId: access.organizationId, warehouseId: body.warehouseId, supplierName: body.supplierName, notes: body.notes, createdByUserId: access.actor.userId }).returning();
    if (!purchase) throw new AppError("purchase_order_create_failed", "Unable to create purchase order", 500);
    for (const item of body.items) await ensureExists(tx, productVariants, access.organizationId, item.variantId, "variant_not_found");
    await tx.insert(purchaseOrderItems).values(body.items.map((item) => ({ organizationId: access.organizationId, purchaseOrderId: purchase.id, variantId: item.variantId, quantity: item.quantity, unitCost: item.unitCost })));
    await writeAudit(tx, auditInput(c, access, "CREATE", "purchase_order", purchase.id));
    return purchase;
  });
  return c.json({ data: created }, 201);
}

export async function orderPurchase(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "purchasing.manage");
  const id = readId(c);
  const body = await parseJsonBody(c, postVersionSchema);
  const [purchase] = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.organizationId, access.organizationId), eq(purchaseOrders.id, id), eq(purchaseOrders.status, "DRAFT"))).limit(1);
  if (!purchase) throw new AppError("purchase_order_not_found", "Draft purchase order was not found", 404);
  const [warehouse] = await db.select().from(warehouses).where(and(eq(warehouses.organizationId, access.organizationId), eq(warehouses.id, purchase.warehouseId))).limit(1);
  if (!warehouse) throw new AppError("warehouse_not_found", "Purchase warehouse was not found", 404);
  await requireLocationAccess(db, access, warehouse.locationId);
  const [updated] = await db.update(purchaseOrders).set({ status: "ORDERED", orderedAt: new Date(), version: sql`${purchaseOrders.version} + 1` }).where(and(eq(purchaseOrders.organizationId, access.organizationId), eq(purchaseOrders.id, id), eq(purchaseOrders.version, body.version), eq(purchaseOrders.status, "DRAFT"))).returning();
  if (!updated) throw new AppError("version_conflict", "Purchase order was changed or is not draft", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "purchase_order", id));
  return c.json({ data: updated });
}

export async function receivePurchase(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "purchasing.manage");
  const id = readId(c);
  const body = await parseJsonBody(c, receivePurchaseSchema);
  const receivedItemIds = body.items.map((item) => item.purchaseOrderItemId);
  if (new Set(receivedItemIds).size !== receivedItemIds.length) throw new AppError("duplicate_purchase_items", "A purchase order item may appear only once per receipt", 400);
  const created = await db.transaction(async (tx) => {
    await lockAggregate(tx, `purchase-order:${access.organizationId}:${id}`);
    const [purchase] = await tx.select().from(purchaseOrders).where(and(eq(purchaseOrders.organizationId, access.organizationId), eq(purchaseOrders.id, id))).limit(1);
    if (!purchase) throw new AppError("purchase_order_not_found", "Purchase order was not found", 404);
    const [warehouse] = await tx.select().from(warehouses).where(and(eq(warehouses.organizationId, access.organizationId), eq(warehouses.id, purchase.warehouseId))).limit(1);
    if (!warehouse) throw new AppError("warehouse_not_found", "Purchase warehouse was not found", 404);
    await requireLocationAccess(tx as unknown as Database, access, warehouse.locationId);
    if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(purchase.status)) throw new AppError("purchase_order_not_receivable", "Only ordered purchase orders can be received", 409);
    const [receipt] = await tx.insert(purchaseReceipts).values({ organizationId: access.organizationId, purchaseOrderId: purchase.id, warehouseId: purchase.warehouseId, createdByUserId: access.actor.userId }).returning();
    if (!receipt) throw new AppError("purchase_receipt_create_failed", "Unable to create purchase receipt", 500);
    for (const line of body.items) {
      const [poItem] = await tx.select().from(purchaseOrderItems).where(and(eq(purchaseOrderItems.organizationId, access.organizationId), eq(purchaseOrderItems.id, line.purchaseOrderItemId), eq(purchaseOrderItems.purchaseOrderId, purchase.id))).limit(1);
      if (!poItem) throw new AppError("purchase_order_item_not_found", "Purchase order item was not found", 404);
      const [received] = await tx
        .select({ quantity: sql<string>`coalesce(sum(${purchaseReceiptItems.quantity}), 0)::text` })
        .from(purchaseReceiptItems)
        .innerJoin(purchaseReceipts, eq(purchaseReceipts.id, purchaseReceiptItems.purchaseReceiptId))
        .where(and(eq(purchaseReceiptItems.organizationId, access.organizationId), eq(purchaseReceiptItems.purchaseOrderItemId, poItem.id), eq(purchaseReceipts.purchaseOrderId, purchase.id)));
      const remaining = subtractDecimal(poItem.quantity, received?.quantity ?? "0.000000");
      if (compareDecimals(line.quantity, remaining) > 0) throw new AppError("purchase_quantity_exceeded", "Received quantity exceeds the purchase order quantity", 409);
      const unitCost = line.unitCost ?? poItem.unitCost;
      await tx.insert(purchaseReceiptItems).values({ organizationId: access.organizationId, purchaseReceiptId: receipt.id, purchaseOrderItemId: poItem.id, variantId: poItem.variantId, quantity: line.quantity, unitCost });
      await tx.insert(stockMovements).values({ organizationId: access.organizationId, warehouseId: purchase.warehouseId, variantId: poItem.variantId, type: "PURCHASE_RECEIPT", quantityDelta: line.quantity, unitCost, referenceType: "purchase_receipt", referenceId: receipt.id, createdByUserId: access.actor.userId });
    }
    const allItems = await tx.select().from(purchaseOrderItems).where(and(eq(purchaseOrderItems.organizationId, access.organizationId), eq(purchaseOrderItems.purchaseOrderId, purchase.id)));
    let fullyReceived = true;
    for (const item of allItems) {
      const [received] = await tx
        .select({ quantity: sql<string>`coalesce(sum(${purchaseReceiptItems.quantity}), 0)::text` })
        .from(purchaseReceiptItems)
        .innerJoin(purchaseReceipts, eq(purchaseReceipts.id, purchaseReceiptItems.purchaseReceiptId))
        .where(and(eq(purchaseReceiptItems.organizationId, access.organizationId), eq(purchaseReceiptItems.purchaseOrderItemId, item.id), eq(purchaseReceipts.purchaseOrderId, purchase.id)));
      if (compareDecimals(received?.quantity ?? "0.000000", item.quantity) < 0) fullyReceived = false;
    }
    const [updatedPurchase] = await tx.update(purchaseOrders).set({ status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED", version: sql`${purchaseOrders.version} + 1` }).where(and(eq(purchaseOrders.organizationId, access.organizationId), eq(purchaseOrders.id, purchase.id), eq(purchaseOrders.status, purchase.status))).returning({ id: purchaseOrders.id });
    if (!updatedPurchase) throw new AppError("version_conflict", "Purchase order was changed while receiving", 409);
    await writeAudit(tx, auditInput(c, access, "CREATE", "purchase_receipt", receipt.id));
    return receipt;
  });
  return c.json({ data: created }, 201);
}

export async function createRecipe(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "recipes.manage");
  const body = await parseJsonBody(c, recipeCreateSchema);
  const created = await db.transaction(async (tx) => {
    await ensureExists(tx, productVariants, access.organizationId, body.outputVariantId, "output_variant_not_found");
    for (const item of body.items) await ensureExists(tx, productVariants, access.organizationId, item.inputVariantId, "input_variant_not_found");
    const [recipe] = await tx.insert(recipes).values({ organizationId: access.organizationId, outputVariantId: body.outputVariantId, name: body.name, outputQuantity: body.outputQuantity }).returning();
    if (!recipe) throw new AppError("recipe_create_failed", "Unable to create recipe", 500);
    await tx.insert(recipeItems).values(body.items.map((item) => ({ organizationId: access.organizationId, recipeId: recipe.id, inputVariantId: item.inputVariantId, quantity: item.quantity })));
    await writeAudit(tx, auditInput(c, access, "CREATE", "recipe", recipe.id));
    return recipe;
  });
  return c.json({ data: created }, 201);
}

export async function listRecipes(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "inventory.view");
  const rows = await db.select().from(recipes).where(eq(recipes.organizationId, access.organizationId)).orderBy(asc(recipes.name));
  return c.json({ data: rows });
}

async function onHand(db: Pick<ReturnType<typeof requireDb>, "select">, organizationId: string, warehouseId: string, variantId: string) {
  const [row] = await db
    .select({ quantity: sql<string>`coalesce(sum(${stockMovements.quantityDelta}), 0)::text` })
    .from(stockMovements)
    .where(and(eq(stockMovements.organizationId, organizationId), eq(stockMovements.warehouseId, warehouseId), eq(stockMovements.variantId, variantId)))
    .limit(1);
  return row?.quantity ?? "0.000000";
}

async function ensureExists(
  db: Pick<ReturnType<typeof requireDb>, "select">,
  table: typeof locations | typeof warehouses | typeof productVariants,
  organizationId: string,
  id: string,
  code: string
) {
  const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.organizationId, organizationId), eq(table.id, id))).limit(1);
  if (!row) throw new AppError(code, "Referenced resource does not exist in this organization", 404);
}

function readId(c: Context<AppBindings>) {
  const id = c.req.param()["id"];
  if (!id) throw new AppError("validation_failed", "Resource id is required", 400);
  return id;
}

function auditInput(
  c: Context<AppBindings>,
  access: { organizationId: string; actor: { userId: string } },
  action: "CREATE" | "UPDATE",
  entityType: string,
  entityId?: string
) {
  return { organizationId: access.organizationId, actorUserId: access.actor.userId, action, entityType, entityId, requestId: c.get("requestId") };
}

function requireDb(deps: AppDependencies) {
  if (!deps.db) throw new AppError("database_unavailable", "Database connection is not configured", 503);
  return deps.db;
}

async function lockAggregate(tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}
