import { and, asc, eq, ilike, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import {
  catalogCategories,
  organizations,
  priceListItems,
  priceLists,
  productVariants,
  products,
  taxRates,
  units
} from "../../db/schema";
import { AppError } from "../../infra/errors";
import type { AppBindings, AppDependencies } from "../../http/context";
import { parseJsonBody } from "../../http/validation";
import { writeAudit } from "../audit/service";
import { requireOrganizationAccess } from "../platform/access";

const decimalString = z.string().regex(/^\d+(\.\d{1,6})?$/);

const categoryCreateSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true)
});

const categoryUpdateSchema = categoryCreateSchema.partial().extend({ version: z.number().int().positive() });

const unitCreateSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1),
  symbol: z.string().min(1).max(16),
  precision: z.number().int().min(0).max(6).default(0),
  quantityStep: decimalString.default("1"),
  active: z.boolean().default(true)
});

const unitUpdateSchema = unitCreateSchema.partial().extend({ version: z.number().int().positive() });

const productCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  type: z.enum(["RETAIL", "SERVICE", "PREPARED", "RAW_MATERIAL"]).default("RETAIL"),
  trackInventory: z.boolean().default(false),
  taxable: z.boolean().default(false),
  active: z.boolean().default(true)
});

const productUpdateSchema = productCreateSchema.partial().extend({ version: z.number().int().positive() });

const variantCreateSchema = z.object({
  productId: z.string().uuid(),
  unitId: z.string().uuid(),
  sku: z.string().min(1).max(80).optional(),
  barcode: z.string().min(1).max(80).optional(),
  name: z.string().min(1),
  active: z.boolean().default(true)
});

const variantUpdateSchema = variantCreateSchema.partial().extend({ version: z.number().int().positive() });

const taxRateCreateSchema = z.object({
  name: z.string().min(1),
  rate: decimalString,
  includedInPrice: z.boolean().default(false),
  default: z.boolean().default(false),
  active: z.boolean().default(true)
});

const taxRateUpdateSchema = taxRateCreateSchema.partial().extend({ version: z.number().int().positive() });

const priceListCreateSchema = z.object({
  name: z.string().min(1),
  currency: z.string().length(3).optional(),
  default: z.boolean().default(false),
  active: z.boolean().default(true)
});

const priceListUpdateSchema = priceListCreateSchema.partial().extend({ version: z.number().int().positive() });

const priceListItemCreateSchema = z.object({
  priceListId: z.string().uuid(),
  variantId: z.string().uuid(),
  taxRateId: z.string().uuid().optional(),
  price: decimalString,
  serviceChargeEligible: z.boolean().default(true),
  active: z.boolean().default(true)
});

const priceListItemUpdateSchema = priceListItemCreateSchema.partial().extend({ version: z.number().int().positive() });

export async function listCategories(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.view");
  const url = new URL(c.req.url);
  const search = url.searchParams.get("search");
  const rows = await db
    .select()
    .from(catalogCategories)
    .where(search ? and(eq(catalogCategories.organizationId, access.organizationId), ilike(catalogCategories.name, `%${search}%`)) : eq(catalogCategories.organizationId, access.organizationId))
    .orderBy(asc(catalogCategories.sortOrder), asc(catalogCategories.name))
    .limit(100);

  return c.json({ data: rows });
}

export async function createCategory(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.manage");
  const body = await parseJsonBody(c, categoryCreateSchema);

  if (body.parentId) await ensureExists(db, catalogCategories, access.organizationId, body.parentId, "parent_category_not_found");

  const [created] = await db
    .insert(catalogCategories)
    .values({ ...body, organizationId: access.organizationId })
    .returning();

  await writeAudit(db, auditInput(c, access, "CREATE", "catalog_category", created?.id));
  return c.json({ data: created }, 201);
}

export async function updateCategory(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.manage");
  const body = await parseJsonBody(c, categoryUpdateSchema);
  const id = readId(c);

  if (body.parentId) await ensureExists(db, catalogCategories, access.organizationId, body.parentId, "parent_category_not_found");

  const [updated] = await db
    .update(catalogCategories)
    .set({
      name: body.name,
      parentId: body.parentId,
      sortOrder: body.sortOrder,
      active: body.active,
      version: sql`${catalogCategories.version} + 1`
    })
    .where(and(eq(catalogCategories.organizationId, access.organizationId), eq(catalogCategories.id, id), eq(catalogCategories.version, body.version)))
    .returning();

  if (!updated) throw new AppError("version_conflict", "Category was changed by another request", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "catalog_category", id));
  return c.json({ data: updated });
}

export async function listUnits(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.view");
  const rows = await db.select().from(units).where(eq(units.organizationId, access.organizationId)).orderBy(asc(units.name));
  return c.json({ data: rows });
}

export async function createUnit(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.manage");
  const body = await parseJsonBody(c, unitCreateSchema);
  const [created] = await db.insert(units).values({ ...body, code: body.code.toUpperCase(), organizationId: access.organizationId }).returning();

  await writeAudit(db, auditInput(c, access, "CREATE", "unit", created?.id));
  return c.json({ data: created }, 201);
}

export async function updateUnit(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.manage");
  const body = await parseJsonBody(c, unitUpdateSchema);
  const id = readId(c);
  const [updated] = await db
    .update(units)
    .set({
      code: body.code?.toUpperCase(),
      name: body.name,
      symbol: body.symbol,
      precision: body.precision,
      quantityStep: body.quantityStep,
      active: body.active,
      version: sql`${units.version} + 1`
    })
    .where(and(eq(units.organizationId, access.organizationId), eq(units.id, id), eq(units.version, body.version)))
    .returning();

  if (!updated) throw new AppError("version_conflict", "Unit was changed by another request", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "unit", id));
  return c.json({ data: updated });
}

export async function listProducts(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.view");
  const url = new URL(c.req.url);
  const search = url.searchParams.get("search");
  const rows = await db
    .select()
    .from(products)
    .where(search ? and(eq(products.organizationId, access.organizationId), ilike(products.name, `%${search}%`)) : eq(products.organizationId, access.organizationId))
    .orderBy(asc(products.name))
    .limit(100);

  return c.json({ data: rows });
}

export async function createProduct(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.manage");
  const body = await parseJsonBody(c, productCreateSchema);

  if (body.categoryId) await ensureExists(db, catalogCategories, access.organizationId, body.categoryId, "category_not_found");

  const [created] = await db.insert(products).values({ ...body, organizationId: access.organizationId }).returning();
  await writeAudit(db, auditInput(c, access, "CREATE", "product", created?.id));
  return c.json({ data: created }, 201);
}

export async function updateProduct(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.manage");
  const body = await parseJsonBody(c, productUpdateSchema);
  const id = readId(c);

  if (body.categoryId) await ensureExists(db, catalogCategories, access.organizationId, body.categoryId, "category_not_found");

  const [updated] = await db
    .update(products)
    .set({
      name: body.name,
      description: body.description,
      categoryId: body.categoryId,
      type: body.type,
      trackInventory: body.trackInventory,
      taxable: body.taxable,
      active: body.active,
      version: sql`${products.version} + 1`
    })
    .where(and(eq(products.organizationId, access.organizationId), eq(products.id, id), eq(products.version, body.version)))
    .returning();

  if (!updated) throw new AppError("version_conflict", "Product was changed by another request", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "product", id));
  return c.json({ data: updated });
}

export async function listVariants(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.view");
  const url = new URL(c.req.url);
  const productId = url.searchParams.get("productId");
  const rows = await db
    .select()
    .from(productVariants)
    .where(productId ? and(eq(productVariants.organizationId, access.organizationId), eq(productVariants.productId, productId)) : eq(productVariants.organizationId, access.organizationId))
    .orderBy(asc(productVariants.name))
    .limit(100);

  return c.json({ data: rows });
}

export async function createVariant(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.manage");
  const body = await parseJsonBody(c, variantCreateSchema);
  await ensureExists(db, products, access.organizationId, body.productId, "product_not_found");
  await ensureExists(db, units, access.organizationId, body.unitId, "unit_not_found");
  const [created] = await db.insert(productVariants).values({ ...body, organizationId: access.organizationId }).returning();

  await writeAudit(db, auditInput(c, access, "CREATE", "product_variant", created?.id));
  return c.json({ data: created }, 201);
}

export async function updateVariant(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.manage");
  const body = await parseJsonBody(c, variantUpdateSchema);
  const id = readId(c);

  if (body.productId) await ensureExists(db, products, access.organizationId, body.productId, "product_not_found");
  if (body.unitId) await ensureExists(db, units, access.organizationId, body.unitId, "unit_not_found");

  const [updated] = await db
    .update(productVariants)
    .set({
      productId: body.productId,
      unitId: body.unitId,
      sku: body.sku,
      barcode: body.barcode,
      name: body.name,
      active: body.active,
      version: sql`${productVariants.version} + 1`
    })
    .where(and(eq(productVariants.organizationId, access.organizationId), eq(productVariants.id, id), eq(productVariants.version, body.version)))
    .returning();

  if (!updated) throw new AppError("version_conflict", "Variant was changed by another request", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "product_variant", id));
  return c.json({ data: updated });
}

export async function listTaxRates(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.view");
  const rows = await db.select().from(taxRates).where(eq(taxRates.organizationId, access.organizationId)).orderBy(asc(taxRates.name));
  return c.json({ data: rows });
}

export async function createTaxRate(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "taxes.manage");
  const body = await parseJsonBody(c, taxRateCreateSchema);
  const [created] = await db.insert(taxRates).values({ ...body, organizationId: access.organizationId }).returning();

  await writeAudit(db, auditInput(c, access, "CREATE", "tax_rate", created?.id));
  return c.json({ data: created }, 201);
}

export async function updateTaxRate(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "taxes.manage");
  const body = await parseJsonBody(c, taxRateUpdateSchema);
  const id = readId(c);
  const [updated] = await db
    .update(taxRates)
    .set({
      name: body.name,
      rate: body.rate,
      includedInPrice: body.includedInPrice,
      default: body.default,
      active: body.active,
      version: sql`${taxRates.version} + 1`
    })
    .where(and(eq(taxRates.organizationId, access.organizationId), eq(taxRates.id, id), eq(taxRates.version, body.version)))
    .returning();

  if (!updated) throw new AppError("version_conflict", "Tax rate was changed by another request", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "tax_rate", id));
  return c.json({ data: updated });
}

export async function listPriceLists(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.view");
  const rows = await db.select().from(priceLists).where(eq(priceLists.organizationId, access.organizationId)).orderBy(asc(priceLists.name));
  return c.json({ data: rows });
}

export async function createPriceList(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "pricing.manage");
  const body = await parseJsonBody(c, priceListCreateSchema);
  const [organization] = await db.select({ baseCurrency: organizations.baseCurrency }).from(organizations).where(eq(organizations.id, access.organizationId)).limit(1);
  if (!organization) throw new AppError("organization_not_found", "Organization was not found", 404);
  const currency = (body.currency ?? organization.baseCurrency).toUpperCase();
  if (currency !== organization.baseCurrency) throw new AppError("currency_mismatch", "Price list currency must match the organization base currency", 400);
  const [created] = await db.insert(priceLists).values({ ...body, currency, organizationId: access.organizationId }).returning();

  await writeAudit(db, auditInput(c, access, "CREATE", "price_list", created?.id));
  return c.json({ data: created }, 201);
}

export async function updatePriceList(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "pricing.manage");
  const body = await parseJsonBody(c, priceListUpdateSchema);
  const id = readId(c);
  if (body.currency) {
    const [organization] = await db.select({ baseCurrency: organizations.baseCurrency }).from(organizations).where(eq(organizations.id, access.organizationId)).limit(1);
    if (!organization || body.currency.toUpperCase() !== organization.baseCurrency) throw new AppError("currency_mismatch", "Price list currency must match the organization base currency", 400);
  }
  const [updated] = await db
    .update(priceLists)
    .set({
      name: body.name,
      currency: body.currency?.toUpperCase(),
      default: body.default,
      active: body.active,
      version: sql`${priceLists.version} + 1`
    })
    .where(and(eq(priceLists.organizationId, access.organizationId), eq(priceLists.id, id), eq(priceLists.version, body.version)))
    .returning();

  if (!updated) throw new AppError("version_conflict", "Price list was changed by another request", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "price_list", id));
  return c.json({ data: updated });
}

export async function listPriceListItems(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "catalog.view");
  const url = new URL(c.req.url);
  const priceListId = url.searchParams.get("priceListId");
  const rows = await db
    .select()
    .from(priceListItems)
    .where(priceListId ? and(eq(priceListItems.organizationId, access.organizationId), eq(priceListItems.priceListId, priceListId)) : eq(priceListItems.organizationId, access.organizationId))
    .limit(100);

  return c.json({ data: rows });
}

export async function createPriceListItem(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "pricing.manage");
  const body = await parseJsonBody(c, priceListItemCreateSchema);
  await ensureExists(db, priceLists, access.organizationId, body.priceListId, "price_list_not_found");
  await ensureExists(db, productVariants, access.organizationId, body.variantId, "variant_not_found");
  if (body.taxRateId) await ensureExists(db, taxRates, access.organizationId, body.taxRateId, "tax_rate_not_found");
  const [created] = await db.insert(priceListItems).values({ ...body, organizationId: access.organizationId }).returning();

  await writeAudit(db, auditInput(c, access, "CREATE", "price_list_item", created?.id));
  return c.json({ data: created }, 201);
}

export async function updatePriceListItem(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "pricing.manage");
  const body = await parseJsonBody(c, priceListItemUpdateSchema);
  const id = readId(c);

  if (body.priceListId) await ensureExists(db, priceLists, access.organizationId, body.priceListId, "price_list_not_found");
  if (body.variantId) await ensureExists(db, productVariants, access.organizationId, body.variantId, "variant_not_found");
  if (body.taxRateId) await ensureExists(db, taxRates, access.organizationId, body.taxRateId, "tax_rate_not_found");

  const [updated] = await db
    .update(priceListItems)
    .set({
      priceListId: body.priceListId,
      variantId: body.variantId,
      taxRateId: body.taxRateId,
      price: body.price,
      serviceChargeEligible: body.serviceChargeEligible,
      active: body.active,
      version: sql`${priceListItems.version} + 1`
    })
    .where(and(eq(priceListItems.organizationId, access.organizationId), eq(priceListItems.id, id), eq(priceListItems.version, body.version)))
    .returning();

  if (!updated) throw new AppError("version_conflict", "Price list item was changed by another request", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "price_list_item", id));
  return c.json({ data: updated });
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

async function ensureExists(
  db: ReturnType<typeof requireDb>,
  table: typeof catalogCategories | typeof units | typeof products | typeof productVariants | typeof taxRates | typeof priceLists,
  organizationId: string,
  id: string,
  code: string
) {
  const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.organizationId, organizationId), eq(table.id, id))).limit(1);
  if (!row) throw new AppError(code, "Referenced catalog resource does not exist in this organization", 404);
}

function requireDb(deps: AppDependencies) {
  if (!deps.db) throw new AppError("database_unavailable", "Database connection is not configured", 503);
  return deps.db;
}
