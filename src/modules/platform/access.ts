import { and, eq } from "drizzle-orm";
import { employeeLocations, employeeRoles, employees, organizationMemberships, rolePermissions } from "../../db/schema";
import type { Database } from "../../db";
import type { Context } from "hono";
import { AppError } from "../../infra/errors";
import { setRlsContext } from "../../db/rls";
import type { AppBindings, AuthActor } from "../../http/context";

export interface OrganizationAccess {
  organizationId: string;
  actor: AuthActor;
  isOwner: boolean;
  locationIds: string[];
}

export async function requireLocationAccess(
  db: Database,
  access: OrganizationAccess,
  locationId: string
): Promise<void> {
  if (access.isOwner) return;

  const [assignment] = await db
    .select({ locationId: employeeLocations.locationId })
    .from(employeeLocations)
    .innerJoin(employees, eq(employees.id, employeeLocations.employeeId))
    .where(
      and(
        eq(employeeLocations.organizationId, access.organizationId),
        eq(employeeLocations.locationId, locationId),
        eq(employees.organizationId, access.organizationId),
        eq(employees.userId, access.actor.userId),
        eq(employees.active, true)
      )
    )
    .limit(1);

  if (!assignment) {
    throw new AppError("forbidden", "You are not assigned to this location", 403);
  }
}

export async function requireOrganizationAccess(
  c: Context<AppBindings>,
  db: Database,
  permission?: string
): Promise<OrganizationAccess> {
  const actor = c.get("actor");
  if (!actor) throw new AppError("unauthenticated", "Authentication is required", 401);
  const organizationId = c.req.header("X-Organization-Id");

  if (!organizationId) {
    throw new AppError("organization_required", "X-Organization-Id header is required", 400);
  }

  if (!c.get("rlsLocal")) {
    throw new AppError("rls_context_required", "Tenant requests must run inside a transaction-scoped RLS context", 500);
  }

  await setRlsContext(db, { organizationId, platformAdmin: false, local: true });
  c.set("organizationId", organizationId);

  const [membership] = await db
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.userId, actor.userId),
        eq(organizationMemberships.status, "ACTIVE")
      )
    )
    .limit(1);

  if (!membership) {
    throw new AppError("forbidden", "You do not have access to this organization", 403);
  }

  if (permission && !membership.isOwner) {
    const [matchedPermission] = await db
      .select({ permissionCode: rolePermissions.permissionCode })
      .from(employees)
      .innerJoin(employeeRoles, eq(employeeRoles.employeeId, employees.id))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, employeeRoles.roleId))
      .where(
        and(
          eq(employees.organizationId, organizationId),
          eq(employees.userId, actor.userId),
          eq(employees.active, true),
          eq(employeeRoles.organizationId, organizationId),
          eq(rolePermissions.organizationId, organizationId),
          eq(rolePermissions.permissionCode, permission)
        )
      )
      .limit(1);

    if (!matchedPermission) {
      throw new AppError("forbidden", `Missing permission: ${permission}`, 403);
    }
  }

  const assignedLocations = membership.isOwner
    ? []
    : await db
        .select({ locationId: employeeLocations.locationId })
        .from(employeeLocations)
        .innerJoin(employees, eq(employees.id, employeeLocations.employeeId))
        .where(and(eq(employeeLocations.organizationId, organizationId), eq(employees.organizationId, organizationId), eq(employees.userId, actor.userId), eq(employees.active, true)));

  return {
    organizationId,
    actor,
    isOwner: membership.isOwner,
    locationIds: assignedLocations.map((row) => row.locationId)
  };
}
