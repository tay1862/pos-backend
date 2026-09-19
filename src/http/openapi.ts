export function openApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Ticket-first POS Backend API",
      version: "0.1.0",
      description: "Phase 1 foundation API. Ticket sales, billing, kitchen, and print contracts are documented as future Phase 3-4 design."
    },
    servers: [{ url: "/api/v1" }],
    security: [{ cookieSession: [] }, { bearerSession: [] }],
    components: {
      securitySchemes: {
        cookieSession: { type: "apiKey", in: "cookie", name: "pos_session" },
        bearerSession: { type: "http", scheme: "bearer" }
      },
      parameters: {
        OrganizationHeader: {
          name: "X-Organization-Id",
          in: "header",
          required: true,
          schema: { type: "string", format: "uuid" },
          description: "Organization selected for this request; membership is checked server-side."
        },
        IdempotencyKey: {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", minLength: 8, maxLength: 200 },
          description: "Required for financial, kitchen dispatch, and other durable writes. Reuse with the same payload to replay safely."
        }
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error", "requestId"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: {}
              }
            },
            requestId: { type: "string" }
          }
        }
      },
      "x-tenant-isolation": "All tenant routes require X-Organization-Id and evaluate membership, permission, and location assignment inside a transaction-scoped RLS context.",
      "x-concurrency": "Mutable records use version checks; financial, inventory, and kitchen aggregate writes use idempotency keys and transaction locks."
    },
    paths: {
      "/health": {
        get: {
          security: [],
          responses: {
            "200": { description: "Process is running" }
          }
        }
      },
      "/ready": {
        get: {
          security: [],
          responses: {
            "200": { description: "Database is reachable" },
            "503": { description: "Database is not reachable" }
          }
        }
      },
      "/platform/bootstrap-admin": {
        post: {
          security: [],
          summary: "Create the first platform admin when no users exist",
          responses: {
            "201": { description: "Platform admin created" },
            "409": { description: "Bootstrap is locked" }
          }
        }
      },
      "/auth/login": { post: { security: [], summary: "Create a revocable session", responses: { "200": { description: "Logged in" } } } },
      "/auth/accept-invitation": {
        post: {
          security: [],
          summary: "Accept a one-time owner or staff invitation",
          responses: {
            "200": { description: "Invitation accepted" },
            "409": { description: "Invitation already used or revoked" },
            "410": { description: "Invitation expired" }
          }
        }
      },
      "/auth/logout": { post: { summary: "Revoke current session", responses: { "200": { description: "Logged out" } } } },
      "/auth/session": { get: { summary: "Read current session", responses: { "200": { description: "Current session" } } } },
      "/auth/sessions": { get: { summary: "List active sessions", responses: { "200": { description: "Active sessions" } } } },
      "/auth/sessions/{id}": { delete: { summary: "Revoke another session", responses: { "200": { description: "Revoked" } } } },
      "/me": { get: { summary: "Current user profile", responses: { "200": { description: "Profile" } } } },
      "/organizations": { get: { summary: "Current user's organizations", responses: { "200": { description: "Organizations" } } } },
      "/platform/organizations": { post: { summary: "Platform admin creates an organization and owner invitation", responses: { "201": { description: "Organization created" } } } },
      "/organization": {
        get: { summary: "Read selected organization", responses: { "200": { description: "Organization" } } },
        patch: { summary: "Update selected organization with version check", responses: { "200": { description: "Organization updated" }, "409": { description: "Version conflict" } } }
      },
      "/locations": {
        get: { summary: "List locations for selected organization", responses: { "200": { description: "Locations" } } },
        post: { summary: "Create a location", responses: { "201": { description: "Location created" } } }
      },
      "/employees": {
        get: { summary: "List employees for selected organization", responses: { "200": { description: "Employees" } } },
        post: { summary: "Create employee", responses: { "201": { description: "Employee created" } } }
      },
      "/permissions": { get: { summary: "List permission codes", responses: { "200": { description: "Permissions" } } } },
      "/roles": {
        get: { summary: "List roles", responses: { "200": { description: "Roles" } } },
        post: { summary: "Create role", responses: { "201": { description: "Role created" } } }
      },
      "/audit-logs": { get: { summary: "List audit logs", responses: { "200": { description: "Audit logs" } } } },
      "/catalog/categories": {
        get: { summary: "List catalog categories", responses: { "200": { description: "Categories" } } },
        post: { summary: "Create catalog category", responses: { "201": { description: "Category created" } } }
      },
      "/catalog/categories/{id}": { patch: { summary: "Update catalog category with version check", responses: { "200": { description: "Category updated" }, "409": { description: "Version conflict" } } } },
      "/catalog/units": {
        get: { summary: "List sellable or inventory units", responses: { "200": { description: "Units" } } },
        post: { summary: "Create unit", responses: { "201": { description: "Unit created" } } }
      },
      "/catalog/units/{id}": { patch: { summary: "Update unit with version check", responses: { "200": { description: "Unit updated" }, "409": { description: "Version conflict" } } } },
      "/catalog/products": {
        get: { summary: "List products", responses: { "200": { description: "Products" } } },
        post: { summary: "Create product", responses: { "201": { description: "Product created" } } }
      },
      "/catalog/products/{id}": { patch: { summary: "Update product with version check", responses: { "200": { description: "Product updated" }, "409": { description: "Version conflict" } } } },
      "/catalog/variants": {
        get: { summary: "List product variants", responses: { "200": { description: "Variants" } } },
        post: { summary: "Create product variant", responses: { "201": { description: "Variant created" } } }
      },
      "/catalog/variants/{id}": { patch: { summary: "Update variant with version check", responses: { "200": { description: "Variant updated" }, "409": { description: "Version conflict" } } } },
      "/catalog/tax-rates": {
        get: { summary: "List tax rates", responses: { "200": { description: "Tax rates" } } },
        post: { summary: "Create tax rate", responses: { "201": { description: "Tax rate created" } } }
      },
      "/catalog/tax-rates/{id}": { patch: { summary: "Update tax rate with version check", responses: { "200": { description: "Tax rate updated" }, "409": { description: "Version conflict" } } } },
      "/catalog/price-lists": {
        get: { summary: "List price lists", responses: { "200": { description: "Price lists" } } },
        post: { summary: "Create price list", responses: { "201": { description: "Price list created" } } }
      },
      "/catalog/price-lists/{id}": { patch: { summary: "Update price list with version check", responses: { "200": { description: "Price list updated" }, "409": { description: "Version conflict" } } } },
      "/catalog/price-list-items": {
        get: { summary: "List prices", responses: { "200": { description: "Price list items" } } },
        post: { summary: "Create price", responses: { "201": { description: "Price created" } } }
      },
      "/catalog/price-list-items/{id}": { patch: { summary: "Update price with version check", responses: { "200": { description: "Price updated" }, "409": { description: "Version conflict" } } } },
      "/tickets": {
        get: { summary: "List tickets", responses: { "200": { description: "Tickets" } } },
        post: { summary: "Create ticket and main order", responses: { "201": { description: "Ticket created" } } }
      },
      "/tickets/{id}": {
        get: { summary: "Get ticket detail", responses: { "200": { description: "Ticket detail" } } },
        patch: { summary: "Update open ticket with version check", responses: { "200": { description: "Ticket updated" }, "409": { description: "Version conflict" } } }
      },
      "/tickets/{id}/close": { post: { summary: "Close fully paid ticket", responses: { "200": { description: "Ticket closed" }, "409": { description: "Ticket still has due" } } } },
      "/tickets/{id}/cancel": { post: { summary: "Cancel unpaid open ticket", responses: { "200": { description: "Ticket cancelled" }, "409": { description: "Ticket cannot be cancelled" } } } },
      "/orders/{id}/items": { post: { summary: "Add priced order item", responses: { "201": { description: "Order item created" } } } },
      "/orders/{id}/bills": { post: { summary: "Create bill from order item quantities", responses: { "201": { description: "Bill created" }, "409": { description: "Quantity overallocated" } } } },
      "/bills/{id}/issue": { post: { summary: "Issue draft bill", responses: { "200": { description: "Bill issued" } } } },
      "/bills/{id}/void": { post: { summary: "Void unpaid bill", responses: { "200": { description: "Bill voided" }, "409": { description: "Bill has payments" } } } },
      "/bills/{id}/payments": { post: { summary: "Record manually confirmed payment", responses: { "201": { description: "Payment created" }, "409": { description: "Payment exceeds due" } } } },
      "/refunds": { post: { summary: "Create payment refund", responses: { "201": { description: "Refund created" }, "409": { description: "Refund exceeds payment" } } } }
      ,
      "/kitchen-stations": {
        get: { summary: "List kitchen stations", responses: { "200": { description: "Kitchen stations" } } },
        post: { summary: "Create kitchen station", responses: { "201": { description: "Kitchen station created" } } }
      },
      "/kitchen-stations/{id}": { patch: { summary: "Update kitchen station", responses: { "200": { description: "Kitchen station updated" } } } },
      "/orders/{id}/kitchen-dispatches": { post: { summary: "Dispatch remaining order items to kitchen and queue print job", responses: { "201": { description: "Kitchen dispatch created" } } } },
      "/kitchen-jobs": { get: { summary: "List kitchen jobs and items for KDS polling", responses: { "200": { description: "Kitchen jobs" } } } },
      "/kitchen-job-items/{id}/transitions": { post: { summary: "Move kitchen item status", responses: { "200": { description: "Kitchen item updated" }, "409": { description: "Version conflict" } } } },
      "/print-jobs": { get: { summary: "List print jobs", responses: { "200": { description: "Print jobs" } } } },
      "/print-jobs/{id}/claim": { post: { summary: "Claim queued print job", responses: { "200": { description: "Print job claimed" } } } },
      "/print-jobs/{id}/ack": { post: { summary: "Acknowledge print job success or failure", responses: { "200": { description: "Print job acknowledged" } } } },
      "/print-jobs/{id}/reprint": { post: { summary: "Create marked copy print job with reason", responses: { "201": { description: "Reprint queued" } } } },
      "/warehouses": {
        get: { summary: "List warehouses", responses: { "200": { description: "Warehouses" } } },
        post: { summary: "Create warehouse", responses: { "201": { description: "Warehouse created" } } }
      },
      "/warehouses/{id}": { patch: { summary: "Update warehouse", responses: { "200": { description: "Warehouse updated" }, "409": { description: "Version conflict" } } } },
      "/inventory/on-hand": { get: { summary: "Read stock on hand from movement ledger", responses: { "200": { description: "Stock balances" } } } },
      "/inventory/adjustments": { post: { summary: "Create stock adjustment movement", responses: { "201": { description: "Stock movement created" } } } },
      "/inventory/counts": { post: { summary: "Create stock count draft", responses: { "201": { description: "Stock count created" } } } },
      "/inventory/counts/{id}/post": { post: { summary: "Post stock count and create ledger deltas", responses: { "200": { description: "Stock count posted" } } } },
      "/inventory/transfers": { post: { summary: "Create stock transfer draft", responses: { "201": { description: "Transfer created" } } } },
      "/inventory/transfers/{id}/post": { post: { summary: "Post stock transfer and create out/in movements", responses: { "200": { description: "Transfer posted" } } } },
      "/purchase-orders": { post: { summary: "Create purchase order", responses: { "201": { description: "Purchase order created" } } } },
      "/purchase-orders/{id}/order": { post: { summary: "Mark purchase order as ordered", responses: { "200": { description: "Purchase order ordered" } } } },
      "/purchase-orders/{id}/receipts": { post: { summary: "Receive purchase order items and add stock", responses: { "201": { description: "Purchase receipt created" } } } },
      "/recipes": {
        get: { summary: "List recipes", responses: { "200": { description: "Recipes" } } },
        post: { summary: "Create recipe/BOM", responses: { "201": { description: "Recipe created" } } }
      },
      "/customers": {
        get: { summary: "List wholesale customers", responses: { "200": { description: "Customers" } } },
        post: { summary: "Create wholesale customer", responses: { "201": { description: "Customer created" } } }
      },
      "/customers/{id}": { patch: { summary: "Update wholesale customer", responses: { "200": { description: "Customer updated" }, "409": { description: "Version conflict" } } } },
      "/customers/{id}/price-lists": { post: { summary: "Assign customer-specific price list", responses: { "200": { description: "Assignment saved" } } } },
      "/quotations": {
        get: { summary: "List quotations", responses: { "200": { description: "Quotations" } } },
        post: { summary: "Create quotation", responses: { "201": { description: "Quotation created" } } }
      },
      "/quotations/{id}/send": { post: { summary: "Send draft quotation", responses: { "200": { description: "Quotation sent" }, "409": { description: "Version conflict" } } } },
      "/quotations/{id}/accept": { post: { summary: "Accept sent quotation", responses: { "200": { description: "Quotation accepted" }, "409": { description: "Version conflict" } } } },
      "/quotations/{id}/cancel": { post: { summary: "Cancel quotation", responses: { "200": { description: "Quotation cancelled" } } } },
      "/invoices": {
        get: { summary: "List wholesale invoices", responses: { "200": { description: "Invoices" } } },
        post: { summary: "Create wholesale invoice", responses: { "201": { description: "Invoice created" } } }
      },
      "/invoices/{id}/issue": { post: { summary: "Issue draft invoice", responses: { "200": { description: "Invoice issued" }, "409": { description: "Version conflict" } } } },
      "/invoices/{id}/void": { post: { summary: "Void unpaid invoice", responses: { "200": { description: "Invoice voided" }, "409": { description: "Invoice has payments" } } } },
      "/invoices/{id}/payments": { post: { summary: "Record receivable payment", responses: { "201": { description: "Receivable payment created" }, "409": { description: "Payment exceeds balance" } } } },
      "/receivables": { get: { summary: "List invoice receivable balances", responses: { "200": { description: "Receivable balances" } } } },
      "/sync/events": { get: { summary: "Poll tenant sync events after a cursor", responses: { "200": { description: "Sync events with next cursor" } } } },
      "/sync/events/stream": { get: { summary: "Stream tenant sync events with Server-Sent Events", responses: { "200": { description: "SSE stream" } } } },
      "/sync/snapshot": { get: { summary: "Get latest tenant sync snapshot", responses: { "200": { description: "Latest sync snapshot or null" } } } },
      "/sync/snapshots/build": { post: { summary: "Build a tenant sync snapshot at the latest event sequence", responses: { "201": { description: "Snapshot built" } } } },
      "/sync/commands/process": { post: { summary: "Process received sync commands for supported command types", responses: { "200": { description: "Processing results" } } } },
      "/sync/presence": { get: { summary: "List device presence based on last sync activity", responses: { "200": { description: "Device presence" } } } },
      "/devices": {
        get: { summary: "List registered devices", responses: { "200": { description: "Devices" } } },
        post: { summary: "Register device identity", responses: { "201": { description: "Device registered" } } }
      },
      "/devices/{id}": { patch: { summary: "Update active device", responses: { "200": { description: "Device updated" }, "409": { description: "Version conflict" } } } },
      "/devices/{id}/revoke": { post: { summary: "Revoke active device", responses: { "200": { description: "Device revoked" }, "409": { description: "Version conflict" } } } },
      "/devices/{id}/sync-cursor": { post: { summary: "Checkpoint a device sync cursor", responses: { "200": { description: "Cursor stored" }, "404": { description: "Device not active" } } } },
      "/devices/{id}/sync-commands": {
        get: { summary: "List queued sync commands for a device", responses: { "200": { description: "Sync commands" } } },
        post: { summary: "Submit offline command batch for later conflict processing", responses: { "202": { description: "Commands received" }, "404": { description: "Device not active" } } }
      }
    },
    "x-future-ticket-contract": {
      phase: "3-4",
      endpoints: [
        "POST /tickets/{id}/merge",
        "POST /tickets/{id}/item-transfers",
        "GET /bills/{id}/receipt"
      ],
      note: "No table management API, schema, permission, or workflow is part of this system."
    }
  };
}
