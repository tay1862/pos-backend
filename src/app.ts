import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { Hono, type Context } from "hono";
import { sql } from "drizzle-orm";
import type { AppBindings, AppDependencies } from "./http/context";
import type { Database } from "./db";
import { errorHandler } from "./http/middleware/error-handler";
import { loggerMiddleware } from "./http/middleware/logger";
import { requestIdMiddleware } from "./http/middleware/request-id";
import { csrfMiddleware } from "./http/middleware/csrf";
import { authMiddleware } from "./http/middleware/auth";
import { openApiDocument } from "./http/openapi";
import { AppError } from "./infra/errors";
import { setRlsContext } from "./db/rls";
import { allowedOrigins } from "./config";
import {
  createCategory,
  createPriceList,
  createPriceListItem,
  createProduct,
  createTaxRate,
  createUnit,
  createVariant,
  listCategories,
  listPriceListItems,
  listPriceLists,
  listProducts,
  listTaxRates,
  listUnits,
  listVariants,
  updateCategory,
  updatePriceList,
  updatePriceListItem,
  updateProduct,
  updateTaxRate,
  updateUnit,
  updateVariant
} from "./modules/catalog/service";
import {
  addOrderItem,
  cancelTicket,
  closeTicket,
  createBill,
  createPayment,
  createRefund,
  createTicket,
  getTicket,
  issueBill,
  listTickets,
  updateTicket,
  voidBill
} from "./modules/sales/service";
import {
  acknowledgePrintJob,
  claimPrintJob,
  createKitchenStation,
  dispatchKitchen,
  listKitchenJobs,
  listKitchenStations,
  listPrintJobs,
  reprintJob,
  transitionKitchenJobItem,
  updateKitchenStation
} from "./modules/restaurant/service";
import {
  createAdjustment,
  createPurchaseOrder,
  createRecipe,
  createStockCount,
  createTransfer,
  createWarehouse,
  getStockOnHand,
  listRecipes,
  listWarehouses,
  orderPurchase,
  postStockCount,
  postTransfer,
  receivePurchase,
  updateWarehouse
} from "./modules/inventory/service";
import {
  assignCustomerPriceList,
  createCustomer,
  createInvoice,
  createQuotation,
  createReceivablePayment,
  issueInvoice,
  listCustomers,
  listInvoices,
  listQuotations,
  listReceivables,
  transitionQuotation,
  updateCustomer,
  voidInvoice
} from "./modules/wholesale/service";
import { buildSyncSnapshot, getLatestSyncSnapshot, listSyncCommands, listSyncEvents, processSyncCommands, streamSyncEvents, submitSyncCommands } from "./modules/sync/service";
import { createDevice, listDevicePresence, listDevices, revokeDevice, updateDevice, updateDeviceSyncCursor } from "./modules/sync/device-service";
import {
  handleLogin,
  handleLogout,
  handleAcceptInvitation,
  handleRevokeSession,
  handleSession,
  handleSessions
} from "./modules/auth/service";
import {
  handleAuditLogs,
  handleBootstrapAdmin,
  handleCreateEmployee,
  handleCreateLocation,
  handleCreateOrganization,
  handleCreateRole,
  handleGetOrganization,
  handleListEmployees,
  handleListLocations,
  handleListPermissions,
  handleListRoles,
  handleMe,
  handleMyOrganizations,
  handlePatchOrganization
} from "./modules/platform/service";

export function createApp(deps: AppDependencies) {
  const app = new Hono<AppBindings>();
  const api = new Hono<AppBindings>();
  const requireAuth = authMiddleware(deps);

  app.use("*", requestIdMiddleware);
  app.use("*", loggerMiddleware(deps));
  app.use(
    "*",
    cors({
      origin: allowedOrigins(deps.config),
      credentials: true,
      allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Organization-Id", "X-Request-Id"],
      exposeHeaders: ["X-Request-Id"],
      maxAge: 600
    })
  );
  app.use("*", csrfMiddleware(deps));
  app.onError(errorHandler);

  app.get("/", (c) =>
    c.json({
      data: {
        service: "pos-backend",
        status: "ok",
        apiBase: "/api/v1",
        docs: "/api/docs",
        health: "/api/v1/health",
        ready: "/api/v1/ready"
      }
    })
  );
  app.get("/api/openapi.json", (c) => c.json(openApiDocument()));
  app.get("/api/docs", swaggerUI({ url: "/api/openapi.json" }));

  api.get("/health", (c) =>
    c.json({
      data: {
        status: "ok",
        service: "pos-backend"
      }
    })
  );

  api.get("/ready", async (c) => {
    if (!deps.db) {
      return c.json({ data: { status: "not_ready", database: "not_configured" } }, 503);
    }

    const [role] = await deps.db.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`);
    if (role?.rolsuper || role?.rolbypassrls) {
      return c.json({ data: { status: "not_ready", database: "runtime_role_bypasses_rls" } }, 503);
    }
    return c.json({ data: { status: "ready", database: "ok" } });
  });

  api.post("/platform/bootstrap-admin", (c) => handleBootstrapAdmin(c, deps));
  api.post("/auth/login", (c) => handleLogin(c, deps));
  api.post("/auth/accept-invitation", (c) => handleAcceptInvitation(c, deps));
  api.post("/auth/logout", requireAuth, (c) => handleLogout(c, deps));
  api.get("/auth/session", requireAuth, (c) => handleSession(c, deps));
  api.get("/auth/sessions", requireAuth, (c) => handleSessions(c, deps));
  api.delete("/auth/sessions/:id", requireAuth, (c) => handleRevokeSession(c, deps));
  api.get("/me", requireAuth, (c) => handleMe(c, deps));
  api.get("/organizations", requireAuth, (c) => handleMyOrganizations(c, deps));
  api.post("/platform/organizations", requireAuth, (c) => handleCreateOrganization(c, deps));
  api.get("/organization", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => handleGetOrganization(c, scopedDeps)));
  api.patch("/organization", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => handlePatchOrganization(c, scopedDeps)));
  api.get("/locations", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => handleListLocations(c, scopedDeps)));
  api.post("/locations", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => handleCreateLocation(c, scopedDeps)));
  api.get("/employees", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => handleListEmployees(c, scopedDeps)));
  api.post("/employees", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => handleCreateEmployee(c, scopedDeps)));
  api.get("/permissions", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => handleListPermissions(c, scopedDeps)));
  api.get("/roles", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => handleListRoles(c, scopedDeps)));
  api.post("/roles", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => handleCreateRole(c, scopedDeps)));
  api.get("/audit-logs", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => handleAuditLogs(c, scopedDeps)));
  api.get("/catalog/categories", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listCategories(c, scopedDeps)));
  api.post("/catalog/categories", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createCategory(c, scopedDeps)));
  api.patch("/catalog/categories/:id", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => updateCategory(c, scopedDeps)));
  api.get("/catalog/units", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listUnits(c, scopedDeps)));
  api.post("/catalog/units", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createUnit(c, scopedDeps)));
  api.patch("/catalog/units/:id", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => updateUnit(c, scopedDeps)));
  api.get("/catalog/products", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listProducts(c, scopedDeps)));
  api.post("/catalog/products", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createProduct(c, scopedDeps)));
  api.patch("/catalog/products/:id", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => updateProduct(c, scopedDeps)));
  api.get("/catalog/variants", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listVariants(c, scopedDeps)));
  api.post("/catalog/variants", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createVariant(c, scopedDeps)));
  api.patch("/catalog/variants/:id", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => updateVariant(c, scopedDeps)));
  api.get("/catalog/tax-rates", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listTaxRates(c, scopedDeps)));
  api.post("/catalog/tax-rates", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createTaxRate(c, scopedDeps)));
  api.patch("/catalog/tax-rates/:id", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => updateTaxRate(c, scopedDeps)));
  api.get("/catalog/price-lists", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listPriceLists(c, scopedDeps)));
  api.post("/catalog/price-lists", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createPriceList(c, scopedDeps)));
  api.patch("/catalog/price-lists/:id", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => updatePriceList(c, scopedDeps)));
  api.get("/catalog/price-list-items", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listPriceListItems(c, scopedDeps)));
  api.post("/catalog/price-list-items", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createPriceListItem(c, scopedDeps)));
  api.patch("/catalog/price-list-items/:id", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => updatePriceListItem(c, scopedDeps)));
  api.get("/tickets", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listTickets(c, scopedDeps)));
  api.post("/tickets", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createTicket(c, scopedDeps)));
  api.get("/tickets/:id", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => getTicket(c, scopedDeps)));
  api.patch("/tickets/:id", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => updateTicket(c, scopedDeps)));
  api.post("/tickets/:id/close", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => closeTicket(c, scopedDeps)));
  api.post("/tickets/:id/cancel", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => cancelTicket(c, scopedDeps)));
  api.post("/orders/:id/items", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => addOrderItem(c, scopedDeps)));
  api.post("/orders/:id/bills", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createBill(c, scopedDeps)));
  api.post("/bills/:id/issue", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => issueBill(c, scopedDeps)));
  api.post("/bills/:id/void", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => voidBill(c, scopedDeps)));
  api.post("/bills/:id/payments", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createPayment(c, scopedDeps)));
  api.post("/refunds", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createRefund(c, scopedDeps)));
  api.get("/kitchen-stations", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listKitchenStations(c, scopedDeps)));
  api.post("/kitchen-stations", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createKitchenStation(c, scopedDeps)));
  api.patch("/kitchen-stations/:id", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => updateKitchenStation(c, scopedDeps)));
  api.post("/orders/:id/kitchen-dispatches", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => dispatchKitchen(c, scopedDeps)));
  api.get("/kitchen-jobs", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listKitchenJobs(c, scopedDeps)));
  api.post("/kitchen-job-items/:id/transitions", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => transitionKitchenJobItem(c, scopedDeps)));
  api.get("/print-jobs", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listPrintJobs(c, scopedDeps)));
  api.post("/print-jobs/:id/claim", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => claimPrintJob(c, scopedDeps)));
  api.post("/print-jobs/:id/ack", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => acknowledgePrintJob(c, scopedDeps)));
  api.post("/print-jobs/:id/reprint", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => reprintJob(c, scopedDeps)));
  api.get("/warehouses", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listWarehouses(c, scopedDeps)));
  api.post("/warehouses", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createWarehouse(c, scopedDeps)));
  api.patch("/warehouses/:id", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => updateWarehouse(c, scopedDeps)));
  api.get("/inventory/on-hand", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => getStockOnHand(c, scopedDeps)));
  api.post("/inventory/adjustments", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createAdjustment(c, scopedDeps)));
  api.post("/inventory/counts", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createStockCount(c, scopedDeps)));
  api.post("/inventory/counts/:id/post", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => postStockCount(c, scopedDeps)));
  api.post("/inventory/transfers", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createTransfer(c, scopedDeps)));
  api.post("/inventory/transfers/:id/post", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => postTransfer(c, scopedDeps)));
  api.post("/purchase-orders", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createPurchaseOrder(c, scopedDeps)));
  api.post("/purchase-orders/:id/order", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => orderPurchase(c, scopedDeps)));
  api.post("/purchase-orders/:id/receipts", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => receivePurchase(c, scopedDeps)));
  api.get("/recipes", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listRecipes(c, scopedDeps)));
  api.post("/recipes", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createRecipe(c, scopedDeps)));
  api.get("/customers", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listCustomers(c, scopedDeps)));
  api.post("/customers", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createCustomer(c, scopedDeps)));
  api.patch("/customers/:id", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => updateCustomer(c, scopedDeps)));
  api.post("/customers/:id/price-lists", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => assignCustomerPriceList(c, scopedDeps)));
  api.get("/quotations", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listQuotations(c, scopedDeps)));
  api.post("/quotations", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createQuotation(c, scopedDeps)));
  api.post("/quotations/:id/send", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => transitionQuotation(c, scopedDeps, "send")));
  api.post("/quotations/:id/accept", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => transitionQuotation(c, scopedDeps, "accept")));
  api.post("/quotations/:id/cancel", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => transitionQuotation(c, scopedDeps, "cancel")));
  api.get("/invoices", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listInvoices(c, scopedDeps)));
  api.post("/invoices", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createInvoice(c, scopedDeps)));
  api.post("/invoices/:id/issue", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => issueInvoice(c, scopedDeps)));
  api.post("/invoices/:id/void", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => voidInvoice(c, scopedDeps)));
  api.post("/invoices/:id/payments", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createReceivablePayment(c, scopedDeps)));
  api.get("/receivables", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listReceivables(c, scopedDeps)));
  api.get("/sync/events", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listSyncEvents(c, scopedDeps)));
  api.get("/sync/events/stream", requireAuth, (c) => streamSyncEvents(c, deps));
  api.get("/sync/snapshot", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => getLatestSyncSnapshot(c, scopedDeps)));
  api.post("/sync/snapshots/build", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => buildSyncSnapshot(c, scopedDeps)));
  api.post("/sync/commands/process", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => processSyncCommands(c, scopedDeps)));
  api.get("/sync/presence", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listDevicePresence(c, scopedDeps)));
  api.get("/devices", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listDevices(c, scopedDeps)));
  api.post("/devices", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => createDevice(c, scopedDeps)));
  api.patch("/devices/:id", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => updateDevice(c, scopedDeps)));
  api.post("/devices/:id/revoke", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => revokeDevice(c, scopedDeps)));
  api.post("/devices/:id/sync-cursor", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => updateDeviceSyncCursor(c, scopedDeps)));
  api.get("/devices/:id/sync-commands", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => listSyncCommands(c, scopedDeps)));
  api.post("/devices/:id/sync-commands", requireAuth, (c) => withTenantRequest(c, deps, (scopedDeps) => submitSyncCommands(c, scopedDeps)));

  app.route("/api/v1", api);

  return app;
}

async function withTenantRequest(
  c: Context<AppBindings>,
  deps: AppDependencies,
  handler: (scopedDeps: AppDependencies) => Promise<Response> | Response
) {
  if (!deps.db) throw new AppError("database_unavailable", "Database connection is not configured", 503);
  const organizationId = c.req.header("X-Organization-Id");

  return deps.db.transaction(async (tx) => {
    c.set("rlsLocal", true);
    if (organizationId) {
      c.set("organizationId", organizationId);
      await setRlsContext(tx, { organizationId, platformAdmin: false, local: true });
    }

    return handler({ ...deps, db: tx as unknown as Database });
  });
}
