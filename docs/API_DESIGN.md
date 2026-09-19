# API Design

Base path: `/api/v1`

OpenAPI: `/api/openapi.json`

Docs UI: `/api/docs`

Error envelope:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Request validation failed",
    "details": []
  },
  "requestId": "..."
}
```

## Phase 1 Endpoints

- `GET /health`
- `GET /ready`
- `POST /platform/bootstrap-admin`
- `POST /auth/login`
- `POST /auth/accept-invitation`
- `POST /auth/logout`
- `GET /auth/session`
- `GET /auth/sessions`
- `DELETE /auth/sessions/{id}`
- `GET /me`
- `GET /organizations`
- `POST /platform/organizations`
- `GET /organization`
- `PATCH /organization`
- `GET /locations`
- `POST /locations`
- `GET /employees`
- `POST /employees`
- `GET /permissions`
- `GET /roles`
- `POST /roles`
- `GET /audit-logs`

## Phase 2 Catalog Endpoints

- `GET/POST /catalog/categories`
- `PATCH /catalog/categories/{id}`
- `GET/POST /catalog/units`
- `PATCH /catalog/units/{id}`
- `GET/POST /catalog/products`
- `PATCH /catalog/products/{id}`
- `GET/POST /catalog/variants`
- `PATCH /catalog/variants/{id}`
- `GET/POST /catalog/tax-rates`
- `PATCH /catalog/tax-rates/{id}`
- `GET/POST /catalog/price-lists`
- `PATCH /catalog/price-lists/{id}`
- `GET/POST /catalog/price-list-items`
- `PATCH /catalog/price-list-items/{id}`

## Phase 3 Ticket Sales Core Endpoints

- `GET/POST /tickets`
- `GET/PATCH /tickets/{id}`
- `POST /tickets/{id}/close`
- `POST /tickets/{id}/cancel`
- `POST /orders/{id}/items`
- `POST /orders/{id}/bills`
- `POST /bills/{id}/issue`
- `POST /bills/{id}/void`
- `POST /bills/{id}/payments`
- `POST /refunds`

`POST /orders/{id}/bills`, `POST /bills/{id}/payments`, and `POST /refunds` require `Idempotency-Key`.

## Phase 4 Restaurant Core Endpoints

- `GET/POST /kitchen-stations`
- `PATCH /kitchen-stations/{id}`
- `POST /orders/{id}/kitchen-dispatches`
- `GET /kitchen-jobs`
- `POST /kitchen-job-items/{id}/transitions`
- `GET /print-jobs`
- `POST /print-jobs/{id}/claim`
- `POST /print-jobs/{id}/ack`
- `POST /print-jobs/{id}/reprint`

KDS clients poll `GET /kitchen-jobs`. Printer bridge clients poll `GET /print-jobs?status=QUEUED`, claim a job, then ack success or failure.

## Phase 5 Inventory Core Endpoints

- `GET/POST /warehouses`
- `PATCH /warehouses/{id}`
- `GET /inventory/on-hand`
- `POST /inventory/adjustments`
- `POST /inventory/counts`
- `POST /inventory/counts/{id}/post`
- `POST /inventory/transfers`
- `POST /inventory/transfers/{id}/post`
- `POST /purchase-orders`
- `POST /purchase-orders/{id}/order`
- `POST /purchase-orders/{id}/receipts`
- `GET/POST /recipes`

Inventory endpoints use decimal strings for quantities and costs. Stock count posting and transfer posting use `version` for conflict detection.

## Phase 6 Wholesale Core Endpoints

- `GET/POST /customers`
- `PATCH /customers/{id}`
- `POST /customers/{id}/price-lists`
- `GET/POST /quotations`
- `POST /quotations/{id}/send`
- `POST /quotations/{id}/accept`
- `POST /quotations/{id}/cancel`
- `GET/POST /invoices`
- `POST /invoices/{id}/issue`
- `POST /invoices/{id}/void`
- `POST /invoices/{id}/payments`
- `GET /receivables`

Wholesale documents use decimal strings for quantities, prices, totals, and receivable amounts. Quotation and invoice transitions use `version` for conflict detection. Receivable payments cannot exceed the invoice outstanding balance.

## Phase 7 Sync Foundation Endpoints

- `GET /sync/events?after={cursor}&limit={limit}`
- `GET /sync/events/stream?after={cursor}&limit={limit}`
- `GET /sync/snapshot`
- `POST /sync/snapshots/build`
- `GET /sync/presence`
- `GET/POST /devices`
- `PATCH /devices/{id}`
- `POST /devices/{id}/revoke`
- `POST /devices/{id}/sync-cursor`
- `GET/POST /devices/{id}/sync-commands`
- `POST /sync/commands/process`

The polling response includes events ordered by `sequence` and a `pagination.nextCursor`. Clients store the cursor and replay from it after reconnect. The SSE stream emits `ready`, `sync_event`, `heartbeat`, and `close` events; clients reconnect with the latest cursor. WebSocket fanout remains future work.

Snapshots store a compact tenant read model at a specific event sequence. A client can load the latest snapshot, set its cursor to the snapshot sequence, and then poll `/sync/events` for newer events.

Device routes register revocable device identities and store per-device cursor checkpoints. Sync command routes accept offline command batches with client-generated command IDs. A revoked device cannot update its cursor or submit commands. The first processor supports `ticket.create`, `ticket.update`, `ticket.cancel`, and `order_item.add`; unsupported command types are marked `REJECTED` with an error code. Commands that mutate an existing aggregate use `baseSequence` for conflict detection and reject stale writes with `sync_conflict`.

Presence is derived from device `lastSeenAt`: active within 90 seconds, recent within 5 minutes, offline after that, and revoked for revoked devices.

## Shared Rules

- Protected organization routes require `X-Organization-Id`.
- List endpoints use cursor pagination where relevant; default limit is 50 and max is 100.
- Mutable records use optimistic `version` checks.
- Financial Ticket writes require `Idempotency-Key` where duplicate writes are most dangerous now. Kitchen, inventory, wholesale, and sync command write endpoints are scheduled for the same idempotency middleware before pilot load.
- OpenAPI separates actual Phase 1-7 endpoints from future advanced Ticket design with `x-future-ticket-contract`.

## Future Ticket And Restaurant Routes

Planned for later Phase 3-4 work:

- `POST /tickets/{id}/merge`
- `POST /tickets/{id}/item-transfers`
- `GET /bills/{id}/receipt`

No table-management API will be added.
