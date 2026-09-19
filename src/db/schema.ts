import {
  bigserial,
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const membershipStatus = pgEnum("membership_status", ["ACTIVE", "SUSPENDED"]);
export const invitationStatus = pgEnum("invitation_status", ["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"]);
export const auditAction = pgEnum("audit_action", ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "REVOKE"]);
export const productType = pgEnum("product_type", ["RETAIL", "SERVICE", "PREPARED", "RAW_MATERIAL"]);
export const paymentTiming = pgEnum("payment_timing", ["PREPAY", "POSTPAY"]);
export const ticketStatus = pgEnum("ticket_status", ["OPEN", "CLOSED", "CANCELLED", "MERGED"]);
export const orderStatus = pgEnum("order_status", ["DRAFT", "OPEN", "COMPLETED", "CANCELLED"]);
export const saleContext = pgEnum("sale_context", ["DINE_IN", "TAKEAWAY", "RETAIL", "WHOLESALE"]);
export const billStatus = pgEnum("bill_status", ["DRAFT", "ISSUED", "VOIDED"]);
export const paymentMethod = pgEnum("payment_method", ["CASH", "QR", "TRANSFER", "CARD", "OTHER"]);
export const refundStatus = pgEnum("refund_status", ["COMPLETED"]);
export const kitchenJobItemStatus = pgEnum("kitchen_job_item_status", ["QUEUED", "PREPARING", "READY", "SERVED", "CANCELLED"]);
export const printJobStatus = pgEnum("print_job_status", ["QUEUED", "CLAIMED", "ACKED", "FAILED"]);
export const printJobType = pgEnum("print_job_type", ["KITCHEN", "RECEIPT"]);
export const stockMovementType = pgEnum("stock_movement_type", ["ADJUSTMENT", "COUNT", "TRANSFER_OUT", "TRANSFER_IN", "PURCHASE_RECEIPT", "SALE_HANDOVER", "RECIPE_CONSUME", "WASTE", "RETURN"]);
export const stockCountStatus = pgEnum("stock_count_status", ["DRAFT", "POSTED", "VOIDED"]);
export const stockTransferStatus = pgEnum("stock_transfer_status", ["DRAFT", "POSTED", "VOIDED"]);
export const purchaseOrderStatus = pgEnum("purchase_order_status", ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]);
export const recipeStatus = pgEnum("recipe_status", ["ACTIVE", "INACTIVE"]);
export const quotationStatus = pgEnum("quotation_status", ["DRAFT", "SENT", "ACCEPTED", "EXPIRED", "CANCELLED"]);
export const wholesaleInvoiceStatus = pgEnum("wholesale_invoice_status", ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "VOIDED", "OVERDUE"]);
export const deviceStatus = pgEnum("device_status", ["ACTIVE", "REVOKED"]);
export const syncCommandStatus = pgEnum("sync_command_status", ["RECEIVED", "PROCESSING", "APPLIED", "REJECTED"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    platformAdmin: boolean("platform_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    emailUnique: uniqueIndex("users_email_unique").on(sql`lower(${table.email})`)
  })
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tokenUnique: uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    userIdx: index("sessions_user_id_idx").on(table.userId)
  })
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("LAK"),
    timezone: text("timezone").notNull().default("Asia/Vientiane"),
    businessDayStart: text("business_day_start").notNull().default("00:00"),
    taxEnabled: boolean("tax_enabled").notNull().default(false),
    serviceChargeEnabled: boolean("service_charge_enabled").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    slugUnique: uniqueIndex("organizations_slug_unique").on(table.slug)
  })
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: membershipStatus("status").notNull().default("ACTIVE"),
    isOwner: boolean("is_owner").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgUserUnique: uniqueIndex("organization_memberships_org_user_unique").on(table.organizationId, table.userId),
    orgIdx: index("organization_memberships_org_idx").on(table.organizationId),
    userIdx: index("organization_memberships_user_idx").on(table.userId)
  })
);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    timezone: text("timezone").notNull().default("Asia/Vientiane"),
    defaultPaymentTiming: varchar("default_payment_timing", { length: 16 }).notNull().default("POSTPAY"),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgCodeUnique: uniqueIndex("locations_org_code_unique").on(table.organizationId, table.code),
    orgIdUnique: uniqueIndex("locations_org_id_unique").on(table.organizationId, table.id),
    orgIdx: index("locations_org_idx").on(table.organizationId)
  })
);

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgIdx: index("employees_org_idx").on(table.organizationId),
    orgIdUnique: uniqueIndex("employees_org_id_unique").on(table.organizationId, table.id),
    orgUserUnique: uniqueIndex("employees_org_user_unique").on(table.organizationId, table.userId)
  })
);

export const employeeLocations = pgTable(
  "employee_locations",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.employeeId, table.locationId] }),
    employeeOrgFk: foreignKey({ columns: [table.organizationId, table.employeeId], foreignColumns: [employees.organizationId, employees.id], name: "employee_locations_org_employee_fk" }),
    locationOrgFk: foreignKey({ columns: [table.organizationId, table.locationId], foreignColumns: [locations.organizationId, locations.id], name: "employee_locations_org_location_fk" })
  })
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    system: boolean("system").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgIdUnique: uniqueIndex("roles_org_id_unique").on(table.organizationId, table.id),
    orgNameUnique: uniqueIndex("roles_org_name_unique").on(table.organizationId, table.name)
  })
);

export const permissions = pgTable("permissions", {
  code: text("code").primaryKey(),
  description: text("description").notNull()
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionCode: text("permission_code")
      .notNull()
      .references(() => permissions.code, { onDelete: "cascade" })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.permissionCode] }),
    roleOrgFk: foreignKey({ columns: [table.organizationId, table.roleId], foreignColumns: [roles.organizationId, roles.id], name: "role_permissions_org_role_fk" })
  })
);

export const employeeRoles = pgTable(
  "employee_roles",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.employeeId, table.roleId] }),
    employeeOrgFk: foreignKey({ columns: [table.organizationId, table.employeeId], foreignColumns: [employees.organizationId, employees.id], name: "employee_roles_org_employee_fk" }),
    roleOrgFk: foreignKey({ columns: [table.organizationId, table.roleId], foreignColumns: [roles.organizationId, roles.id], name: "employee_roles_org_role_fk" })
  })
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: invitationStatus("status").notNull().default("PENDING"),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tokenUnique: uniqueIndex("invitations_token_hash_unique").on(table.tokenHash),
    orgEmailIdx: index("invitations_org_email_idx").on(table.organizationId, table.email)
  })
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: auditAction("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    requestId: text("request_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgCreatedIdx: index("audit_logs_org_created_idx").on(table.organizationId, table.createdAt)
  })
);

export const syncEvents = pgTable(
  "sync_events",
  {
    sequence: bigserial("sequence", { mode: "number" }).primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    action: auditAction("action").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgSequenceIdx: index("sync_events_org_sequence_idx").on(table.organizationId, table.sequence),
    orgEntityIdx: index("sync_events_org_entity_idx").on(table.organizationId, table.entityType, table.entityId)
  })
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    code: varchar("code", { length: 64 }).notNull(),
    name: text("name").notNull(),
    status: deviceStatus("status").notNull().default("ACTIVE"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgCodeUnique: uniqueIndex("devices_org_code_unique").on(table.organizationId, table.code),
    orgLocationIdx: index("devices_org_location_idx").on(table.organizationId, table.locationId),
    orgIdUnique: uniqueIndex("devices_org_id_unique").on(table.organizationId, table.id)
  })
);

export const syncClientStates = pgTable(
  "sync_client_states",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    lastSequence: bigint("last_sequence", { mode: "number" }).notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.deviceId] })
  })
);

export const syncCommands = pgTable(
  "sync_commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    clientCommandId: uuid("client_command_id").notNull(),
    commandType: text("command_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id"),
    baseSequence: bigint("base_sequence", { mode: "number" }).notNull().default(0),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: syncCommandStatus("status").notNull().default("RECEIVED"),
    resultEntityType: text("result_entity_type"),
    resultEntityId: uuid("result_entity_id"),
    resultSequence: bigint("result_sequence", { mode: "number" }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    receivedByUserId: uuid("received_by_user_id").references(() => users.id, { onDelete: "set null" }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true })
  },
  (table) => ({
    deviceCommandUnique: uniqueIndex("sync_commands_device_command_unique").on(table.organizationId, table.deviceId, table.clientCommandId),
    orgStatusIdx: index("sync_commands_org_status_idx").on(table.organizationId, table.status),
    orgDeviceIdx: index("sync_commands_org_device_idx").on(table.organizationId, table.deviceId),
    orgIdUnique: uniqueIndex("sync_commands_org_id_unique").on(table.organizationId, table.id)
  })
);

export const syncSnapshots = pgTable(
  "sync_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgSequenceIdx: index("sync_snapshots_org_sequence_idx").on(table.organizationId, table.sequence),
    orgIdUnique: uniqueIndex("sync_snapshots_org_id_unique").on(table.organizationId, table.id)
  })
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    scope: text("scope").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    idemUnique: uniqueIndex("idempotency_keys_unique").on(table.organizationId, table.userId, table.scope, table.key)
  })
);

export const catalogCategories = pgTable(
  "catalog_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgNameUnique: uniqueIndex("catalog_categories_org_name_unique").on(table.organizationId, table.name),
    orgIdx: index("catalog_categories_org_idx").on(table.organizationId),
    orgIdUnique: uniqueIndex("catalog_categories_org_id_unique").on(table.organizationId, table.id)
  })
);

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: text("name").notNull(),
    symbol: varchar("symbol", { length: 16 }).notNull(),
    precision: integer("precision").notNull().default(0),
    quantityStep: numeric("quantity_step", { precision: 20, scale: 6 }).notNull().default("1"),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgCodeUnique: uniqueIndex("units_org_code_unique").on(table.organizationId, table.code),
    orgIdUnique: uniqueIndex("units_org_id_unique").on(table.organizationId, table.id)
  })
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => catalogCategories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    type: productType("type").notNull().default("RETAIL"),
    trackInventory: boolean("track_inventory").notNull().default(false),
    taxable: boolean("taxable").notNull().default(false),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgNameIdx: index("products_org_name_idx").on(table.organizationId, table.name),
    orgIdUnique: uniqueIndex("products_org_id_unique").on(table.organizationId, table.id)
  })
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    sku: varchar("sku", { length: 80 }),
    barcode: varchar("barcode", { length: 80 }),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgSkuUnique: uniqueIndex("product_variants_org_sku_unique").on(table.organizationId, table.sku),
    orgBarcodeUnique: uniqueIndex("product_variants_org_barcode_unique").on(table.organizationId, table.barcode),
    orgProductIdx: index("product_variants_org_product_idx").on(table.organizationId, table.productId),
    orgIdUnique: uniqueIndex("product_variants_org_id_unique").on(table.organizationId, table.id)
  })
);

export const taxRates = pgTable(
  "tax_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    rate: numeric("rate", { precision: 9, scale: 6 }).notNull(),
    includedInPrice: boolean("included_in_price").notNull().default(false),
    default: boolean("default").notNull().default(false),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgNameUnique: uniqueIndex("tax_rates_org_name_unique").on(table.organizationId, table.name),
    orgIdUnique: uniqueIndex("tax_rates_org_id_unique").on(table.organizationId, table.id)
  })
);

export const priceLists = pgTable(
  "price_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("LAK"),
    default: boolean("default").notNull().default(false),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgNameUnique: uniqueIndex("price_lists_org_name_unique").on(table.organizationId, table.name),
    orgIdUnique: uniqueIndex("price_lists_org_id_unique").on(table.organizationId, table.id)
  })
);

export const priceListItems = pgTable(
  "price_list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    priceListId: uuid("price_list_id")
      .notNull()
      .references(() => priceLists.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    taxRateId: uuid("tax_rate_id").references(() => taxRates.id, { onDelete: "set null" }),
    price: numeric("price", { precision: 20, scale: 6 }).notNull(),
    serviceChargeEligible: boolean("service_charge_eligible").notNull().default(true),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    listVariantUnique: uniqueIndex("price_list_items_list_variant_unique").on(table.organizationId, table.priceListId, table.variantId),
    orgVariantIdx: index("price_list_items_org_variant_idx").on(table.organizationId, table.variantId)
  })
);

export const ticketCounters = pgTable(
  "ticket_counters",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    businessDate: date("business_date").notNull(),
    nextSequence: integer("next_sequence").notNull().default(1)
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.locationId, table.businessDate] })
  })
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    number: text("number").notNull(),
    label: text("label"),
    customerName: text("customer_name"),
    assignedEmployeeId: uuid("assigned_employee_id").references(() => employees.id, { onDelete: "set null" }),
    status: ticketStatus("status").notNull().default("OPEN"),
    paymentTiming: paymentTiming("payment_timing").notNull().default("POSTPAY"),
    businessDate: date("business_date").notNull(),
    mergedIntoTicketId: uuid("merged_into_ticket_id"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgNumberUnique: uniqueIndex("tickets_org_location_number_unique").on(table.organizationId, table.locationId, table.number),
    orgStatusIdx: index("tickets_org_status_idx").on(table.organizationId, table.status),
    orgIdUnique: uniqueIndex("tickets_org_id_unique").on(table.organizationId, table.id)
  })
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    context: saleContext("context").notNull().default("DINE_IN"),
    status: orderStatus("status").notNull().default("OPEN"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgTicketUnique: uniqueIndex("orders_org_ticket_unique").on(table.organizationId, table.ticketId),
    orgIdUnique: uniqueIndex("orders_org_id_unique").on(table.organizationId, table.id)
  })
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 20, scale: 6 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    productNameSnapshot: text("product_name_snapshot").notNull(),
    variantNameSnapshot: text("variant_name_snapshot").notNull(),
    taxRateId: uuid("tax_rate_id").references(() => taxRates.id, { onDelete: "set null" }),
    taxRateSnapshot: numeric("tax_rate_snapshot", { precision: 9, scale: 6 }).notNull().default("0"),
    taxIncludedInPriceSnapshot: boolean("tax_included_in_price_snapshot").notNull().default(false),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgOrderIdx: index("order_items_org_order_idx").on(table.organizationId, table.orderId),
    orgIdUnique: uniqueIndex("order_items_org_id_unique").on(table.organizationId, table.id)
  })
);

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    status: billStatus("status").notNull().default("DRAFT"),
    currency: varchar("currency", { length: 3 }).notNull(),
    subtotal: numeric("subtotal", { precision: 20, scale: 6 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 20, scale: 6 }).notNull().default("0"),
    total: numeric("total", { precision: 20, scale: 6 }).notNull().default("0"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgTicketIdx: index("bills_org_ticket_idx").on(table.organizationId, table.ticketId),
    orgNumberUnique: uniqueIndex("bills_org_ticket_number_unique").on(table.organizationId, table.ticketId, table.number),
    orgIdUnique: uniqueIndex("bills_org_id_unique").on(table.organizationId, table.id)
  })
);

export const billItems = pgTable(
  "bill_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 20, scale: 6 }).notNull(),
    subtotal: numeric("subtotal", { precision: 20, scale: 6 }).notNull(),
    taxTotal: numeric("tax_total", { precision: 20, scale: 6 }).notNull(),
    total: numeric("total", { precision: 20, scale: 6 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgBillIdx: index("bill_items_org_bill_idx").on(table.organizationId, table.billId)
  })
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "restrict" }),
    method: paymentMethod("method").notNull(),
    amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    reference: text("reference"),
    confirmedByUserId: uuid("confirmed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgBillIdx: index("payments_org_bill_idx").on(table.organizationId, table.billId)
  })
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    reason: text("reason").notNull(),
    status: refundStatus("status").notNull().default("COMPLETED"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgPaymentIdx: index("refunds_org_payment_idx").on(table.organizationId, table.paymentId)
  })
);

export const kitchenStations = pgTable(
  "kitchen_stations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgCodeUnique: uniqueIndex("kitchen_stations_org_location_code_unique").on(table.organizationId, table.locationId, table.code),
    orgIdUnique: uniqueIndex("kitchen_stations_org_id_unique").on(table.organizationId, table.id)
  })
);

export const kitchenJobs = pgTable(
  "kitchen_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    stationId: uuid("station_id")
      .notNull()
      .references(() => kitchenStations.id, { onDelete: "restrict" }),
    dispatchNumber: text("dispatch_number").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgStationIdx: index("kitchen_jobs_org_station_idx").on(table.organizationId, table.stationId),
    orgIdUnique: uniqueIndex("kitchen_jobs_org_id_unique").on(table.organizationId, table.id)
  })
);

export const kitchenJobItems = pgTable(
  "kitchen_job_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kitchenJobId: uuid("kitchen_job_id")
      .notNull()
      .references(() => kitchenJobs.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    status: kitchenJobItemStatus("status").notNull().default("QUEUED"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgJobIdx: index("kitchen_job_items_org_job_idx").on(table.organizationId, table.kitchenJobId),
    orgIdUnique: uniqueIndex("kitchen_job_items_org_id_unique").on(table.organizationId, table.id)
  })
);

export const printJobs = pgTable(
  "print_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    type: printJobType("type").notNull(),
    status: printJobStatus("status").notNull().default("QUEUED"),
    kitchenJobId: uuid("kitchen_job_id").references(() => kitchenJobs.id, { onDelete: "set null" }),
    billId: uuid("bill_id").references(() => bills.id, { onDelete: "set null" }),
    payload: jsonb("payload").notNull(),
    copy: boolean("copy").notNull().default(false),
    reason: text("reason"),
    claimedBy: text("claimed_by"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    failureMessage: text("failure_message"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgStatusIdx: index("print_jobs_org_status_idx").on(table.organizationId, table.status),
    orgIdUnique: uniqueIndex("print_jobs_org_id_unique").on(table.organizationId, table.id)
  })
);

export const warehouses = pgTable(
  "warehouses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgLocationCodeUnique: uniqueIndex("warehouses_org_location_code_unique").on(table.organizationId, table.locationId, table.code),
    orgIdUnique: uniqueIndex("warehouses_org_id_unique").on(table.organizationId, table.id)
  })
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    type: stockMovementType("type").notNull(),
    quantityDelta: numeric("quantity_delta", { precision: 20, scale: 6 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 20, scale: 6 }),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    reason: text("reason"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgWarehouseVariantIdx: index("stock_movements_org_warehouse_variant_idx").on(table.organizationId, table.warehouseId, table.variantId),
    orgReferenceIdx: index("stock_movements_org_reference_idx").on(table.organizationId, table.referenceType, table.referenceId)
  })
);

export const stockCounts = pgTable(
  "stock_counts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    status: stockCountStatus("status").notNull().default("DRAFT"),
    countedAt: timestamp("counted_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgWarehouseIdx: index("stock_counts_org_warehouse_idx").on(table.organizationId, table.warehouseId),
    orgIdUnique: uniqueIndex("stock_counts_org_id_unique").on(table.organizationId, table.id)
  })
);

export const stockCountItems = pgTable(
  "stock_count_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stockCountId: uuid("stock_count_id")
      .notNull()
      .references(() => stockCounts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    countedQuantity: numeric("counted_quantity", { precision: 20, scale: 6 }).notNull(),
    expectedQuantitySnapshot: numeric("expected_quantity_snapshot", { precision: 20, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    countVariantUnique: uniqueIndex("stock_count_items_count_variant_unique").on(table.organizationId, table.stockCountId, table.variantId),
    orgIdUnique: uniqueIndex("stock_count_items_org_id_unique").on(table.organizationId, table.id)
  })
);

export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fromWarehouseId: uuid("from_warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    toWarehouseId: uuid("to_warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    status: stockTransferStatus("status").notNull().default("DRAFT"),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgStatusIdx: index("stock_transfers_org_status_idx").on(table.organizationId, table.status),
    orgIdUnique: uniqueIndex("stock_transfers_org_id_unique").on(table.organizationId, table.id)
  })
);

export const stockTransferItems = pgTable(
  "stock_transfer_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stockTransferId: uuid("stock_transfer_id")
      .notNull()
      .references(() => stockTransfers.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    transferVariantUnique: uniqueIndex("stock_transfer_items_transfer_variant_unique").on(table.organizationId, table.stockTransferId, table.variantId),
    orgIdUnique: uniqueIndex("stock_transfer_items_org_id_unique").on(table.organizationId, table.id)
  })
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    supplierName: text("supplier_name").notNull(),
    status: purchaseOrderStatus("status").notNull().default("DRAFT"),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgStatusIdx: index("purchase_orders_org_status_idx").on(table.organizationId, table.status),
    orgIdUnique: uniqueIndex("purchase_orders_org_id_unique").on(table.organizationId, table.id)
  })
);

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 20, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    purchaseVariantUnique: uniqueIndex("purchase_order_items_purchase_variant_unique").on(table.organizationId, table.purchaseOrderId, table.variantId),
    orgIdUnique: uniqueIndex("purchase_order_items_org_id_unique").on(table.organizationId, table.id)
  })
);

export const purchaseReceipts = pgTable(
  "purchase_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "restrict" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgPurchaseIdx: index("purchase_receipts_org_purchase_idx").on(table.organizationId, table.purchaseOrderId),
    orgIdUnique: uniqueIndex("purchase_receipts_org_id_unique").on(table.organizationId, table.id)
  })
);

export const purchaseReceiptItems = pgTable(
  "purchase_receipt_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    purchaseReceiptId: uuid("purchase_receipt_id")
      .notNull()
      .references(() => purchaseReceipts.id, { onDelete: "cascade" }),
    purchaseOrderItemId: uuid("purchase_order_item_id")
      .notNull()
      .references(() => purchaseOrderItems.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 20, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    receiptVariantIdx: index("purchase_receipt_items_org_receipt_idx").on(table.organizationId, table.purchaseReceiptId),
    orgIdUnique: uniqueIndex("purchase_receipt_items_org_id_unique").on(table.organizationId, table.id)
  })
);

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    outputVariantId: uuid("output_variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    outputQuantity: numeric("output_quantity", { precision: 20, scale: 6 }).notNull().default("1"),
    status: recipeStatus("status").notNull().default("ACTIVE"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgOutputUnique: uniqueIndex("recipes_org_output_unique").on(table.organizationId, table.outputVariantId),
    orgIdUnique: uniqueIndex("recipes_org_id_unique").on(table.organizationId, table.id)
  })
);

export const recipeItems = pgTable(
  "recipe_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    inputVariantId: uuid("input_variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    recipeInputUnique: uniqueIndex("recipe_items_recipe_input_unique").on(table.organizationId, table.recipeId, table.inputVariantId),
    orgIdUnique: uniqueIndex("recipe_items_org_id_unique").on(table.organizationId, table.id)
  })
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 40 }).notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    taxId: text("tax_id"),
    billingAddress: text("billing_address"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(0),
    creditLimit: numeric("credit_limit", { precision: 20, scale: 6 }).notNull().default("0"),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgCodeUnique: uniqueIndex("customers_org_code_unique").on(table.organizationId, table.code),
    orgNameIdx: index("customers_org_name_idx").on(table.organizationId, table.name),
    orgIdUnique: uniqueIndex("customers_org_id_unique").on(table.organizationId, table.id)
  })
);

export const customerPriceLists = pgTable(
  "customer_price_lists",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    priceListId: uuid("price_list_id")
      .notNull()
      .references(() => priceLists.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.customerId, table.priceListId] }),
    customerIdx: index("customer_price_lists_customer_idx").on(table.organizationId, table.customerId)
  })
);

export const quotations = pgTable(
  "quotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    quoteNumber: varchar("quote_number", { length: 40 }).notNull(),
    status: quotationStatus("status").notNull().default("DRAFT"),
    currency: varchar("currency", { length: 3 }).notNull().default("LAK"),
    expiresOn: date("expires_on"),
    subtotal: numeric("subtotal", { precision: 20, scale: 6 }).notNull().default("0"),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgNumberUnique: uniqueIndex("quotations_org_number_unique").on(table.organizationId, table.quoteNumber),
    orgCustomerIdx: index("quotations_org_customer_idx").on(table.organizationId, table.customerId),
    orgIdUnique: uniqueIndex("quotations_org_id_unique").on(table.organizationId, table.id)
  })
);

export const quotationItems = pgTable(
  "quotation_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 20, scale: 6 }).notNull(),
    lineTotal: numeric("line_total", { precision: 20, scale: 6 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    quotationIdx: index("quotation_items_org_quotation_idx").on(table.organizationId, table.quotationId),
    orgIdUnique: uniqueIndex("quotation_items_org_id_unique").on(table.organizationId, table.id)
  })
);

export const wholesaleInvoices = pgTable(
  "wholesale_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    quotationId: uuid("quotation_id").references(() => quotations.id, { onDelete: "set null" }),
    invoiceNumber: varchar("invoice_number", { length: 40 }).notNull(),
    status: wholesaleInvoiceStatus("status").notNull().default("DRAFT"),
    currency: varchar("currency", { length: 3 }).notNull().default("LAK"),
    issuedOn: date("issued_on"),
    dueOn: date("due_on"),
    subtotal: numeric("subtotal", { precision: 20, scale: 6 }).notNull().default("0"),
    total: numeric("total", { precision: 20, scale: 6 }).notNull().default("0"),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgNumberUnique: uniqueIndex("wholesale_invoices_org_number_unique").on(table.organizationId, table.invoiceNumber),
    orgCustomerIdx: index("wholesale_invoices_org_customer_idx").on(table.organizationId, table.customerId),
    orgStatusIdx: index("wholesale_invoices_org_status_idx").on(table.organizationId, table.status),
    orgIdUnique: uniqueIndex("wholesale_invoices_org_id_unique").on(table.organizationId, table.id)
  })
);

export const wholesaleInvoiceItems = pgTable(
  "wholesale_invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => wholesaleInvoices.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 20, scale: 6 }).notNull(),
    lineTotal: numeric("line_total", { precision: 20, scale: 6 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    invoiceIdx: index("wholesale_invoice_items_org_invoice_idx").on(table.organizationId, table.invoiceId),
    orgIdUnique: uniqueIndex("wholesale_invoice_items_org_id_unique").on(table.organizationId, table.id)
  })
);

export const receivablePayments = pgTable(
  "receivable_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => wholesaleInvoices.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
    method: paymentMethod("method").notNull(),
    reference: text("reference"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    receivedByUserId: uuid("received_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    invoiceIdx: index("receivable_payments_org_invoice_idx").on(table.organizationId, table.invoiceId),
    orgIdUnique: uniqueIndex("receivable_payments_org_id_unique").on(table.organizationId, table.id)
  })
);
