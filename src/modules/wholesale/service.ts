import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import type { Database } from "../../db";
import {
  customerPriceLists,
  customers,
  idempotencyKeys,
  locations,
  priceLists,
  productVariants,
  quotationItems,
  quotations,
  receivablePayments,
  wholesaleInvoiceItems,
  wholesaleInvoices,
  organizations
} from "../../db/schema";
import type { AppBindings, AppDependencies } from "../../http/context";
import { parseJsonBody } from "../../http/validation";
import { AppError } from "../../infra/errors";
import { sha256Hex } from "../../infra/crypto";
import { addDecimals, compareDecimals, multiplyDecimal, subtractDecimal } from "../sales/decimal";
import { writeAudit } from "../audit/service";
import { requireLocationAccess, requireOrganizationAccess, type OrganizationAccess } from "../platform/access";

const decimalString = z.string().regex(/^\d+(\.\d{1,6})?$/);
const positiveDecimalString = decimalString.refine((value) => compareDecimals(value, "0.000000") > 0, "Must be positive");

const customerCreateSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  billingAddress: z.string().optional(),
  paymentTermsDays: z.number().int().min(0).max(365).default(0),
  creditLimit: decimalString.default("0.000000"),
  active: z.boolean().default(true)
});

const customerUpdateSchema = customerCreateSchema.partial().extend({ version: z.number().int().positive() });

const customerPriceListSchema = z.object({
  priceListId: z.string().uuid(),
  priority: z.number().int().default(0),
  active: z.boolean().default(true)
});

const documentItemSchema = z.object({
  variantId: z.string().uuid(),
  description: z.string().min(1),
  quantity: positiveDecimalString,
  unitPrice: decimalString
});

const quotationCreateSchema = z.object({
  customerId: z.string().uuid(),
  locationId: z.string().uuid(),
  quoteNumber: z.string().min(1).max(40),
  currency: z.string().length(3).optional(),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
  items: z.array(documentItemSchema).min(1)
});

const invoiceCreateSchema = z.object({
  customerId: z.string().uuid(),
  locationId: z.string().uuid(),
  quotationId: z.string().uuid().optional(),
  invoiceNumber: z.string().min(1).max(40),
  currency: z.string().length(3).optional(),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
  items: z.array(documentItemSchema).min(1)
});

const versionSchema = z.object({ version: z.number().int().positive() });

const receivablePaymentSchema = z.object({
  amount: positiveDecimalString,
  method: z.enum(["CASH", "QR", "TRANSFER", "CARD", "OTHER"]),
  reference: z.string().optional()
});

export async function listCustomers(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "wholesale.view");
  const search = new URL(c.req.url).searchParams.get("search");
  const rows = await db
    .select()
    .from(customers)
    .where(search ? and(eq(customers.organizationId, access.organizationId), ilike(customers.name, `%${search}%`)) : eq(customers.organizationId, access.organizationId))
    .orderBy(asc(customers.name))
    .limit(100);
  return c.json({ data: rows });
}

export async function createCustomer(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "wholesale.manage");
  const body = await parseJsonBody(c, customerCreateSchema);
  const [created] = await db.insert(customers).values({ ...body, code: body.code.toUpperCase(), organizationId: access.organizationId }).returning();
  await writeAudit(db, auditInput(c, access, "CREATE", "customer", created?.id));
  return c.json({ data: created }, 201);
}

export async function updateCustomer(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "wholesale.manage");
  const body = await parseJsonBody(c, customerUpdateSchema);
  const id = readId(c);
  const [updated] = await db
    .update(customers)
    .set({
      code: body.code?.toUpperCase(),
      name: body.name,
      email: body.email,
      phone: body.phone,
      taxId: body.taxId,
      billingAddress: body.billingAddress,
      paymentTermsDays: body.paymentTermsDays,
      creditLimit: body.creditLimit,
      active: body.active,
      version: sql`${customers.version} + 1`
    })
    .where(and(eq(customers.organizationId, access.organizationId), eq(customers.id, id), eq(customers.version, body.version)))
    .returning();
  if (!updated) throw new AppError("version_conflict", "Customer was changed by another request", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "customer", id));
  return c.json({ data: updated });
}

export async function assignCustomerPriceList(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "wholesale.manage");
  const id = readId(c);
  const body = await parseJsonBody(c, customerPriceListSchema);
  await ensureExists(db, customers, access.organizationId, id, "customer_not_found");
  await ensureExists(db, priceLists, access.organizationId, body.priceListId, "price_list_not_found");
  await db
    .insert(customerPriceLists)
    .values({ organizationId: access.organizationId, customerId: id, priceListId: body.priceListId, priority: body.priority, active: body.active })
    .onConflictDoUpdate({ target: [customerPriceLists.organizationId, customerPriceLists.customerId, customerPriceLists.priceListId], set: { priority: body.priority, active: body.active } });
  await writeAudit(db, auditInput(c, access, "UPDATE", "customer_price_list", id));
  return c.json({ data: { ok: true } });
}

export async function listQuotations(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "wholesale.view");
  const rows = await db.select().from(quotations).where(and(eq(quotations.organizationId, access.organizationId), access.isOwner ? undefined : inArray(quotations.locationId, access.locationIds))).orderBy(asc(quotations.createdAt)).limit(100);
  return c.json({ data: rows });
}

export async function createQuotation(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "wholesale.manage");
  const body = await parseJsonBody(c, quotationCreateSchema);
  const created = await db.transaction(async (tx) => {
    await ensureExists(tx, customers, access.organizationId, body.customerId, "customer_not_found");
    const [location] = await tx.select({ id: locations.id }).from(locations).where(and(eq(locations.organizationId, access.organizationId), eq(locations.id, body.locationId), eq(locations.active, true))).limit(1);
    if (!location) throw new AppError("location_not_found", "Location was not found or inactive", 404);
    await requireLocationAccess(tx as unknown as Database, access, body.locationId);
    const [organization] = await tx.select({ baseCurrency: organizations.baseCurrency }).from(organizations).where(eq(organizations.id, access.organizationId)).limit(1);
    const currency = (body.currency ?? organization?.baseCurrency)?.toUpperCase();
    if (!organization || currency !== organization.baseCurrency) throw new AppError("currency_mismatch", "Document currency must match the organization base currency", 400);
    const items = await prepareItems(tx, access.organizationId, body.items);
    const subtotal = addDecimals(items.map((item) => item.lineTotal));
    const [quotation] = await tx.insert(quotations).values({ organizationId: access.organizationId, customerId: body.customerId, locationId: body.locationId, quoteNumber: body.quoteNumber, currency, expiresOn: body.expiresOn, notes: body.notes, subtotal, createdByUserId: access.actor.userId }).returning();
    if (!quotation) throw new AppError("quotation_create_failed", "Unable to create quotation", 500);
    await tx.insert(quotationItems).values(items.map((item) => ({ ...item, organizationId: access.organizationId, quotationId: quotation.id })));
    await writeAudit(tx, auditInput(c, access, "CREATE", "quotation", quotation.id));
    return quotation;
  });
  return c.json({ data: created }, 201);
}

export async function transitionQuotation(c: Context<AppBindings>, deps: AppDependencies, action: "send" | "accept" | "cancel") {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "wholesale.manage");
  const id = readId(c);
  const body = await parseJsonBody(c, versionSchema);
  await requireQuotationLocation(db, access, id);
  const status = action === "send" ? "SENT" : action === "accept" ? "ACCEPTED" : "CANCELLED";
  const allowed = action === "send" ? "DRAFT" : action === "accept" ? "SENT" : undefined;
  const [updated] = await db
    .update(quotations)
    .set({ status, sentAt: action === "send" ? new Date() : undefined, acceptedAt: action === "accept" ? new Date() : undefined, version: sql`${quotations.version} + 1` })
    .where(and(eq(quotations.organizationId, access.organizationId), eq(quotations.id, id), eq(quotations.version, body.version), allowed ? eq(quotations.status, allowed) : undefined))
    .returning();
  if (!updated) throw new AppError("version_conflict", "Quotation was changed or is not in a valid status", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "quotation", id));
  return c.json({ data: updated });
}

export async function listInvoices(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "wholesale.view");
  const rows = await db.select().from(wholesaleInvoices).where(and(eq(wholesaleInvoices.organizationId, access.organizationId), access.isOwner ? undefined : inArray(wholesaleInvoices.locationId, access.locationIds))).orderBy(asc(wholesaleInvoices.createdAt)).limit(100);
  return c.json({ data: rows });
}

export async function createInvoice(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "wholesale.manage");
  const body = await parseJsonBody(c, invoiceCreateSchema);
  const created = await db.transaction(async (tx) => {
    await ensureExists(tx, customers, access.organizationId, body.customerId, "customer_not_found");
    const [location] = await tx.select({ id: locations.id }).from(locations).where(and(eq(locations.organizationId, access.organizationId), eq(locations.id, body.locationId), eq(locations.active, true))).limit(1);
    if (!location) throw new AppError("location_not_found", "Location was not found or inactive", 404);
    await requireLocationAccess(tx as unknown as Database, access, body.locationId);
    const [organization] = await tx.select({ baseCurrency: organizations.baseCurrency }).from(organizations).where(eq(organizations.id, access.organizationId)).limit(1);
    const currency = (body.currency ?? organization?.baseCurrency)?.toUpperCase();
    if (!organization || currency !== organization.baseCurrency) throw new AppError("currency_mismatch", "Document currency must match the organization base currency", 400);
    if (body.quotationId) {
      const [quotation] = await tx.select().from(quotations).where(and(eq(quotations.organizationId, access.organizationId), eq(quotations.id, body.quotationId), eq(quotations.customerId, body.customerId), eq(quotations.locationId, body.locationId), eq(quotations.status, "ACCEPTED"))).limit(1);
      if (!quotation) throw new AppError("quotation_not_found", "Accepted quotation was not found for this customer and location", 404);
      if (quotation.currency !== currency) throw new AppError("currency_mismatch", "Invoice and quotation currencies must match", 400);
    }
    const items = await prepareItems(tx, access.organizationId, body.items);
    const total = addDecimals(items.map((item) => item.lineTotal));
    const [invoice] = await tx.insert(wholesaleInvoices).values({ organizationId: access.organizationId, customerId: body.customerId, locationId: body.locationId, quotationId: body.quotationId, invoiceNumber: body.invoiceNumber, currency, issuedOn: body.issuedOn, dueOn: body.dueOn, subtotal: total, total, notes: body.notes, createdByUserId: access.actor.userId }).returning();
    if (!invoice) throw new AppError("invoice_create_failed", "Unable to create invoice", 500);
    await tx.insert(wholesaleInvoiceItems).values(items.map((item) => ({ ...item, organizationId: access.organizationId, invoiceId: invoice.id })));
    await writeAudit(tx, auditInput(c, access, "CREATE", "wholesale_invoice", invoice.id));
    return invoice;
  });
  return c.json({ data: created }, 201);
}

export async function issueInvoice(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "wholesale.manage");
  const id = readId(c);
  const body = await parseJsonBody(c, versionSchema);
  await requireInvoiceLocation(db, access, id);
  const [updated] = await db.update(wholesaleInvoices).set({ status: "ISSUED", version: sql`${wholesaleInvoices.version} + 1` }).where(and(eq(wholesaleInvoices.organizationId, access.organizationId), eq(wholesaleInvoices.id, id), eq(wholesaleInvoices.version, body.version), eq(wholesaleInvoices.status, "DRAFT"))).returning();
  if (!updated) throw new AppError("version_conflict", "Invoice was changed or is not draft", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "wholesale_invoice", id));
  return c.json({ data: updated });
}

export async function voidInvoice(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "wholesale.manage");
  const id = readId(c);
  const body = await parseJsonBody(c, versionSchema);
  await requireInvoiceLocation(db, access, id);
  const updated = await db.transaction(async (tx) => {
    await lockAggregate(tx, `receivable-invoice:${access.organizationId}:${id}`);
    const paid = await paidAmount(tx, access.organizationId, id);
    if (compareDecimals(paid, "0.000000") > 0) throw new AppError("invoice_has_payments", "Paid invoices cannot be voided", 409);
    const [result] = await tx.update(wholesaleInvoices).set({ status: "VOIDED", version: sql`${wholesaleInvoices.version} + 1` }).where(and(eq(wholesaleInvoices.organizationId, access.organizationId), eq(wholesaleInvoices.id, id), eq(wholesaleInvoices.version, body.version))).returning();
    return result;
  });
  if (!updated) throw new AppError("version_conflict", "Invoice was changed", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "wholesale_invoice", id));
  return c.json({ data: updated });
}

export async function createReceivablePayment(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "receivables.manage");
  const id = readId(c);
  const body = await parseJsonBody(c, receivablePaymentSchema);
  const key = c.req.header("Idempotency-Key");
  if (!key) throw new AppError("idempotency_key_required", "Idempotency-Key header is required", 400);
  const requestHash = await sha256Hex(JSON.stringify(body));
  const [existing] = await db.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.organizationId, access.organizationId), eq(idempotencyKeys.userId, access.actor.userId), eq(idempotencyKeys.scope, "receivable-payment.create"), eq(idempotencyKeys.key, key))).limit(1);
  if (existing) {
    if (existing.requestHash !== requestHash) throw new AppError("idempotency_key_conflict", "Idempotency-Key was already used with a different payload", 409);
    if (existing.responseStatus && existing.responseBody) return c.json(existing.responseBody, existing.responseStatus as 200);
    throw new AppError("idempotency_key_in_progress", "Idempotent request is already in progress", 409);
  }
  const created = await db.transaction(async (tx) => {
    const [reserved] = await tx.insert(idempotencyKeys).values({ organizationId: access.organizationId, userId: access.actor.userId, key, scope: "receivable-payment.create", requestHash, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) }).onConflictDoNothing({ target: [idempotencyKeys.organizationId, idempotencyKeys.userId, idempotencyKeys.scope, idempotencyKeys.key] }).returning({ id: idempotencyKeys.id });
    if (!reserved) throw new AppError("idempotency_key_in_progress", "Idempotent request is already in progress", 409);
    await lockAggregate(tx, `receivable-invoice:${access.organizationId}:${id}`);
    const [invoice] = await tx.select().from(wholesaleInvoices).where(and(eq(wholesaleInvoices.organizationId, access.organizationId), eq(wholesaleInvoices.id, id))).limit(1);
    if (!invoice) throw new AppError("invoice_not_found", "Invoice was not found", 404);
    await requireLocationAccess(tx as unknown as Database, access, invoice.locationId);
    if (!["ISSUED", "PARTIALLY_PAID"].includes(invoice.status)) throw new AppError("invoice_not_payable", "Invoice is not payable", 409);
    const paid = await paidAmount(tx, access.organizationId, id);
    const remaining = subtractDecimal(invoice.total, paid);
    if (compareDecimals(body.amount, remaining) > 0) throw new AppError("payment_exceeds_due", "Payment exceeds invoice balance", 409);
    const [payment] = await tx.insert(receivablePayments).values({ organizationId: access.organizationId, invoiceId: id, amount: body.amount, method: body.method, reference: body.reference, receivedByUserId: access.actor.userId }).returning();
    const status = compareDecimals(body.amount, remaining) === 0 ? "PAID" : "PARTIALLY_PAID";
    await tx.update(wholesaleInvoices).set({ status, version: sql`${wholesaleInvoices.version} + 1` }).where(eq(wholesaleInvoices.id, id));
    await writeAudit(tx, auditInput(c, access, "CREATE", "receivable_payment", payment?.id));
    await tx.update(idempotencyKeys).set({ responseStatus: 201, responseBody: { data: payment } }).where(and(eq(idempotencyKeys.organizationId, access.organizationId), eq(idempotencyKeys.userId, access.actor.userId), eq(idempotencyKeys.scope, "receivable-payment.create"), eq(idempotencyKeys.key, key)));
    return payment;
  });
  return c.json({ data: created }, 201);
}

export async function listReceivables(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "wholesale.view");
  const rows = await db
    .select({
      invoiceId: wholesaleInvoices.id,
      invoiceNumber: wholesaleInvoices.invoiceNumber,
      customerId: wholesaleInvoices.customerId,
      status: wholesaleInvoices.status,
      total: wholesaleInvoices.total,
      paid: sql<string>`coalesce(sum(${receivablePayments.amount}), 0)::text`,
      outstanding: sql<string>`(${wholesaleInvoices.total} - coalesce(sum(${receivablePayments.amount}), 0))::text`
    })
    .from(wholesaleInvoices)
    .leftJoin(receivablePayments, and(eq(receivablePayments.organizationId, wholesaleInvoices.organizationId), eq(receivablePayments.invoiceId, wholesaleInvoices.id)))
    .where(eq(wholesaleInvoices.organizationId, access.organizationId))
    .groupBy(wholesaleInvoices.id)
    .limit(100);
  return c.json({ data: rows });
}

async function prepareItems(db: Pick<ReturnType<typeof requireDb>, "select">, organizationId: string, items: z.infer<typeof documentItemSchema>[]) {
  const output = [];
  for (const item of items) {
    await ensureExists(db, productVariants, organizationId, item.variantId, "variant_not_found");
    output.push({ ...item, lineTotal: multiplyDecimal(item.quantity, item.unitPrice) });
  }
  return output;
}

async function paidAmount(db: Pick<ReturnType<typeof requireDb>, "select">, organizationId: string, invoiceId: string) {
  const [row] = await db
    .select({ value: sql<string>`coalesce(sum(${receivablePayments.amount}), 0)::text` })
    .from(receivablePayments)
    .where(and(eq(receivablePayments.organizationId, organizationId), eq(receivablePayments.invoiceId, invoiceId)));
  return row?.value ?? "0.000000";
}

async function ensureExists(
  db: Pick<ReturnType<typeof requireDb>, "select">,
  table: typeof customers | typeof locations | typeof priceLists | typeof productVariants | typeof quotations,
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

function auditInput(c: Context<AppBindings>, access: { organizationId: string; actor: { userId: string } }, action: "CREATE" | "UPDATE", entityType: string, entityId?: string) {
  return { organizationId: access.organizationId, actorUserId: access.actor.userId, action, entityType, entityId, requestId: c.get("requestId") };
}

function requireDb(deps: AppDependencies) {
  if (!deps.db) throw new AppError("database_unavailable", "Database connection is not configured", 503);
  return deps.db;
}

async function lockAggregate(tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

async function requireQuotationLocation(db: Pick<ReturnType<typeof requireDb>, "select">, access: OrganizationAccess, quotationId: string) {
  const [quotation] = await db.select({ locationId: quotations.locationId }).from(quotations).where(and(eq(quotations.organizationId, access.organizationId), eq(quotations.id, quotationId))).limit(1);
  if (!quotation) throw new AppError("quotation_not_found", "Quotation was not found", 404);
  await requireLocationAccess(db as unknown as Database, access, quotation.locationId);
}

async function requireInvoiceLocation(db: Pick<ReturnType<typeof requireDb>, "select">, access: OrganizationAccess, invoiceId: string) {
  const [invoice] = await db.select({ locationId: wholesaleInvoices.locationId }).from(wholesaleInvoices).where(and(eq(wholesaleInvoices.organizationId, access.organizationId), eq(wholesaleInvoices.id, invoiceId))).limit(1);
  if (!invoice) throw new AppError("invoice_not_found", "Invoice was not found", 404);
  await requireLocationAccess(db as unknown as Database, access, invoice.locationId);
}
