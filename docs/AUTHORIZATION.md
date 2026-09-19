# Authorization

Authentication and authorization are separate.

Authentication identifies the user through revocable server-side sessions. Authorization checks organization membership, role permissions, and location assignment.

`better-auth` is installed and pinned for the self-hosted auth integration target. The current Phase 1 implementation exposes app-owned `/api/v1/auth/*` routes over the repository schema so frontend clients do not depend on a specific SDK.

## Sessions

Sessions store only a SHA-256 hash of the opaque session token. Cookies are `HttpOnly`, `SameSite=Lax`, and secure in production. Native clients may pass the same token as a Bearer token.

Logout and session revocation set `revoked_at`; the next request fails immediately.

## Platform Admin

Platform admin can provision organizations and owner invitations. Platform admin does not automatically receive access to merchant sales data.

`POST /api/v1/platform/bootstrap-admin` is a foundation bootstrap endpoint. It is available only before users exist and only for `PLATFORM_ADMIN_EMAIL`.

## Organization Access

Clients select active organization context with `X-Organization-Id`. The backend checks active membership on every organization-scoped request.

Owners have all organization permissions. Non-owner access must come from employee roles and permission codes.

Current permission codes include foundation permissions plus future Ticket permissions:

- `organization.view`
- `organization.update`
- `locations.manage`
- `employees.manage`
- `roles.manage`
- `audit.view`
- `tickets.create`
- `tickets.view`
- `tickets.update`
- `tickets.merge`
- `tickets.transfer_items`
- `tickets.close`
- `tickets.cancel`
- `discounts.apply`
- `refunds.create`
- `bills.void`
- `kitchen.dispatch`
- `kitchen.update`
- `print.reprint`

The migration protects the last active owner membership at the database layer.
