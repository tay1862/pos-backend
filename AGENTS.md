# Agent Instructions

This backend is Ticket-first. Do not add table-management entities, APIs, permissions, workflows, documentation requirements, or frontend mappings. Physical restaurant tables are intentionally modeled outside the backend business core; staff must start from Tickets.

Use the established stack unless the user explicitly changes it: Bun, TypeScript strict mode, Hono, Zod/OpenAPI, PostgreSQL, Drizzle, postgres.js, and `bun:test`.

Keep the system a modular monolith. Add modules through route/use-case/repository boundaries and shared transaction context. Do not introduce Redis, Kafka, external queues, or identity SaaS in foundation work without a concrete need and user approval.

Do not commit or push automatically. Do not touch production data. Do not run destructive database commands such as dropping schemas, truncating tables, or resetting migrations unless the user explicitly requests it for a known non-production database.

All business data must be scoped by `organization_id`; branch-level records also use `location_id`. Check membership, permission, and location scope on every request. RLS is defense in depth and does not replace application authorization.

Use decimal strings in API contracts for money and quantities. Never use JavaScript floating point math for business totals.

Document actual Phase 1 endpoints separately from future Ticket, Billing, Kitchen, Inventory, and Offline contracts.
