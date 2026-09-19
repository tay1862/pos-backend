# Frontend API Requirements

The frontend must start from organizations and Tickets, not tables.

## Phase 1 Screens

- Login
- Current session and session management
- Organization selector
- Organization settings
- Location management
- Employee management
- Role and permission management
- Audit log
- Catalog categories
- Units
- Products and variants
- Tax rates
- Price lists and prices
- Ticket list
- Ticket detail
- Add order item
- Create bill from selected item quantities
- Issue/void bill
- Payment and refund forms with idempotency keys
- Kitchen station management
- KDS polling board
- Kitchen item status transition controls
- Print job monitor and reprint reason flow
- Warehouse management
- Stock on-hand view
- Inventory adjustment form with required reason
- Stock count draft and post flow
- Stock transfer draft and post flow
- Purchase order and receiving flow
- Recipe/BOM editor
- Wholesale customer management
- Customer price-list assignment
- Quotation draft/send/accept/cancel flow
- Wholesale invoice draft/issue/void flow
- Receivable payment form and outstanding balance view
- Device registration and revocation admin screen
- Sync cursor storage and `/sync/events` polling loop
- Offline command queue submission through `/devices/{id}/sync-commands`
- Display sync command results, including `APPLIED` Ticket result ids and `REJECTED` error codes
- Multi-device presence display from `/sync/presence`
- Initial sync bootstrap from `/sync/snapshot`, followed by `/sync/events` after the snapshot sequence
- Realtime updates through `/sync/events/stream`, reconnecting with the latest event cursor after `close`

## Future Ticket Screens

- Split bill by line and quantity
- Multiple payments on one Bill
- Merge Ticket flow with reason and lineage display
- Transfer items flow with version conflict handling
- KDS board polling every 3 seconds with backoff
- Inventory write retry UX using server idempotency once the pilot hardening work adds it
- Wholesale write retry UX using server idempotency once pilot hardening adds it

## States

The UI must treat Ticket status, payment status, and kitchen status as separate. A paid Ticket can still have kitchen work. A ready kitchen item does not imply payment.

Inventory screens must treat `stock_movements` as history. Correct stock through counts, transfers, receipts, or adjustments with reasons rather than editing movement rows.

Wholesale screens must treat issued invoices and receivable payments as accounting history. Use voids and additional payments rather than editing paid records.

Sync clients must persist the latest `pagination.nextCursor` per organization/device, update `/devices/{id}/sync-cursor` after applying events, and replay events after reconnect before accepting new local commands. Offline commands must use stable client-generated UUIDs so retries return the same queued command rather than creating duplicates.

For Ticket offline commands, clients must include the latest applied event sequence as `baseSequence` when updating, cancelling, or adding an order item to an existing Ticket. A `sync_conflict` result means the UI must reload events and ask staff to retry from the latest Ticket state.

## Errors

Every API error includes `requestId`; display useful messages and preserve the id for support.

## No Table UI

Do not build table maps, table lists, table merge screens, table occupancy, or table permissions. If staff need a physical hint, use Ticket label.
