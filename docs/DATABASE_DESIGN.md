# Database Design

The foundation schema is in `src/db/schema.ts`; migrations live in `drizzle/`.

Current tables:

- `users`
- `sessions`
- `organizations`
- `organization_memberships`
- `locations`
- `employees`
- `employee_locations`
- `roles`
- `permissions`
- `role_permissions`
- `employee_roles`
- `invitations`
- `audit_logs`
- `idempotency_keys`
- `catalog_categories`
- `units`
- `products`
- `product_variants`
- `tax_rates`
- `price_lists`
- `price_list_items`
- `ticket_counters`
- `tickets`
- `orders`
- `order_items`
- `bills`
- `bill_items`
- `payments`
- `refunds`
- `kitchen_stations`
- `kitchen_jobs`
- `kitchen_job_items`
- `print_jobs`
- `warehouses`
- `stock_movements`
- `stock_counts`
- `stock_count_items`
- `stock_transfers`
- `stock_transfer_items`
- `purchase_orders`
- `purchase_order_items`
- `purchase_receipts`
- `purchase_receipt_items`
- `recipes`
- `recipe_items`
- `customers`
- `customer_price_lists`
- `quotations`
- `quotation_items`
- `wholesale_invoices`
- `wholesale_invoice_items`
- `receivable_payments`
- `sync_events`
- `devices`
- `sync_client_states`
- `sync_commands`
- `sync_snapshots`

## Tenant Isolation

Business tables carry `organization_id`. Location-scoped data also carries `location_id` in later modules.

Order items persist both the tax rate and whether the source price included tax. Bills calculate from those snapshots, honoring the organization's tax switch, so later catalog or tax-setting changes do not rewrite historical totals.

The migrations enable PostgreSQL RLS for tenant business tables and define policies using transaction settings:

- `app.current_organization_id`
- `app.platform_admin`

The application still performs explicit authorization before reading or mutating data. RLS is a second layer for production roles that do not own the tables. Local Compose creates `pos_migrator` for migrations and `pos_app` for runtime connections; the runtime role must never be the table owner or a `BYPASSRLS` role.

## Versioning

Mutable records that can be edited by clients include `version`. Updates check the supplied version and return conflict when it no longer matches.

## Audit

Audit writes are part of the same transaction when a use case changes business data. A rolled-back use case must not leave a successful audit record.

## Idempotency

`idempotency_keys` stores request scope, key, request hash, response status/body, and expiry. Financial Ticket writes use this cache now. Inventory writes have durable ledger references and are marked for idempotency hardening before pilot load.

## Catalog

Phase 2 catalog records are organization-scoped and versioned. Product variants carry SKU/barcode and unit references. Price list items store decimal prices as `numeric(20,6)` and point to optional tax rates.

Composite foreign keys on catalog references prevent linking products, variants, prices, and tax rates across organizations.

## Ticket Sales Core

Phase 3 core uses `ticket_counters` to issue display numbers such as `T-YYYYMMDD-0001` per organization, location, and business date. `tickets` own one main `orders` row. `order_items` keep product, variant, price, currency, and tax snapshots.

`bills` and `bill_items` allocate quantities from order items. `payments` and `refunds` are append-only records. Bill creation, payment creation, and refund creation use `idempotency_keys` to make retries safe.

## Restaurant And Print Core

Kitchen dispatch creates `kitchen_jobs` and `kitchen_job_items` for quantities that have not already been dispatched. Each dispatch also queues a `print_jobs` row with a payload for an external local printer bridge.

Print jobs are claimed and acknowledged by a worker. Reprints create a new copy row with a reason and never change financial totals or kitchen quantities.

## Inventory Core

Phase 5 inventory uses `stock_movements` as the source of truth for on-hand quantity. Opening Tickets, splitting Bills, and printing do not create stock movements.

`warehouses` belong to an organization and location. Adjustments append ledger rows with a required reason. Stock counts start as drafts with expected quantity snapshots; posting a count appends positive or negative `COUNT` movements. Transfers start as drafts; posting a transfer appends paired `TRANSFER_OUT` and `TRANSFER_IN` movements without changing sales totals.

Purchasing starts with `purchase_orders` and `purchase_order_items`. Receiving creates `purchase_receipts`, `purchase_receipt_items`, and `PURCHASE_RECEIPT` stock movements. Recipes model one output variant and one or more input variants for later production/ingredient consumption flows.

Composite foreign keys prevent linking warehouses, variants, counts, transfers, purchase documents, receipts, and recipes across organizations. RLS policies are enabled on inventory tables.

## Wholesale Core

Phase 6 adds organization-scoped `customers`, `customer_price_lists`, `quotations`, `quotation_items`, `wholesale_invoices`, `wholesale_invoice_items`, and `receivable_payments`.

Customers hold payment terms and credit limit metadata. Customer price-list assignments let the pricing layer choose customer-specific prices in later hardening work. Quotations and invoices store item snapshots with quantities, unit prices, and line totals so later catalog price changes do not mutate issued business documents. Receivable payments are append-only and capped against the invoice outstanding balance.

Composite foreign keys and RLS policies prevent cross-organization customer, price-list, quotation, invoice, and receivable links.

## Sync Events

Phase 7 foundation adds `sync_events`, `devices`, `sync_client_states`, `sync_commands`, and `sync_snapshots`. `writeAudit()` inserts sync events inside the same transaction for organization-scoped business writes, so rolled-back writes do not leak events. Clients read events with a monotonically increasing `sequence` cursor through `GET /sync/events`.

Devices can be registered, updated, and revoked. Cursor checkpoints are stored per organization/device, and revoked devices cannot advance a cursor. `sync_commands` stores submitted offline commands with unique `(organization_id, device_id, client_command_id)` so client retries do not duplicate queued commands. This is a polling and command-intake foundation for offline/realtime clients. Full conflict resolution, command execution workers, and WebSocket fanout remain future hardening work.

`sync_snapshots` stores a compact JSON read model at a known event sequence. The first snapshot payload includes Tickets and Devices so clients can bootstrap without replaying every historical event.

## Money and Quantity

Money, prices, and quantities use `numeric(20,6)`. APIs expose decimal strings and avoid JavaScript floating point arithmetic for business totals.
