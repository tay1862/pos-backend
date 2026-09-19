import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import type { Database } from "../../db";
import {
  billItems,
  bills,
  employees,
  idempotencyKeys,
  kitchenJobItems,
  kitchenJobs,
  locations,
  orderItems,
  orders,
  payments,
  priceListItems,
  priceLists,
  productVariants,
  products,
  organizations,
  refunds,
  taxRates,
  ticketCounters,
  tickets
} from "../../db/schema";
import { AppError } from "../../infra/errors";
import { sha256Hex } from "../../infra/crypto";
import type { AppBindings, AppDependencies } from "../../http/context";
import { parseJsonBody } from "../../http/validation";
import { writeAudit } from "../audit/service";
import { requireLocationAccess, requireOrganizationAccess, type OrganizationAccess } from "../platform/access";
import { addDecimals, compareDecimals, divideDecimal, multiplyDecimal, subtractDecimal } from "./decimal";
import { isPositiveDecimalString } from "./decimal-input";
import { businessDateForTimezone } from "../../domain/business-date";

const decimalString = z.string().refine(isPositiveDecimalString, "Value must be greater than zero");

const createTicketSchema = z.object({
  locationId: z.string().uuid(),
  label: z.string().optional(),
  customerName: z.string().optional(),
  assignedEmployeeId: z.string().uuid().optional(),
  paymentTiming: z.enum(["PREPAY", "POSTPAY"]).optional(),
  context: z.enum(["DINE_IN", "TAKEAWAY", "RETAIL", "WHOLESALE"]).default("DINE_IN")
});

const updateTicketSchema = z.object({
  label: z.string().optional(),
  customerName: z.string().optional(),
  assignedEmployeeId: z.string().uuid().optional(),
  paymentTiming: z.enum(["PREPAY", "POSTPAY"]).optional(),
  version: z.number().int().positive()
});

const addOrderItemSchema = z.object({
  variantId: z.string().uuid(),
  priceListId: z.string().uuid().optional(),
  quantity: decimalString
});

const createBillSchema = z.object({
  items: z.array(z.object({ orderItemId: z.string().uuid(), quantity: decimalString })).min(1)
});

const paymentSchema = z.object({
  method: z.enum(["CASH", "QR", "TRANSFER", "CARD", "OTHER"]),
  amount: decimalString,
  reference: z.string().optional()
});

const refundSchema = z.object({
  paymentId: z.string().uuid(),
  amount: decimalString,
  reason: z.string().min(1)
});

const stateChangeSchema = z.object({
  version: z.number().int().positive()
});

export async function listTickets(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "tickets.view");
  const url = new URL(c.req.url);
  const status = url.searchParams.get("status");
  const rows = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.organizationId, access.organizationId), status ? eq(tickets.status, status as never) : undefined, access.isOwner ? undefined : inArray(tickets.locationId, access.locationIds)))
    .orderBy(desc(tickets.createdAt))
    .limit(100);

  return c.json({ data: rows });
}

export async function createTicket(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "tickets.create");
  const body = await parseJsonBody(c, createTicketSchema);
  await requireLocationAccess(db, access, body.locationId);

  const created = await db.transaction(async (tx) => {
    const [location] = await tx
      .select()
      .from(locations)
      .where(and(eq(locations.organizationId, access.organizationId), eq(locations.id, body.locationId), eq(locations.active, true)))
      .limit(1);
    if (!location) throw new AppError("location_not_found", "Location was not found or is inactive", 404);
    if (body.assignedEmployeeId) await ensureExists(tx, employees, access.organizationId, body.assignedEmployeeId, "employee_not_found");

    const businessDate = businessDateForTimezone(location.timezone);
    const [counter] = await tx
      .insert(ticketCounters)
      .values({ organizationId: access.organizationId, locationId: body.locationId, businessDate, nextSequence: 2 })
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
        locationId: body.locationId,
        number,
        label: body.label,
        customerName: body.customerName,
        assignedEmployeeId: body.assignedEmployeeId,
        paymentTiming: body.paymentTiming ?? (location.defaultPaymentTiming as "PREPAY" | "POSTPAY"),
        businessDate
      })
      .returning();

    if (!ticket) throw new AppError("ticket_create_failed", "Unable to create ticket", 500);

    const [order] = await tx
      .insert(orders)
      .values({
        organizationId: access.organizationId,
        ticketId: ticket.id,
        context: body.context
      })
      .returning();

    await writeAudit(tx, auditInput(c, access, "CREATE", "ticket", ticket.id));

    return { ticket, order };
  });

  return c.json({ data: created }, 201);
}

export async function getTicket(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "tickets.view");
  const id = readId(c);
  const [ticket] = await db.select().from(tickets).where(and(eq(tickets.organizationId, access.organizationId), eq(tickets.id, id))).limit(1);
  if (!ticket) throw new AppError("ticket_not_found", "Ticket was not found", 404);
  await requireLocationAccess(db, access, ticket.locationId);

  const [order] = await db.select().from(orders).where(and(eq(orders.organizationId, access.organizationId), eq(orders.ticketId, id))).limit(1);
  const items = order ? await db.select().from(orderItems).where(and(eq(orderItems.organizationId, access.organizationId), eq(orderItems.orderId, order.id))).orderBy(asc(orderItems.createdAt)) : [];
  const ticketBills = await db.select().from(bills).where(and(eq(bills.organizationId, access.organizationId), eq(bills.ticketId, id))).orderBy(asc(bills.createdAt));

  return c.json({ data: { ticket, order, items, bills: ticketBills } });
}

export async function updateTicket(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "tickets.update");
  const id = readId(c);
  const body = await parseJsonBody(c, updateTicketSchema);
  const [ticket] = await db.select({ locationId: tickets.locationId }).from(tickets).where(and(eq(tickets.organizationId, access.organizationId), eq(tickets.id, id), eq(tickets.status, "OPEN"))).limit(1);
  if (!ticket) throw new AppError("ticket_not_found", "Open ticket was not found", 404);
  await requireLocationAccess(db, access, ticket.locationId);

  if (body.assignedEmployeeId) await ensureExists(db, employees, access.organizationId, body.assignedEmployeeId, "employee_not_found");

  const [updated] = await db
    .update(tickets)
    .set({
      label: body.label,
      customerName: body.customerName,
      assignedEmployeeId: body.assignedEmployeeId,
      paymentTiming: body.paymentTiming,
      version: sql`${tickets.version} + 1`
    })
    .where(and(eq(tickets.organizationId, access.organizationId), eq(tickets.id, id), eq(tickets.version, body.version), eq(tickets.status, "OPEN")))
    .returning();

  if (!updated) throw new AppError("version_conflict", "Ticket was changed or is no longer open", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "ticket", id));
  return c.json({ data: updated });
}

export async function addOrderItem(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "tickets.update");
  const orderId = readId(c);
  const body = await parseJsonBody(c, addOrderItemSchema);

  const created = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.organizationId, access.organizationId), eq(orders.id, orderId), eq(orders.status, "OPEN"))).limit(1);
    if (!order) throw new AppError("order_not_found", "Open order was not found", 404);
    const [ticket] = await tx.select().from(tickets).where(and(eq(tickets.organizationId, access.organizationId), eq(tickets.id, order.ticketId), eq(tickets.status, "OPEN"))).limit(1);
    if (!ticket) throw new AppError("ticket_not_found", "Open ticket was not found", 404);
    await requireLocationAccess(tx as unknown as Database, access, ticket.locationId);
    const [organization] = await tx.select({ baseCurrency: organizations.baseCurrency, taxEnabled: organizations.taxEnabled }).from(organizations).where(eq(organizations.id, access.organizationId)).limit(1);
    if (!organization) throw new AppError("organization_not_found", "Organization was not found", 404);

    const [variantRow] = await tx
      .select({
        variant: productVariants,
        product: products
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(productVariants.organizationId, access.organizationId), eq(productVariants.id, body.variantId), eq(productVariants.active, true), eq(products.active, true)))
      .limit(1);

    if (!variantRow) throw new AppError("variant_not_found", "Variant was not found", 404);

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

    if (!selectedPriceListId) throw new AppError("price_list_not_found", "Default price list was not found", 404);
    const [selectedPriceList] = await tx.select().from(priceLists).where(and(eq(priceLists.organizationId, access.organizationId), eq(priceLists.id, selectedPriceListId), eq(priceLists.active, true))).limit(1);
    if (!selectedPriceList) throw new AppError("price_list_not_found", "Price list was not found or inactive", 404);
    if (selectedPriceList.currency !== organization.baseCurrency) throw new AppError("currency_mismatch", "Price list currency must match the organization base currency", 400);

    const [price] = await tx
      .select()
      .from(priceListItems)
      .where(and(eq(priceListItems.organizationId, access.organizationId), eq(priceListItems.priceListId, selectedPriceListId), eq(priceListItems.variantId, body.variantId), eq(priceListItems.active, true)))
      .limit(1);

    if (!price) throw new AppError("price_not_found", "Active price was not found for this variant", 404);

    const [tax] = price.taxRateId ? await tx.select().from(taxRates).where(and(eq(taxRates.organizationId, access.organizationId), eq(taxRates.id, price.taxRateId), eq(taxRates.active, true))).limit(1) : [];

    const [item] = await tx
      .insert(orderItems)
      .values({
        organizationId: access.organizationId,
        orderId,
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

    await writeAudit(tx, auditInput(c, access, "CREATE", "order_item", item?.id));
    return item;
  });

  return c.json({ data: created }, 201);
}

export async function createBill(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "tickets.update");
  const orderId = readId(c);
  const body = await parseJsonBody(c, createBillSchema);
  const billItemIds = body.items.map((item) => item.orderItemId);
  if (new Set(billItemIds).size !== billItemIds.length) throw new AppError("duplicate_bill_items", "An order item may appear only once per bill", 400);
  const idempotencyScope = `bill.create:${orderId}`;
  const idempotency = await readIdempotency(c, db, access, idempotencyScope, { orderId, body });
  if (idempotency.replay) return c.json(idempotency.replay.body, idempotency.replay.status as 200);

  const created = await db.transaction(async (tx) => {
    await reserveIdempotency(tx, access, idempotency, idempotencyScope);
    const [order] = await tx.select().from(orders).where(and(eq(orders.organizationId, access.organizationId), eq(orders.id, orderId), eq(orders.status, "OPEN"))).limit(1);
    if (!order) throw new AppError("order_not_found", "Open order was not found", 404);

    const [ticket] = await tx.select().from(tickets).where(and(eq(tickets.organizationId, access.organizationId), eq(tickets.id, order.ticketId), eq(tickets.status, "OPEN"))).limit(1);
    if (!ticket) throw new AppError("ticket_not_found", "Open ticket was not found", 404);
    await requireLocationAccess(tx as unknown as Database, access, ticket.locationId);
    await lockAggregate(tx, `ticket:${access.organizationId}:${ticket.id}`);
    const [organization] = await tx.select({ baseCurrency: organizations.baseCurrency, taxEnabled: organizations.taxEnabled }).from(organizations).where(eq(organizations.id, access.organizationId)).limit(1);
    if (!organization) throw new AppError("organization_not_found", "Organization was not found", 404);

    const existingBills = await tx.select().from(bills).where(and(eq(bills.organizationId, access.organizationId), eq(bills.ticketId, ticket.id)));
    const billNumber = `B-${(existingBills.length + 1).toString().padStart(4, "0")}`;

    let subtotalTotal = "0.000000";
    let taxTotal = "0.000000";
    const billItemValues = [];

    for (const allocation of body.items) {
      const [item] = await tx.select().from(orderItems).where(and(eq(orderItems.organizationId, access.organizationId), eq(orderItems.id, allocation.orderItemId), eq(orderItems.orderId, orderId), eq(orderItems.active, true))).limit(1);
      if (!item) throw new AppError("order_item_not_found", "Order item was not found", 404);

      const allocated = await allocatedQuantity(tx, access.organizationId, allocation.orderItemId);
      const remaining = subtractDecimal(item.quantity, allocated);
      if (compareDecimals(allocation.quantity, remaining) > 0) {
        throw new AppError("quantity_overallocated", "Bill quantity exceeds remaining order item quantity", 409);
      }

      const gross = multiplyDecimal(item.unitPrice, allocation.quantity);
      const taxEnabled = organization.taxEnabled;
      const tax = taxEnabled && item.taxIncludedInPriceSnapshot
        ? subtractDecimal(gross, divideDecimal(gross, addDecimals(["1.000000", item.taxRateSnapshot])))
        : taxEnabled
          ? multiplyDecimal(gross, item.taxRateSnapshot)
          : "0.000000";
      const subtotal = item.taxIncludedInPriceSnapshot && taxEnabled ? subtractDecimal(gross, tax) : gross;
      const total = item.taxIncludedInPriceSnapshot && taxEnabled ? gross : addDecimals([subtotal, tax]);
      subtotalTotal = addDecimals([subtotalTotal, subtotal]);
      taxTotal = addDecimals([taxTotal, tax]);

      billItemValues.push({
        organizationId: access.organizationId,
        orderItemId: item.id,
        quantity: allocation.quantity,
        unitPrice: item.unitPrice,
        subtotal,
        taxTotal: tax,
        total
      });
    }

    const total = addDecimals([subtotalTotal, taxTotal]);
    const [bill] = await tx
      .insert(bills)
      .values({
        organizationId: access.organizationId,
        orderId,
        ticketId: ticket.id,
        number: billNumber,
        currency: organization.baseCurrency,
        subtotal: subtotalTotal,
        taxTotal,
        total
      })
      .returning();

    if (!bill) throw new AppError("bill_create_failed", "Unable to create bill", 500);

    await tx.insert(billItems).values(billItemValues.map((value) => ({ ...value, billId: bill.id })));
    await writeAudit(tx, auditInput(c, access, "CREATE", "bill", bill.id));
    await completeIdempotency(tx, access, idempotency, 201, { data: bill });
    return bill;
  });

  return c.json({ data: created }, 201);
}

export async function issueBill(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "tickets.update");
  const id = readId(c);
  const updated = await db.transaction(async (tx) => {
    await lockAggregate(tx, `bill:${access.organizationId}:${id}`);
    const [bill] = await tx.select().from(bills).where(and(eq(bills.organizationId, access.organizationId), eq(bills.id, id))).limit(1);
    if (!bill) throw new AppError("bill_not_found", "Bill was not found", 404);
    await requireTicketLocation(tx, access, bill.ticketId);
    const [result] = await tx.update(bills).set({ status: "ISSUED", issuedAt: new Date(), version: sql`${bills.version} + 1` }).where(and(eq(bills.organizationId, access.organizationId), eq(bills.id, id), eq(bills.status, "DRAFT"))).returning();
    return result;
  });

  if (!updated) throw new AppError("bill_not_issuable", "Bill is not in draft status", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "bill", id));
  return c.json({ data: updated });
}

export async function voidBill(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "bills.void");
  const id = readId(c);
  const updated = await db.transaction(async (tx) => {
    await lockAggregate(tx, `bill:${access.organizationId}:${id}`);
    const [bill] = await tx.select().from(bills).where(and(eq(bills.organizationId, access.organizationId), eq(bills.id, id))).limit(1);
    if (!bill) throw new AppError("bill_not_found", "Bill was not found", 404);
    await requireTicketLocation(tx, access, bill.ticketId);
    const paid = await paidAmount(tx, access.organizationId, id);
    if (compareDecimals(paid, "0.000000") > 0) throw new AppError("bill_has_payments", "Paid bills must be refunded instead of voided", 409);
    const [result] = await tx.update(bills).set({ status: "VOIDED", voidedAt: new Date(), version: sql`${bills.version} + 1` }).where(and(eq(bills.organizationId, access.organizationId), eq(bills.id, id), ne(bills.status, "VOIDED"))).returning();
    return result;
  });

  if (!updated) throw new AppError("bill_not_found", "Bill was not found", 404);
  await writeAudit(db, auditInput(c, access, "UPDATE", "bill", id));
  return c.json({ data: updated });
}

export async function createPayment(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "tickets.update");
  const billId = readId(c);
  const body = await parseJsonBody(c, paymentSchema);
  const idempotencyScope = `payment.create:${billId}`;
  const idempotency = await readIdempotency(c, db, access, idempotencyScope, { billId, body });
  if (idempotency.replay) return c.json(idempotency.replay.body, idempotency.replay.status as 200);

  const created = await db.transaction(async (tx) => {
    await reserveIdempotency(tx, access, idempotency, idempotencyScope);
    const [bill] = await tx.select().from(bills).where(and(eq(bills.organizationId, access.organizationId), eq(bills.id, billId), eq(bills.status, "ISSUED"))).limit(1);
    if (!bill) throw new AppError("bill_not_found", "Issued bill was not found", 404);
    await requireTicketLocation(tx, access, bill.ticketId);
    await lockAggregate(tx, `bill:${access.organizationId}:${billId}`);

    const paid = await paidAmount(tx, access.organizationId, billId);
    const remaining = subtractDecimal(bill.total, paid);
    if (compareDecimals(body.amount, remaining) > 0) throw new AppError("payment_exceeds_due", "Payment exceeds remaining bill total", 409);

    const [payment] = await tx
      .insert(payments)
      .values({
        organizationId: access.organizationId,
        billId,
        method: body.method,
        amount: body.amount,
        currency: bill.currency,
        reference: body.reference,
        confirmedByUserId: access.actor.userId
      })
      .returning();

    await writeAudit(tx, auditInput(c, access, "CREATE", "payment", payment?.id));
    await completeIdempotency(tx, access, idempotency, 201, { data: payment });
    return payment;
  });

  return c.json({ data: created }, 201);
}

export async function createRefund(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "refunds.create");
  const body = await parseJsonBody(c, refundSchema);
  const idempotency = await readIdempotency(c, db, access, "refund.create", body);
  if (idempotency.replay) return c.json(idempotency.replay.body, idempotency.replay.status as 200);

  const created = await db.transaction(async (tx) => {
    await reserveIdempotency(tx, access, idempotency, "refund.create");
    const [payment] = await tx.select().from(payments).where(and(eq(payments.organizationId, access.organizationId), eq(payments.id, body.paymentId))).limit(1);
    if (!payment) throw new AppError("payment_not_found", "Payment was not found", 404);
    const [bill] = await tx.select().from(bills).where(and(eq(bills.organizationId, access.organizationId), eq(bills.id, payment.billId))).limit(1);
    if (!bill) throw new AppError("bill_not_found", "Payment bill was not found", 404);
    await requireTicketLocation(tx, access, bill.ticketId);
    await lockAggregate(tx, `payment:${access.organizationId}:${payment.id}`);

    const refunded = await refundedAmount(tx, access.organizationId, payment.id);
    const refundable = subtractDecimal(payment.amount, refunded);
    if (compareDecimals(body.amount, refundable) > 0) throw new AppError("refund_exceeds_payment", "Refund exceeds captured payment", 409);

    const [refund] = await tx
      .insert(refunds)
      .values({
        organizationId: access.organizationId,
        paymentId: payment.id,
        amount: body.amount,
        currency: payment.currency,
        reason: body.reason,
        createdByUserId: access.actor.userId
      })
      .returning();

    await writeAudit(tx, auditInput(c, access, "CREATE", "refund", refund?.id));
    await completeIdempotency(tx, access, idempotency, 201, { data: refund });
    return refund;
  });

  return c.json({ data: created }, 201);
}

export async function closeTicket(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "tickets.close");
  const id = readId(c);
  const body = await parseJsonBody(c, stateChangeSchema);

  const updated = await db.transaction(async (tx) => {
    await lockAggregate(tx, `ticket:${access.organizationId}:${id}`);
    const [ticket] = await tx.select().from(tickets).where(and(eq(tickets.organizationId, access.organizationId), eq(tickets.id, id), eq(tickets.version, body.version), eq(tickets.status, "OPEN"))).limit(1);
    if (!ticket) throw new AppError("version_conflict", "Ticket was changed or is no longer open", 409);
    await requireLocationAccess(tx as unknown as Database, access, ticket.locationId);

    const openDue = await ticketOutstanding(tx, access.organizationId, id);
    if (compareDecimals(openDue, "0.000000") > 0) throw new AppError("ticket_has_due", "Ticket still has unpaid issued bills", 409);
    const [order] = await tx.select().from(orders).where(and(eq(orders.organizationId, access.organizationId), eq(orders.ticketId, id))).limit(1);
    if (!order) throw new AppError("order_not_found", "Ticket order was not found", 404);
    const activeItems = await tx.select().from(orderItems).where(and(eq(orderItems.organizationId, access.organizationId), eq(orderItems.orderId, order.id), eq(orderItems.active, true)));
    for (const item of activeItems) {
      const allocated = await allocatedQuantity(tx, access.organizationId, item.id);
      if (compareDecimals(subtractDecimal(item.quantity, allocated), "0.000000") > 0) throw new AppError("ticket_has_unbilled_items", "Ticket still has unbilled items", 409);
    }
    const [activeKitchen] = await tx.select({ id: kitchenJobItems.id }).from(kitchenJobItems).innerJoin(kitchenJobs, eq(kitchenJobs.id, kitchenJobItems.kitchenJobId)).where(and(eq(kitchenJobItems.organizationId, access.organizationId), eq(kitchenJobs.ticketId, id), inArray(kitchenJobItems.status, ["QUEUED", "PREPARING", "READY"]))).limit(1);
    if (activeKitchen) throw new AppError("ticket_has_active_kitchen_jobs", "Ticket has kitchen work that is not complete", 409);
    const [result] = await tx.update(tickets).set({ status: "CLOSED", closedAt: new Date(), version: sql`${tickets.version} + 1` }).where(and(eq(tickets.organizationId, access.organizationId), eq(tickets.id, id), eq(tickets.version, body.version))).returning();
    if (!result) throw new AppError("version_conflict", "Ticket was changed or is no longer open", 409);
    await writeAudit(tx, auditInput(c, access, "UPDATE", "ticket", id));
    return result;
  });
  return c.json({ data: updated });
}

export async function cancelTicket(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "tickets.cancel");
  const id = readId(c);
  const body = await parseJsonBody(c, stateChangeSchema);
  const updated = await db.transaction(async (tx) => {
    await lockAggregate(tx, `ticket:${access.organizationId}:${id}`);
    await requireTicketLocation(tx, access, id);
    const paid = await ticketPaidAmount(tx, access.organizationId, id);
    if (compareDecimals(paid, "0.000000") > 0) throw new AppError("ticket_has_payments", "Ticket has payments and cannot be cancelled", 409);
    const [activeKitchen] = await tx.select({ id: kitchenJobItems.id }).from(kitchenJobItems).innerJoin(kitchenJobs, eq(kitchenJobs.id, kitchenJobItems.kitchenJobId)).where(and(eq(kitchenJobItems.organizationId, access.organizationId), eq(kitchenJobs.ticketId, id), inArray(kitchenJobItems.status, ["QUEUED", "PREPARING", "READY"]))).limit(1);
    if (activeKitchen) throw new AppError("ticket_has_active_kitchen_jobs", "Ticket has kitchen work that is not complete", 409);
    const [result] = await tx.update(tickets).set({ status: "CANCELLED", cancelledAt: new Date(), version: sql`${tickets.version} + 1` }).where(and(eq(tickets.organizationId, access.organizationId), eq(tickets.id, id), eq(tickets.version, body.version), eq(tickets.status, "OPEN"))).returning();
    if (!result) throw new AppError("version_conflict", "Ticket was changed or is no longer open", 409);
    await writeAudit(tx, auditInput(c, access, "UPDATE", "ticket", id));
    return result;
  });
  return c.json({ data: updated });
}

async function allocatedQuantity(db: Pick<ReturnType<typeof requireDb>, "select">, organizationId: string, orderItemId: string) {
  const [row] = await db
    .select({ quantity: sql<string>`coalesce(sum(${billItems.quantity}), 0)::text` })
    .from(billItems)
    .innerJoin(bills, eq(bills.id, billItems.billId))
    .where(and(eq(billItems.organizationId, organizationId), eq(billItems.orderItemId, orderItemId), ne(bills.status, "VOIDED")))
    .limit(1);

  return row?.quantity ?? "0.000000";
}

async function paidAmount(db: Pick<ReturnType<typeof requireDb>, "select">, organizationId: string, billId: string) {
  const [paymentRow] = await db
    .select({ amount: sql<string>`coalesce(sum(${payments.amount}), 0)::text` })
    .from(payments)
    .where(and(eq(payments.organizationId, organizationId), eq(payments.billId, billId)))
    .limit(1);
  const [refundRow] = await db
    .select({ amount: sql<string>`coalesce(sum(${refunds.amount}), 0)::text` })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .where(and(eq(refunds.organizationId, organizationId), eq(payments.billId, billId)))
    .limit(1);

  return subtractDecimal(paymentRow?.amount ?? "0.000000", refundRow?.amount ?? "0.000000");
}

async function refundedAmount(db: Pick<ReturnType<typeof requireDb>, "select">, organizationId: string, paymentId: string) {
  const [row] = await db
    .select({ amount: sql<string>`coalesce(sum(${refunds.amount}), 0)::text` })
    .from(refunds)
    .where(and(eq(refunds.organizationId, organizationId), eq(refunds.paymentId, paymentId)))
    .limit(1);

  return row?.amount ?? "0.000000";
}

async function readIdempotency(
  c: Context<AppBindings>,
  db: Pick<ReturnType<typeof requireDb>, "select">,
  access: { organizationId: string; actor: { userId: string } },
  scope: string,
  body: unknown
) {
  const key = c.req.header("Idempotency-Key");
  if (!key) throw new AppError("idempotency_key_required", "Idempotency-Key header is required", 400);

  const requestHash = await sha256Hex(JSON.stringify(body));
  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.organizationId, access.organizationId), eq(idempotencyKeys.userId, access.actor.userId), eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
    .limit(1);

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new AppError("idempotency_key_conflict", "Idempotency-Key was already used with a different payload", 409);
    }

    if (existing.responseStatus && existing.responseBody) {
      return { key, requestHash, replay: { status: existing.responseStatus, body: existing.responseBody } };
    }

    throw new AppError("idempotency_key_in_progress", "Idempotent request is already in progress", 409);
  }

  return { key, requestHash };
}

async function reserveIdempotency(
  db: Pick<ReturnType<typeof requireDb>, "insert">,
  access: { organizationId: string; actor: { userId: string } },
  idempotency: { key: string; requestHash: string },
  scope: string
) {
  const [inserted] = await db.insert(idempotencyKeys).values({
    organizationId: access.organizationId,
    userId: access.actor.userId,
    key: idempotency.key,
    scope,
    requestHash: idempotency.requestHash,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
  }).onConflictDoNothing({ target: [idempotencyKeys.organizationId, idempotencyKeys.userId, idempotencyKeys.scope, idempotencyKeys.key] }).returning({ id: idempotencyKeys.id });
  if (!inserted) throw new AppError("idempotency_key_in_progress", "Idempotent request is already in progress", 409);
}

async function lockAggregate(tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

async function requireTicketLocation(tx: Pick<ReturnType<typeof requireDb>, "select">, access: OrganizationAccess, ticketId: string) {
  const [ticket] = await tx.select({ locationId: tickets.locationId }).from(tickets).where(and(eq(tickets.organizationId, access.organizationId), eq(tickets.id, ticketId))).limit(1);
  if (!ticket) throw new AppError("ticket_not_found", "Ticket was not found", 404);
  await requireLocationAccess(tx as unknown as Database, access, ticket.locationId);
}

async function completeIdempotency(
  db: Pick<ReturnType<typeof requireDb>, "update">,
  access: { organizationId: string; actor: { userId: string } },
  idempotency: { key: string },
  status: number,
  body: Record<string, unknown>
) {
  await db
    .update(idempotencyKeys)
    .set({ responseStatus: status, responseBody: body })
    .where(and(eq(idempotencyKeys.organizationId, access.organizationId), eq(idempotencyKeys.userId, access.actor.userId), eq(idempotencyKeys.key, idempotency.key)));
}

async function ticketOutstanding(db: Pick<ReturnType<typeof requireDb>, "select">, organizationId: string, ticketId: string) {
  const ticketBills = await db.select().from(bills).where(and(eq(bills.organizationId, organizationId), eq(bills.ticketId, ticketId), eq(bills.status, "ISSUED")));
  const dues = [];
  for (const bill of ticketBills) {
    dues.push(subtractDecimal(bill.total, await paidAmount(db, organizationId, bill.id)));
  }

  return addDecimals(dues);
}

async function ticketPaidAmount(db: Pick<ReturnType<typeof requireDb>, "select">, organizationId: string, ticketId: string) {
  const ticketBills = await db.select().from(bills).where(and(eq(bills.organizationId, organizationId), eq(bills.ticketId, ticketId)));
  const amounts = [];
  for (const bill of ticketBills) {
    amounts.push(await paidAmount(db, organizationId, bill.id));
  }

  return addDecimals(amounts);
}

async function ensureExists(
  db: Pick<ReturnType<typeof requireDb>, "select">,
  table: typeof locations | typeof employees,
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
