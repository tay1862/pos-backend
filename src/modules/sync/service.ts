import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import {
  bills,
  devices,
  locations,
  organizations,
  orderItems,
  orders,
  payments,
  priceListItems,
  priceLists,
  productVariants,
  products,
  syncSnapshots,
  syncCommands,
  syncEvents,
  taxRates,
  ticketCounters,
  tickets
} from "../../db/schema";
import type { AppBindings, AppDependencies } from "../../http/context";
import type { Database } from "../../db";
import { parseJsonBody } from "../../http/validation";
import { AppError } from "../../infra/errors";
import { setRlsContext } from "../../db/rls";
import { writeAudit } from "../audit/service";
import { requireLocationAccess, requireOrganizationAccess, type OrganizationAccess } from "../platform/access";
import { businessDateForTimezone } from "../../domain/business-date";
import { isPositiveDecimalString } from "../sales/decimal-input";

const querySchema = z.object({
  after: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

const commandBatchSchema = z.object({
  commands: z
    .array(
      z.object({
        clientCommandId: z.string().uuid(),
        commandType: z.string().min(1).max(120),
        aggregateType: z.string().min(1).max(120),
        aggregateId: z.string().uuid().optional(),
        baseSequence: z.number().int().min(0).default(0),
        payload: z.record(z.string(), z.unknown()).default({})
      })
    )
    .min(1)
    .max(100)
});

const processCommandsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25)
});

const ticketCreatePayloadSchema = z.object({
  locationId: z.string().uuid(),
  label: z.string().optional(),
  customerName: z.string().optional(),
  paymentTiming: z.enum(["PREPAY", "POSTPAY"]).optional(),
  context: z.enum(["DINE_IN", "TAKEAWAY", "RETAIL", "WHOLESALE"]).default("DINE_IN")
});

const ticketUpdatePayloadSchema = z.object({
  label: z.string().optional(),
  customerName: z.string().optional(),
  paymentTiming: z.enum(["PREPAY", "POSTPAY"]).optional()
});

const decimalString = z.string().refine(isPositiveDecimalString, "Value must be greater than zero");

const orderItemAddPayloadSchema = z.object({
  variantId: z.string().uuid(),
  quantity: decimalString,
  priceListId: z.string().uuid().optional()
});

export async function listSyncEvents(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "sync.read");
  const url = new URL(c.req.url);
  const parsed = querySchema.safeParse({ after: url.searchParams.get("after") ?? undefined, limit: url.searchParams.get("limit") ?? undefined });
  if (!parsed.success) {
    throw new AppError("validation_failed", "Invalid sync cursor", 400, parsed.error.issues);
  }

  const rows = await db
    .select()
    .from(syncEvents)
    .where(and(eq(syncEvents.organizationId, access.organizationId), gt(syncEvents.sequence, parsed.data.after)))
    .orderBy(asc(syncEvents.sequence))
    .limit(parsed.data.limit);

  const nextCursor = rows.length > 0 ? rows[rows.length - 1]?.sequence ?? parsed.data.after : parsed.data.after;

  return c.json({
    data: rows,
    pagination: {
      after: parsed.data.after,
      nextCursor,
      hasMore: rows.length === parsed.data.limit
    }
  });
}

export async function streamSyncEvents(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await db.transaction(async (tx) => {
    c.set("rlsLocal", true);
    return requireOrganizationAccess(c, tx as unknown as Database, "sync.read");
  });
  const url = new URL(c.req.url);
  const parsed = querySchema.safeParse({ after: url.searchParams.get("after") ?? undefined, limit: url.searchParams.get("limit") ?? "100" });
  if (!parsed.success) {
    throw new AppError("validation_failed", "Invalid sync cursor", 400, parsed.error.issues);
  }

  const encoder = new TextEncoder();
  const signal = c.req.raw.signal;
  let cancelled = false;
  let cursor = parsed.data.after;

  const stream = new ReadableStream({
    async start(controller) {
      const write = (event: string, data: unknown) => {
        if (!cancelled && !signal.aborted) controller.enqueue(encoder.encode(`event: ${event}
data: ${JSON.stringify(data)}

`));
      };

      write("ready", { after: cursor });
      const startedAt = Date.now();
      while (!cancelled && !signal.aborted && Date.now() - startedAt < 25_000) {
        const rows = await db.transaction(async (tx) => {
          await setRlsContext(tx, { organizationId: access.organizationId, platformAdmin: false, local: true });
          return tx
            .select()
            .from(syncEvents)
            .where(and(eq(syncEvents.organizationId, access.organizationId), gt(syncEvents.sequence, cursor)))
            .orderBy(asc(syncEvents.sequence))
            .limit(parsed.data.limit);
        });

        for (const row of rows) {
          cursor = row.sequence;
          write("sync_event", row);
        }

        if (rows.length === 0) write("heartbeat", { cursor });
        await waitForNextPoll(rows.length > 0 ? 250 : 2_000, signal, () => cancelled);
      }

      if (!cancelled && !signal.aborted) {
        write("close", { nextCursor: cursor });
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    }
  });
}

export async function getLatestSyncSnapshot(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "sync.read");
  const [snapshot] = await db
    .select()
    .from(syncSnapshots)
    .where(eq(syncSnapshots.organizationId, access.organizationId))
    .orderBy(desc(syncSnapshots.sequence), desc(syncSnapshots.createdAt))
    .limit(1);
  return c.json({ data: snapshot ?? null });
}

export async function buildSyncSnapshot(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "sync.snapshot");
  const created = await db.transaction(async (tx) => {
    const [latestEvent] = await tx
      .select({ sequence: syncEvents.sequence })
      .from(syncEvents)
      .where(eq(syncEvents.organizationId, access.organizationId))
      .orderBy(desc(syncEvents.sequence))
      .limit(1);
    const currentTickets = await tx.select().from(tickets).where(eq(tickets.organizationId, access.organizationId)).orderBy(desc(tickets.createdAt)).limit(500);
    const currentDevices = await tx.select().from(devices).where(eq(devices.organizationId, access.organizationId)).orderBy(asc(devices.name)).limit(500);
    const payload = {
      builtAt: new Date().toISOString(),
      sequence: latestEvent?.sequence ?? 0,
      tickets: currentTickets,
      devices: currentDevices
    };
    const [snapshot] = await tx
      .insert(syncSnapshots)
      .values({
        organizationId: access.organizationId,
        sequence: latestEvent?.sequence ?? 0,
        payload,
        createdByUserId: access.actor.userId
      })
      .returning();
    await writeAudit(tx, {
      organizationId: access.organizationId,
      actorUserId: access.actor.userId,
      action: "CREATE",
      entityType: "sync_snapshot",
      entityId: snapshot?.id,
      requestId: c.get("requestId"),
      metadata: { sequence: latestEvent?.sequence ?? 0 }
    });
    return snapshot;
  });
  return c.json({ data: created }, 201);
}

export async function submitSyncCommands(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "sync.write");
  const deviceId = readId(c);
  const body = await parseJsonBody(c, commandBatchSchema);
  await ensureActiveDevice(db, access.organizationId, deviceId);

  const rows = await db.transaction(async (tx) => {
    const output = [];
    for (const command of body.commands) {
      const [inserted] = await tx
        .insert(syncCommands)
        .values({
          organizationId: access.organizationId,
          deviceId,
          clientCommandId: command.clientCommandId,
          commandType: command.commandType,
          aggregateType: command.aggregateType,
          aggregateId: command.aggregateId,
          baseSequence: command.baseSequence,
          payload: command.payload,
          receivedByUserId: access.actor.userId
        })
        .onConflictDoNothing({
          target: [syncCommands.organizationId, syncCommands.deviceId, syncCommands.clientCommandId]
        })
        .returning();

      if (inserted) {
        output.push(inserted);
        continue;
      }

      const [existing] = await tx
        .select()
        .from(syncCommands)
        .where(and(eq(syncCommands.organizationId, access.organizationId), eq(syncCommands.deviceId, deviceId), eq(syncCommands.clientCommandId, command.clientCommandId)))
        .limit(1);

      if (!existing) throw new AppError("sync_command_conflict", "Sync command conflict could not be resolved", 409);
      if (!isSameSyncCommandForReplay(existing, command)) {
        throw new AppError("sync_command_conflict", "clientCommandId was already used with a different command payload", 409);
      }
      output.push(existing);
    }
    await writeAudit(tx, {
      organizationId: access.organizationId,
      actorUserId: access.actor.userId,
      action: "CREATE",
      entityType: "sync_command_batch",
      entityId: deviceId,
      requestId: c.get("requestId"),
      metadata: { count: output.length }
    });
    return output;
  });

  return c.json({ data: rows }, 202);
}

export async function listSyncCommands(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "sync.read");
  const deviceId = readId(c);
  await ensureActiveDevice(db, access.organizationId, deviceId);
  const status = new URL(c.req.url).searchParams.get("status");
  const rows = await db
    .select()
    .from(syncCommands)
    .where(status ? and(eq(syncCommands.organizationId, access.organizationId), eq(syncCommands.deviceId, deviceId), eq(syncCommands.status, status as never)) : and(eq(syncCommands.organizationId, access.organizationId), eq(syncCommands.deviceId, deviceId)))
    .orderBy(desc(syncCommands.receivedAt))
    .limit(100);
  return c.json({ data: rows });
}

export async function processSyncCommands(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "sync.process");
  const body = await parseJsonBody(c, processCommandsSchema);
  const candidates = await db
    .select()
    .from(syncCommands)
    .where(and(eq(syncCommands.organizationId, access.organizationId), eq(syncCommands.status, "RECEIVED")))
    .orderBy(asc(syncCommands.receivedAt))
    .limit(body.limit);

  const results = [];
  for (const command of candidates) {
    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .update(syncCommands)
        .set({ status: "PROCESSING", processedAt: new Date() })
        .where(and(eq(syncCommands.organizationId, access.organizationId), eq(syncCommands.id, command.id), eq(syncCommands.status, "RECEIVED")))
        .returning();
      if (!current) return { id: command.id, status: "SKIPPED" };

      if (current.commandType === "ticket.update") return applyTicketUpdateCommand(tx, c, access, current);
      if (current.commandType === "ticket.cancel") return applyTicketCancelCommand(tx, c, access, current);
      if (current.commandType === "order_item.add") return applyOrderItemAddCommand(tx, c, access, current);
      if (current.commandType !== "ticket.create") return rejectCommand(tx, c, access, current, "unsupported_command", `Unsupported command type: ${current.commandType}`);

      const parsed = ticketCreatePayloadSchema.safeParse(current.payload);
      if (!parsed.success) {
        return rejectCommand(tx, c, access, current, "invalid_payload", "ticket.create payload is invalid");
      }

      const payload = parsed.data;
      const [location] = await tx
        .select({ id: locations.id, timezone: locations.timezone, defaultPaymentTiming: locations.defaultPaymentTiming })
        .from(locations)
        .where(and(eq(locations.organizationId, access.organizationId), eq(locations.id, payload.locationId), eq(locations.active, true)))
        .limit(1);
      if (!location) {
        return rejectCommand(tx, c, access, current, "location_not_found", "ticket.create location is not active in this organization");
      }
      try {
        await requireLocationAccess(tx as unknown as Database, access, payload.locationId);
      } catch (error) {
        if (error instanceof AppError) return rejectCommand(tx, c, access, current, error.code, error.message);
        throw error;
      }

      const businessDate = businessDateForTimezone(location.timezone);
      const [counter] = await tx
        .insert(ticketCounters)
        .values({ organizationId: access.organizationId, locationId: payload.locationId, businessDate, nextSequence: 2 })
        .onConflictDoUpdate({
          target: [ticketCounters.organizationId, ticketCounters.locationId, ticketCounters.businessDate],
          set: { nextSequence: sql`${ticketCounters.nextSequence} + 1` }
        })
        .returning();

      const sequence = (counter?.nextSequence ?? 2) - 1;
      const number = `T-${businessDate.replaceAll("-", "")}-${sequence.toString().padStart(4, "0")}`;
      const [ticket] = await tx
        .insert(tickets)
        .values({
          organizationId: access.organizationId,
          locationId: payload.locationId,
          number,
          label: payload.label,
          customerName: payload.customerName,
          paymentTiming: payload.paymentTiming ?? (location.defaultPaymentTiming as "PREPAY" | "POSTPAY"),
          businessDate
        })
        .returning();
      if (!ticket) throw new AppError("ticket_create_failed", "Unable to create ticket from sync command", 500);
      await tx
        .insert(orders)
        .values({
          organizationId: access.organizationId,
          ticketId: ticket.id,
          context: payload.context
        })
        .returning();

      await writeAudit(tx, {
        organizationId: access.organizationId,
        actorUserId: access.actor.userId,
        action: "CREATE",
        entityType: "ticket",
        entityId: ticket.id,
        requestId: c.get("requestId"),
        metadata: { source: "sync_command", syncCommandId: current.id, deviceId: current.deviceId }
      });
      const [latestEvent] = await tx
        .select({ sequence: syncEvents.sequence })
        .from(syncEvents)
        .where(and(eq(syncEvents.organizationId, access.organizationId), eq(syncEvents.entityType, "ticket"), eq(syncEvents.entityId, ticket.id)))
        .orderBy(desc(syncEvents.sequence))
        .limit(1);

      const [updated] = await tx
        .update(syncCommands)
        .set({ status: "APPLIED", resultEntityType: "ticket", resultEntityId: ticket.id, resultSequence: latestEvent?.sequence, processedAt: new Date() })
        .where(eq(syncCommands.id, current.id))
        .returning();
      return { id: current.id, status: updated?.status ?? "APPLIED", resultEntityType: "ticket", resultEntityId: ticket.id, resultSequence: latestEvent?.sequence };
    });
    results.push(result);
  }

  return c.json({ data: results });
}

async function applyTicketUpdateCommand(
  tx: Pick<ReturnType<typeof requireDb>, "select" | "update" | "insert">,
  c: Context<AppBindings>,
  access: OrganizationAccess,
  command: typeof syncCommands.$inferSelect
) {
  if (!command.aggregateId || command.aggregateType !== "ticket") {
    return rejectCommand(tx, c, access, command, "invalid_aggregate", "ticket.update requires aggregateType ticket and aggregateId");
  }

  const parsed = ticketUpdatePayloadSchema.safeParse(command.payload);
  if (!parsed.success) {
    return rejectCommand(tx, c, access, command, "invalid_payload", "ticket.update payload is invalid");
  }

  const latestSequence = await latestEntitySequence(tx, access.organizationId, "ticket", command.aggregateId);
  if (latestSequence > command.baseSequence) {
    return rejectCommand(tx, c, access, command, "sync_conflict", "Ticket has changed after the command base sequence");
  }

  const [ticket] = await tx
    .update(tickets)
    .set({
      label: parsed.data.label,
      customerName: parsed.data.customerName,
      paymentTiming: parsed.data.paymentTiming,
      version: sql`${tickets.version} + 1`
    })
    .where(and(eq(tickets.organizationId, access.organizationId), eq(tickets.id, command.aggregateId), eq(tickets.status, "OPEN")))
    .returning();

  if (!ticket) {
    return rejectCommand(tx, c, access, command, "ticket_not_open", "Ticket was not found or is not open");
  }

  await writeAudit(tx, {
    organizationId: access.organizationId,
    actorUserId: access.actor.userId,
    action: "UPDATE",
    entityType: "ticket",
    entityId: ticket.id,
    requestId: c.get("requestId"),
    metadata: { source: "sync_command", syncCommandId: command.id, deviceId: command.deviceId }
  });
  const resultSequence = await latestEntitySequence(tx, access.organizationId, "ticket", ticket.id);
  const [updated] = await tx
    .update(syncCommands)
    .set({ status: "APPLIED", resultEntityType: "ticket", resultEntityId: ticket.id, resultSequence, processedAt: new Date() })
    .where(eq(syncCommands.id, command.id))
    .returning();

  return { id: command.id, status: updated?.status ?? "APPLIED", resultEntityType: "ticket", resultEntityId: ticket.id, resultSequence };
}

async function applyTicketCancelCommand(
  tx: Pick<ReturnType<typeof requireDb>, "select" | "update" | "insert">,
  c: Context<AppBindings>,
  access: OrganizationAccess,
  command: typeof syncCommands.$inferSelect
) {
  if (!command.aggregateId || command.aggregateType !== "ticket") {
    return rejectCommand(tx, c, access, command, "invalid_aggregate", "ticket.cancel requires aggregateType ticket and aggregateId");
  }

  const latestSequence = await latestEntitySequence(tx, access.organizationId, "ticket", command.aggregateId);
  if (latestSequence > command.baseSequence) {
    return rejectCommand(tx, c, access, command, "sync_conflict", "Ticket has changed after the command base sequence");
  }

  const [paymentRow] = await tx
    .select({ amount: sql<string>`coalesce(sum(${payments.amount}), 0)::text` })
    .from(payments)
    .innerJoin(bills, eq(bills.id, payments.billId))
    .where(and(eq(payments.organizationId, access.organizationId), eq(bills.ticketId, command.aggregateId)))
    .limit(1);
  if (paymentRow && paymentRow.amount !== "0") {
    return rejectCommand(tx, c, access, command, "ticket_has_payments", "Ticket has payments and cannot be cancelled");
  }

  const [ticket] = await tx
    .update(tickets)
    .set({ status: "CANCELLED", cancelledAt: new Date(), version: sql`${tickets.version} + 1` })
    .where(and(eq(tickets.organizationId, access.organizationId), eq(tickets.id, command.aggregateId), eq(tickets.status, "OPEN")))
    .returning();

  if (!ticket) {
    return rejectCommand(tx, c, access, command, "ticket_not_open", "Ticket was not found or is not open");
  }

  await writeAudit(tx, {
    organizationId: access.organizationId,
    actorUserId: access.actor.userId,
    action: "UPDATE",
    entityType: "ticket",
    entityId: ticket.id,
    requestId: c.get("requestId"),
    metadata: { source: "sync_command", syncCommandId: command.id, deviceId: command.deviceId, status: "CANCELLED" }
  });
  const resultSequence = await latestEntitySequence(tx, access.organizationId, "ticket", ticket.id);
  const [updated] = await tx
    .update(syncCommands)
    .set({ status: "APPLIED", resultEntityType: "ticket", resultEntityId: ticket.id, resultSequence, processedAt: new Date() })
    .where(eq(syncCommands.id, command.id))
    .returning();

  return { id: command.id, status: updated?.status ?? "APPLIED", resultEntityType: "ticket", resultEntityId: ticket.id, resultSequence };
}

async function applyOrderItemAddCommand(
  tx: Pick<ReturnType<typeof requireDb>, "select" | "update" | "insert">,
  c: Context<AppBindings>,
  access: OrganizationAccess,
  command: typeof syncCommands.$inferSelect
) {
  if (!command.aggregateId || command.aggregateType !== "ticket") {
    return rejectCommand(tx, c, access, command, "invalid_aggregate", "order_item.add requires aggregateType ticket and aggregateId");
  }

  const parsed = orderItemAddPayloadSchema.safeParse(command.payload);
  if (!parsed.success) {
    return rejectCommand(tx, c, access, command, "invalid_payload", "order_item.add payload is invalid");
  }

  const latestSequence = await latestEntitySequence(tx, access.organizationId, "ticket", command.aggregateId);
  if (latestSequence > command.baseSequence) {
    return rejectCommand(tx, c, access, command, "sync_conflict", "Ticket has changed after the command base sequence");
  }

  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.organizationId, access.organizationId), eq(orders.ticketId, command.aggregateId), eq(orders.status, "OPEN")))
    .limit(1);
  if (!order) {
    return rejectCommand(tx, c, access, command, "order_not_open", "Open order was not found for this Ticket");
  }

  const [ticket] = await tx
    .select({ id: tickets.id, locationId: tickets.locationId })
    .from(tickets)
    .where(and(eq(tickets.organizationId, access.organizationId), eq(tickets.id, command.aggregateId), eq(tickets.status, "OPEN")))
    .limit(1);
  if (!ticket) {
    return rejectCommand(tx, c, access, command, "ticket_not_open", "Ticket was not found or is not open");
  }
  await requireLocationAccess(tx as unknown as Database, access, ticket.locationId);

  const body = parsed.data;
  const [variantRow] = await tx
    .select({
      variant: productVariants,
      product: products
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(productVariants.organizationId, access.organizationId), eq(productVariants.id, body.variantId), eq(productVariants.active, true), eq(products.active, true)))
    .limit(1);
  if (!variantRow) {
    return rejectCommand(tx, c, access, command, "variant_not_found", "Variant was not found or is not active");
  }

  let selectedPriceListId = body.priceListId;
  if (!selectedPriceListId) {
    const [defaultPriceList] = await tx
      .select()
      .from(priceLists)
      .where(and(eq(priceLists.organizationId, access.organizationId), eq(priceLists.default, true), eq(priceLists.active, true)))
      .orderBy(asc(priceLists.createdAt), asc(priceLists.id))
      .limit(1);
    selectedPriceListId = defaultPriceList?.id;
  }
  if (!selectedPriceListId) {
    return rejectCommand(tx, c, access, command, "price_list_not_found", "Default price list was not found");
  }
  const [selectedPriceList] = await tx.select().from(priceLists).where(and(eq(priceLists.organizationId, access.organizationId), eq(priceLists.id, selectedPriceListId), eq(priceLists.active, true))).limit(1);
  const [organization] = await tx.select({ baseCurrency: organizations.baseCurrency }).from(organizations).where(eq(organizations.id, access.organizationId)).limit(1);
  if (!selectedPriceList || !organization) return rejectCommand(tx, c, access, command, "price_list_not_found", "Price list was not found or inactive");
  if (selectedPriceList.currency !== organization.baseCurrency) return rejectCommand(tx, c, access, command, "currency_mismatch", "Price list currency must match organization base currency");

  const [price] = await tx
    .select()
    .from(priceListItems)
    .where(and(eq(priceListItems.organizationId, access.organizationId), eq(priceListItems.priceListId, selectedPriceListId), eq(priceListItems.variantId, body.variantId), eq(priceListItems.active, true)))
    .limit(1);
  if (!price) {
    return rejectCommand(tx, c, access, command, "price_not_found", "Active price was not found for this variant");
  }

  const [tax] = price.taxRateId ? await tx.select().from(taxRates).where(and(eq(taxRates.organizationId, access.organizationId), eq(taxRates.id, price.taxRateId), eq(taxRates.active, true))).limit(1) : [];
  const [item] = await tx
    .insert(orderItems)
    .values({
      organizationId: access.organizationId,
      orderId: order.id,
      productId: variantRow.product.id,
      variantId: body.variantId,
      quantity: body.quantity,
      unitPrice: price.price,
      currency: organization.baseCurrency,
      productNameSnapshot: variantRow.product.name,
      variantNameSnapshot: variantRow.variant.name,
      taxRateId: price.taxRateId,
      taxRateSnapshot: tax?.rate ?? "0",
      taxIncludedInPriceSnapshot: tax?.includedInPrice ?? false
    })
    .returning();

  if (!item) throw new AppError("order_item_create_failed", "Unable to create order item from sync command", 500);

  await writeAudit(tx, {
    organizationId: access.organizationId,
    actorUserId: access.actor.userId,
    action: "CREATE",
    entityType: "order_item",
    entityId: item.id,
    requestId: c.get("requestId"),
    metadata: { source: "sync_command", syncCommandId: command.id, deviceId: command.deviceId, ticketId: command.aggregateId }
  });
  await writeAudit(tx, {
    organizationId: access.organizationId,
    actorUserId: access.actor.userId,
    action: "UPDATE",
    entityType: "ticket",
    entityId: command.aggregateId,
    requestId: c.get("requestId"),
    metadata: { source: "sync_command", syncCommandId: command.id, reason: "order_item_added" }
  });

  const resultSequence = await latestEntitySequence(tx, access.organizationId, "ticket", command.aggregateId);
  const [updated] = await tx
    .update(syncCommands)
    .set({ status: "APPLIED", resultEntityType: "order_item", resultEntityId: item.id, resultSequence, processedAt: new Date() })
    .where(eq(syncCommands.id, command.id))
    .returning();

  return { id: command.id, status: updated?.status ?? "APPLIED", resultEntityType: "order_item", resultEntityId: item.id, resultSequence };
}

async function latestEntitySequence(
  db: Pick<ReturnType<typeof requireDb>, "select">,
  organizationId: string,
  entityType: string,
  entityId: string
) {
  const [row] = await db
    .select({ sequence: syncEvents.sequence })
    .from(syncEvents)
    .where(and(eq(syncEvents.organizationId, organizationId), eq(syncEvents.entityType, entityType), eq(syncEvents.entityId, entityId)))
    .orderBy(desc(syncEvents.sequence))
    .limit(1);
  return row?.sequence ?? 0;
}

async function rejectCommand(
  tx: Pick<ReturnType<typeof requireDb>, "update" | "insert">,
  c: Context<AppBindings>,
  access: OrganizationAccess,
  command: typeof syncCommands.$inferSelect,
  errorCode: string,
  errorMessage: string
) {
  const [rejected] = await tx
    .update(syncCommands)
    .set({ status: "REJECTED", errorCode, errorMessage, processedAt: new Date() })
    .where(eq(syncCommands.id, command.id))
    .returning();
  await writeAudit(tx, {
    organizationId: access.organizationId,
    actorUserId: access.actor.userId,
    action: "UPDATE",
    entityType: "sync_command",
    entityId: command.id,
    requestId: c.get("requestId"),
    metadata: { status: "REJECTED", errorCode }
  });
  return { id: command.id, status: rejected?.status ?? "REJECTED", errorCode };
}

async function ensureActiveDevice(db: Pick<ReturnType<typeof requireDb>, "select">, organizationId: string, deviceId: string) {
  const [device] = await db.select().from(devices).where(and(eq(devices.organizationId, organizationId), eq(devices.id, deviceId), eq(devices.status, "ACTIVE"))).limit(1);
  if (!device) throw new AppError("device_not_found", "Active device was not found", 404);
}

function readId(c: Context<AppBindings>) {
  const id = c.req.param()["id"];
  if (!id) throw new AppError("validation_failed", "Resource id is required", 400);
  return id;
}

export function isSameSyncCommandForReplay(
  existing: typeof syncCommands.$inferSelect,
  command: z.infer<typeof commandBatchSchema>["commands"][number]
) {
  return (
    existing.commandType === command.commandType &&
    existing.aggregateType === command.aggregateType &&
    (existing.aggregateId ?? undefined) === command.aggregateId &&
    existing.baseSequence === command.baseSequence &&
    stableJson(existing.payload) === stableJson(command.payload)
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function waitForNextPoll(milliseconds: number, signal: AbortSignal, isCancelled: () => boolean) {
  return new Promise<void>((resolve) => {
    if (signal.aborted || isCancelled()) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}

function requireDb(deps: AppDependencies) {
  if (!deps.db) throw new AppError("database_unavailable", "Database connection is not configured", 503);
  return deps.db;
}
