import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import type { Database } from "../../db";
import {
  bills,
  idempotencyKeys,
  kitchenJobItems,
  kitchenJobs,
  kitchenStations,
  locations,
  orderItems,
  orders,
  printJobs,
  tickets
} from "../../db/schema";
import { AppError } from "../../infra/errors";
import { sha256Hex } from "../../infra/crypto";
import type { AppBindings, AppDependencies } from "../../http/context";
import { parseJsonBody } from "../../http/validation";
import { writeAudit } from "../audit/service";
import { requireLocationAccess, requireOrganizationAccess, type OrganizationAccess } from "../platform/access";
import { addDecimals, compareDecimals, subtractDecimal } from "../sales/decimal";
import { isPositiveDecimalString } from "../sales/decimal-input";
import { canTransitionKitchenJobItem } from "./kitchen-state";

const stationCreateSchema = z.object({
  locationId: z.string().uuid(),
  code: z.string().min(1).max(32),
  name: z.string().min(1),
  active: z.boolean().default(true)
});

const stationUpdateSchema = stationCreateSchema.partial().extend({ version: z.number().int().positive() });

const dispatchSchema = z.object({
  stationId: z.string().uuid(),
  items: z.array(z.object({ orderItemId: z.string().uuid(), quantity: z.string().refine(isPositiveDecimalString, "Quantity must be greater than zero") })).optional()
});

const transitionSchema = z.object({
  status: z.enum(["QUEUED", "PREPARING", "READY", "SERVED", "CANCELLED"]),
  version: z.number().int().positive()
});

const claimSchema = z.object({ workerId: z.string().min(1) });
const ackSchema = z.object({ success: z.boolean(), message: z.string().optional() });
const reprintSchema = z.object({ reason: z.string().min(1) });

export async function listKitchenStations(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.view");
  const rows = await db.select().from(kitchenStations).where(and(eq(kitchenStations.organizationId, access.organizationId), access.isOwner ? undefined : inArray(kitchenStations.locationId, access.locationIds))).orderBy(asc(kitchenStations.name));
  return c.json({ data: rows });
}

export async function createKitchenStation(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "kitchen.update");
  const body = await parseJsonBody(c, stationCreateSchema);
  const [location] = await db.select({ id: locations.id }).from(locations).where(and(eq(locations.organizationId, access.organizationId), eq(locations.id, body.locationId), eq(locations.active, true))).limit(1);
  if (!location) throw new AppError("location_not_found", "Location was not found or inactive", 404);
  await requireLocationAccess(db, access, body.locationId);
  const [created] = await db.insert(kitchenStations).values({ ...body, code: body.code.toUpperCase(), organizationId: access.organizationId }).returning();

  await writeAudit(db, auditInput(c, access, "CREATE", "kitchen_station", created?.id));
  return c.json({ data: created }, 201);
}

export async function updateKitchenStation(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "kitchen.update");
  const body = await parseJsonBody(c, stationUpdateSchema);
  const id = readId(c);
  if (body.locationId) {
    const [location] = await db.select({ id: locations.id }).from(locations).where(and(eq(locations.organizationId, access.organizationId), eq(locations.id, body.locationId), eq(locations.active, true))).limit(1);
    if (!location) throw new AppError("location_not_found", "Location was not found or inactive", 404);
    await requireLocationAccess(db, access, body.locationId);
  }
  const [updated] = await db
    .update(kitchenStations)
    .set({
      locationId: body.locationId,
      code: body.code?.toUpperCase(),
      name: body.name,
      active: body.active,
      version: sql`${kitchenStations.version} + 1`
    })
    .where(and(eq(kitchenStations.organizationId, access.organizationId), eq(kitchenStations.id, id), eq(kitchenStations.version, body.version)))
    .returning();

  if (!updated) throw new AppError("version_conflict", "Kitchen station was changed by another request", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "kitchen_station", id));
  return c.json({ data: updated });
}

export async function dispatchKitchen(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "kitchen.dispatch");
  const orderId = readId(c);
  const body = await parseJsonBody(c, dispatchSchema);
  const idempotencyKey = c.req.header("Idempotency-Key");
  if (!idempotencyKey) throw new AppError("idempotency_key_required", "Idempotency-Key header is required", 400);
  const idempotencyScope = `kitchen.dispatch:${orderId}`;
  const requestHash = await sha256Hex(JSON.stringify(body));
  const [existingIdempotency] = await db.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.organizationId, access.organizationId), eq(idempotencyKeys.userId, access.actor.userId), eq(idempotencyKeys.scope, idempotencyScope), eq(idempotencyKeys.key, idempotencyKey))).limit(1);
  if (existingIdempotency) {
    if (existingIdempotency.requestHash !== requestHash) throw new AppError("idempotency_key_conflict", "Idempotency-Key was already used with a different payload", 409);
    if (existingIdempotency.responseStatus && existingIdempotency.responseBody) return c.json(existingIdempotency.responseBody, existingIdempotency.responseStatus as 200);
    throw new AppError("idempotency_key_in_progress", "Idempotent request is already in progress", 409);
  }

  const created = await db.transaction(async (tx) => {
    const [reserved] = await tx.insert(idempotencyKeys).values({ organizationId: access.organizationId, userId: access.actor.userId, key: idempotencyKey, scope: idempotencyScope, requestHash, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) }).onConflictDoNothing({ target: [idempotencyKeys.organizationId, idempotencyKeys.userId, idempotencyKeys.scope, idempotencyKeys.key] }).returning({ id: idempotencyKeys.id });
    if (!reserved) throw new AppError("idempotency_key_in_progress", "Idempotent request is already in progress", 409);
    const [order] = await tx.select().from(orders).where(and(eq(orders.organizationId, access.organizationId), eq(orders.id, orderId), eq(orders.status, "OPEN"))).limit(1);
    if (!order) throw new AppError("order_not_found", "Open order was not found", 404);
    const [ticket] = await tx.select().from(tickets).where(and(eq(tickets.organizationId, access.organizationId), eq(tickets.id, order.ticketId), eq(tickets.status, "OPEN"))).limit(1);
    if (!ticket) throw new AppError("ticket_not_found", "Open ticket was not found", 404);
    await requireLocationAccess(tx as unknown as Database, access, ticket.locationId);
    await lockAggregate(tx, `order:${access.organizationId}:${orderId}`);
    const [station] = await tx.select().from(kitchenStations).where(and(eq(kitchenStations.organizationId, access.organizationId), eq(kitchenStations.id, body.stationId), eq(kitchenStations.active, true))).limit(1);
    if (!station) throw new AppError("station_not_found", "Kitchen station was not found", 404);
    if (station.locationId !== ticket.locationId) throw new AppError("station_location_mismatch", "Kitchen station belongs to another location", 409);

    const existingJobs = await tx.select().from(kitchenJobs).where(and(eq(kitchenJobs.organizationId, access.organizationId), eq(kitchenJobs.orderId, orderId)));
    const dispatchNumber = `K-${(existingJobs.length + 1).toString().padStart(4, "0")}`;
    const requestedItems = body.items ?? [];
    const requestedIds = requestedItems.map((item) => item.orderItemId);
    if (new Set(requestedIds).size !== requestedIds.length) {
      throw new AppError("duplicate_order_items", "An order item may appear only once per dispatch", 400);
    }
    const selectedItems =
      requestedItems.length > 0
        ? await Promise.all(
            requestedItems.map(async (requested) => {
              const [item] = await tx.select().from(orderItems).where(and(eq(orderItems.organizationId, access.organizationId), eq(orderItems.id, requested.orderItemId), eq(orderItems.orderId, orderId), eq(orderItems.active, true))).limit(1);
              if (!item) throw new AppError("order_item_not_found", "Order item was not found", 404);
              return { item, quantity: requested.quantity };
            })
          )
        : (await tx.select().from(orderItems).where(and(eq(orderItems.organizationId, access.organizationId), eq(orderItems.orderId, orderId), eq(orderItems.active, true)))).map((item) => ({ item, quantity: item.quantity }));

    const kitchenItems = [];
    for (const selected of selectedItems) {
      const dispatched = await dispatchedQuantity(tx, access.organizationId, selected.item.id);
      const remaining = subtractDecimal(selected.item.quantity, dispatched);
      const quantity = requestedItems.length > 0 ? selected.quantity : remaining;
      if (compareDecimals(quantity, "0.000000") <= 0) continue;
      if (compareDecimals(quantity, remaining) > 0) throw new AppError("quantity_overdispatched", "Kitchen quantity exceeds remaining order item quantity", 409);
      kitchenItems.push({ item: selected.item, quantity });
    }

    if (kitchenItems.length === 0) throw new AppError("nothing_to_dispatch", "No remaining items to dispatch", 409);

    const [job] = await tx
      .insert(kitchenJobs)
      .values({
        organizationId: access.organizationId,
        locationId: ticket.locationId,
        ticketId: ticket.id,
        orderId,
        stationId: station.id,
        dispatchNumber,
        createdByUserId: access.actor.userId
      })
      .returning();

    if (!job) throw new AppError("kitchen_job_create_failed", "Unable to create kitchen job", 500);

    await tx.insert(kitchenJobItems).values(
      kitchenItems.map((entry) => ({
        organizationId: access.organizationId,
        kitchenJobId: job.id,
        orderItemId: entry.item.id,
        quantity: entry.quantity
      }))
    );

    const payload = {
      type: "KITCHEN",
      ticketNumber: ticket.number,
      ticketLabel: ticket.label,
      dispatchNumber,
      stationName: station.name,
      items: kitchenItems.map((entry) => ({
        name: entry.item.variantNameSnapshot,
        quantity: entry.quantity
      }))
    };

    const [printJob] = await tx
      .insert(printJobs)
      .values({
        organizationId: access.organizationId,
        locationId: ticket.locationId,
        type: "KITCHEN",
        kitchenJobId: job.id,
        payload
      })
      .returning();

    await writeAudit(tx, auditInput(c, access, "CREATE", "kitchen_job", job.id));
    await tx.update(idempotencyKeys).set({ responseStatus: 201, responseBody: { data: { job, printJob } } }).where(and(eq(idempotencyKeys.organizationId, access.organizationId), eq(idempotencyKeys.userId, access.actor.userId), eq(idempotencyKeys.scope, idempotencyScope), eq(idempotencyKeys.key, idempotencyKey)));
    return { job, printJob };
  });

  return c.json({ data: created }, 201);
}

export async function listKitchenJobs(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "kitchen.update");
  const jobs = await db.select().from(kitchenJobs).where(and(eq(kitchenJobs.organizationId, access.organizationId), access.isOwner ? undefined : inArray(kitchenJobs.locationId, access.locationIds))).orderBy(asc(kitchenJobs.createdAt)).limit(100);
  const items = await db.select().from(kitchenJobItems).where(and(eq(kitchenJobItems.organizationId, access.organizationId), access.isOwner ? undefined : inArray(kitchenJobItems.kitchenJobId, jobs.map((job) => job.id)))).orderBy(asc(kitchenJobItems.createdAt)).limit(500);
  return c.json({ data: { jobs, items } });
}

export async function transitionKitchenJobItem(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "kitchen.update");
  const id = readId(c);
  const body = await parseJsonBody(c, transitionSchema);
  const [current] = await db.select({ item: kitchenJobItems, locationId: kitchenJobs.locationId }).from(kitchenJobItems).innerJoin(kitchenJobs, eq(kitchenJobs.id, kitchenJobItems.kitchenJobId)).where(and(eq(kitchenJobItems.organizationId, access.organizationId), eq(kitchenJobItems.id, id))).limit(1);
  if (!current) throw new AppError("kitchen_item_not_found", "Kitchen job item was not found", 404);
  await requireLocationAccess(db, access, current.locationId);
  if (!canTransitionKitchenJobItem(current.item.status, body.status)) {
    throw new AppError("invalid_kitchen_transition", `Cannot move kitchen item from ${current.item.status} to ${body.status}`, 409);
  }
  const [updated] = await db
    .update(kitchenJobItems)
    .set({ status: body.status, version: sql`${kitchenJobItems.version} + 1` })
    .where(and(eq(kitchenJobItems.organizationId, access.organizationId), eq(kitchenJobItems.id, id), eq(kitchenJobItems.version, body.version)))
    .returning();

  if (!updated) throw new AppError("version_conflict", "Kitchen job item was changed by another request", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "kitchen_job_item", id));
  return c.json({ data: updated });
}

export async function listPrintJobs(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "kitchen.update");
  const url = new URL(c.req.url);
  const status = url.searchParams.get("status");
  const rows = await db
    .select()
    .from(printJobs)
    .where(and(eq(printJobs.organizationId, access.organizationId), status ? eq(printJobs.status, status as never) : undefined, access.isOwner ? undefined : inArray(printJobs.locationId, access.locationIds)))
    .orderBy(asc(printJobs.createdAt))
    .limit(100);
  return c.json({ data: rows });
}

export async function claimPrintJob(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "kitchen.update");
  const id = readId(c);
  const body = await parseJsonBody(c, claimSchema);
  await requirePrintLocation(db, access, id);
  const [updated] = await db
    .update(printJobs)
    .set({ status: "CLAIMED", claimedBy: body.workerId, claimedAt: new Date(), version: sql`${printJobs.version} + 1` })
    .where(and(eq(printJobs.organizationId, access.organizationId), eq(printJobs.id, id), eq(printJobs.status, "QUEUED")))
    .returning();

  if (!updated) throw new AppError("print_job_unavailable", "Print job is not queued", 409);
  return c.json({ data: updated });
}

export async function acknowledgePrintJob(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "kitchen.update");
  const id = readId(c);
  const body = await parseJsonBody(c, ackSchema);
  await requirePrintLocation(db, access, id);
  const [updated] = await db
    .update(printJobs)
    .set({
      status: body.success ? "ACKED" : "FAILED",
      acknowledgedAt: new Date(),
      failureMessage: body.success ? undefined : body.message,
      version: sql`${printJobs.version} + 1`
    })
    .where(and(eq(printJobs.organizationId, access.organizationId), eq(printJobs.id, id), eq(printJobs.status, "CLAIMED")))
    .returning();

  if (!updated) throw new AppError("print_job_not_claimed", "Print job must be claimed before acknowledgment", 409);
  return c.json({ data: updated });
}

export async function reprintJob(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "print.reprint");
  const id = readId(c);
  const body = await parseJsonBody(c, reprintSchema);

  const created = await db.transaction(async (tx) => {
    const [source] = await tx.select().from(printJobs).where(and(eq(printJobs.organizationId, access.organizationId), eq(printJobs.id, id))).limit(1);
    if (!source) throw new AppError("print_job_not_found", "Print job was not found", 404);
    await requireLocationAccess(tx as unknown as Database, access, source.locationId);

    const [copy] = await tx
      .insert(printJobs)
      .values({
        organizationId: access.organizationId,
        locationId: source.locationId,
        type: source.type,
        kitchenJobId: source.kitchenJobId,
        billId: source.billId,
        payload: source.payload,
        copy: true,
        reason: body.reason
      })
      .returning();

    await writeAudit(tx, auditInput(c, access, "CREATE", "print_job_reprint", copy?.id));
    return copy;
  });

  return c.json({ data: created }, 201);
}

async function dispatchedQuantity(db: Pick<ReturnType<typeof requireDb>, "select">, organizationId: string, orderItemId: string) {
  const [row] = await db
    .select({ quantity: sql<string>`coalesce(sum(${kitchenJobItems.quantity}), 0)::text` })
    .from(kitchenJobItems)
    .where(and(eq(kitchenJobItems.organizationId, organizationId), eq(kitchenJobItems.orderItemId, orderItemId), ne(kitchenJobItems.status, "CANCELLED")))
    .limit(1);

  return row?.quantity ?? "0.000000";
}

async function requirePrintLocation(db: Pick<ReturnType<typeof requireDb>, "select">, access: OrganizationAccess, printJobId: string) {
  const [job] = await db.select({ locationId: printJobs.locationId }).from(printJobs).where(and(eq(printJobs.organizationId, access.organizationId), eq(printJobs.id, printJobId))).limit(1);
  if (!job) throw new AppError("print_job_not_found", "Print job was not found", 404);
  await requireLocationAccess(db as unknown as Database, access, job.locationId);
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
  return {
    organizationId: access.organizationId,
    actorUserId: access.actor.userId,
    action,
    entityType,
    entityId,
    requestId: c.get("requestId")
  };
}

function requireDb(deps: AppDependencies) {
  if (!deps.db) throw new AppError("database_unavailable", "Database connection is not configured", 503);
  return deps.db;
}

async function lockAggregate(tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}
