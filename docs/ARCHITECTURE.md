# Architecture

The system is a modular monolith for multi-organization SaaS POS. The first working slices are foundation, catalog, Ticket sales core, restaurant/KDS core, inventory core, wholesale core, and sync foundation: authentication, organizations, locations, employees, roles, permissions, audit logs, categories, units, products, variants, tax rates, price lists, Tickets, Orders, Bills, Payments, Refunds, Kitchen Jobs, Print Jobs, warehouses, stock ledger movements, counts, transfers, purchasing, recipes/BOM, customers, quotations, invoices, receivables, devices, sync events, sync commands, health/readiness, OpenAPI, migrations, and deployment scaffolding.

The business core is Ticket-first. No table-management module exists. Restaurant, retail, and wholesale flows share Ticket, Order, Bill, Payment, Refund, Inventory Ledger, and Audit concepts in later phases.

## Stack

- Runtime and package manager: Bun
- Language: TypeScript strict mode
- HTTP: Hono
- API schema/docs: Zod and OpenAPI JSON
- Database: PostgreSQL
- ORM and migrations: Drizzle with `postgres.js`
- Tests: `bun:test`
- Auth foundation: self-hosted account/session tables behind the app auth boundary. `better-auth` is pinned as the intended library integration target, but Phase 1 routes currently use the app-owned session implementation so the organization/RBAC flow is explicit and testable.
- Password hashing: Bun Argon2id adapter in infrastructure code

## Module Boundaries

Routes handle HTTP concerns only. Use cases own business rules. Repositories own persistence. Cross-module work must share a transaction context.

Current modules:

- `auth`: users, password verification, revocable sessions
- `platform`: organizations, memberships, locations, employees, roles, permissions
- `catalog`: categories, units, products, variants, tax rates, price lists
- `sales`: Tickets, Orders, Bill allocation, Payments, Refunds
- `restaurant`: kitchen stations, dispatches, KDS item transitions, print job queue
- `inventory`: warehouses, stock ledger movements, counts, transfers, purchasing/receiving, recipes/BOM
- `wholesale`: customers, customer price-list assignment, quotations, invoices, receivable payments
- `sync`: device identities, tenant event polling, cursor checkpoints, offline command queue intake
- `audit`: durable audit log writer
- `db`: Drizzle schema and database construction
- `http`: middleware, errors, OpenAPI, app factory

Future extension modules include conflict-resolution sync, WebSocket delivery, loyalty, kiosk, customer display, payment integrations, and SaaS billing.

## Runtime Shape

`src/app.ts` exports `createApp()` so tests can exercise HTTP without opening a port. `src/index.ts` loads env, creates the DB connection, builds the app, and starts Bun's server.

Background work should start with PostgreSQL-backed outbox/jobs in this codebase. Redis, Kafka, and external queues are intentionally absent from foundation.
