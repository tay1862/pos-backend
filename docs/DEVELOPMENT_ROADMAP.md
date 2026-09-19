# Development Roadmap

## Phase 0: Audit and Design

Done in this repository through docs and repo audit. Ticket is the core model; table workflow is excluded.

## Phase 1: Foundation

Current implementation:

- Bun/TypeScript/Hono app factory
- env validation
- structured JSON logs
- request id
- error envelope
- health/readiness
- Drizzle schema and migrations
- auth sessions
- platform bootstrap
- organization provisioning and owner invitation links
- organization settings
- locations
- employees
- roles and permissions
- audit logs
- OpenAPI document and Swagger UI
- Docker and Compose scaffolding

## Phase 2: Catalog

Implemented now:

- Categories
- Units with decimal quantity step
- Products with retail/service/prepared/raw-material types
- Product variants with SKU/barcode
- Tax rates
- Price lists and price list items
- Version-checked updates
- Tenant-scoped catalog permissions and audit logs

Unit conversions beyond one sellable unit per variant are reserved for the inventory phase.

## Phase 3: Ticket Sales

Implemented now:

- Ticket opening with location/business-date numbering
- One main Order per Ticket
- Order Items priced from catalog price lists
- Bill creation from allocated order-item quantities
- Bill issue and unpaid void
- Manual payments
- Refunds capped by original payment amount
- Ticket close/cancel rules
- Idempotency for bill creation, payments, and refunds

Remaining Phase 3 hardening: devices/PIN, registers/shifts, receipt rendering, merge/transfer item flows, and basic stock ledger hooks for retail handover.

## Phase 4: Restaurant

Implemented now:

- Kitchen stations
- Kitchen dispatch from Order item quantities
- Duplicate dispatch prevention by quantity
- KDS polling endpoint
- Kitchen item transitions
- Print job queue
- Claim/ack workflow for local printer bridge
- Reprint with required reason and copy marker

Remaining Phase 4 hardening: modifiers, station routing rules by product/modifier, receipt rendering, and richer cancellation reason flows. No table system.

## Phase 5: Inventory

Implemented now:

- Warehouses per organization/location
- Stock movement ledger as source of truth
- Manual adjustments with reason
- On-hand query from ledger sums
- Draft stock counts with expected snapshots
- Stock count posting with positive or negative correction movements
- Draft transfers and paired transfer-out/transfer-in movements
- Purchase orders, order transition, receipts, and receipt movements
- Recipes/BOM for output variant and input variant quantities
- Tenant-scoped inventory permissions, RLS, composite foreign keys, and audit logs

Remaining Phase 5 hardening: idempotency keys on inventory writes, caps against over-receiving purchase quantities, sale handover hooks from Ticket flows, recipe consumption/production movements, inventory unit conversion rules, and richer void/correction workflows.

## Phase 6: Wholesale

Implemented now:

- Wholesale customer profiles with payment terms and credit limit metadata
- Customer price-list assignment
- Quotation creation with item price snapshots
- Quotation send, accept, and cancel transitions
- Invoice creation with item snapshots and optional quotation link
- Invoice issue and unpaid void
- Receivable payments capped by outstanding balance
- Receivable balance endpoint
- Tenant-scoped wholesale permissions, RLS, composite foreign keys, and audit logs

Remaining Phase 6 hardening: automatic customer price resolution during order entry, conversion from accepted quotation into Ticket/Order/Invoice in one transaction, credit-limit enforcement, due/overdue job processing, invoice PDF/print rendering, and idempotency keys on wholesale writes.

## Phase 7: Offline and Realtime

Implemented now:

- PostgreSQL-backed `sync_events` table
- Organization-scoped event cursor
- Automatic event creation from successful audited business writes
- `GET /sync/events` polling endpoint
- Device registration, update, and revoke APIs
- Per-device sync cursor checkpoint API
- Offline command queue intake with idempotent `clientCommandId`
- Basic sync command processor for `ticket.create`, `ticket.update`, `ticket.cancel`, and `order_item.add`
- `baseSequence` conflict detection for Ticket mutation commands
- Device presence endpoint derived from last sync activity
- Sync snapshot build/read endpoints for client bootstrap
- Server-Sent Events stream for sync event fanout
- Tenant-scoped `sync.read`, `sync.write`, `devices.view`, and `devices.manage` permissions and RLS

Remaining Phase 7 hardening: more command handlers, richer conflict resolution policy per aggregate, idempotency for all command side effects, background worker runtime, WebSocket fanout if needed beyond SSE, and snapshot retention/compaction policy.

## Phase 8: Extensions

Loyalty, kiosk, customer display, payment integrations, SaaS billing.
