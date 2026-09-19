# POS Backend

Ticket-first modular POS backend for multi-organization SaaS.

This repository currently includes Phase 0-7 foundation: Bun, TypeScript, Hono, PostgreSQL, Drizzle migrations, auth/session foundation, organizations, locations, employees, RBAC, audit logs, catalog categories, units, products, variants, tax rates, price lists, Ticket sales, Orders, Bills, Payments, Refunds, Kitchen/KDS jobs, print job queue, warehouses, stock ledger movements, stock counts, transfers, purchasing/receiving, recipes/BOM, wholesale customers, quotations, invoices, receivables, device identities, PostgreSQL-backed sync events, sync snapshots, sync cursor checkpoints, offline command queue intake, sync command processing for Ticket create/update/cancel and Order item add, OpenAPI, and deployment scaffolding.

No table-management business model exists in this codebase. Restaurant, retail, and wholesale flows are designed around Tickets.

## Local Setup

```bash
bun install
cp .env.example .env
docker compose up -d postgres
# Uses MIGRATION_DATABASE_URL for the one-time migration and DATABASE_URL for the app.
bun run db:migrate
bun run dev
```

Useful commands:

```bash
bun run typecheck
bun test
bun run build
bun run db:generate
bun run db:migrate
```

API docs are served at `/api/docs`; raw OpenAPI is at `/api/openapi.json`.

## Bootstrap

Set `PLATFORM_ADMIN_EMAIL` in `.env`, then create the first platform admin:

```bash
curl -X POST http://localhost:3000/api/v1/platform/bootstrap-admin \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","name":"Platform Admin","password":"replace-with-strong-password"}'
```

The endpoint works only before any user exists and only for the configured platform admin email.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Domain Model](docs/DOMAIN_MODEL.md)
- [Database Design](docs/DATABASE_DESIGN.md)
- [Authorization](docs/AUTHORIZATION.md)
- [API Design](docs/API_DESIGN.md)
- [Offline Sync](docs/OFFLINE_SYNC.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Frontend API Requirements](docs/FRONTEND_API_REQUIREMENTS.md)
- [Development Roadmap](docs/DEVELOPMENT_ROADMAP.md)
- [Repository Audit](docs/REPOSITORY_AUDIT.md)
