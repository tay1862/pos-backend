# Offline Sync

Phase 1 is online-first. Offline support starts in Phase 7, but foundation decisions prepare for it.

## Principles

- Every client write that can be retried must have idempotency.
- Mutable records expose `version`; stale writes return `409`.
- Business events should be written to an outbox in the same transaction as the business change.
- The server remains the authority for money, tax, inventory, and Ticket state transitions.
- Phase 7 foundation exposes `GET /sync/events` as the first polling-based event stream. Clients should store the returned cursor per organization.
- `/sync/snapshot` returns the latest compact read model. Clients can start from its `sequence` and then poll `/sync/events` after that cursor.
- `/sync/events/stream` provides Server-Sent Events for near-realtime updates. The stream closes periodically; clients should reconnect with the latest cursor.
- Device identity is represented by `/devices`; cursor checkpoints are stored with `/devices/{id}/sync-cursor`.
- `/sync/presence` derives active/recent/offline/revoked presence from device `lastSeenAt`.
- Offline commands can be submitted to `/devices/{id}/sync-commands`. They are stored as `RECEIVED` with a unique client command id; execution and conflict handling remain future work.
- `POST /sync/commands/process` currently applies `ticket.create`, `ticket.update`, `ticket.cancel`, and `order_item.add` commands and rejects unsupported command types. Ticket mutation commands use `baseSequence` to detect stale writes and reject them with `sync_conflict`. This is the first processor slice; it is still a server-controlled operation, not a general client-side mutation engine.
- Events are emitted only after organization-scoped audited writes commit.

## Future Sync Shape

Clients will queue commands, not arbitrary row patches. Each command includes:

- client command id
- organization id
- location id where relevant
- actor/session/device identity
- expected versions
- payload hash
- created-at timestamp

Server responses include accepted state, conflict details, and server event ids for catch-up.

## Conflict Defaults

- Financial writes are never merged silently.
- Ticket item edits use expected version checks.
- Kitchen transitions are monotonic and idempotent.
- Inventory movements are append-only ledger entries.
