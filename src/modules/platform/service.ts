import { and, asc, count, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  auditLogs,
  employeeLocations,
  employeeRoles,
  employees,
  invitations,
  locations,
  organizationMemberships,
  organizations,
  permissions,
  rolePermissions,
  roles,
  users
} from "../../db/schema";
import type { Context } from "hono";
import type { AppBindings, AppDependencies } from "../../http/context";
import { AppError } from "../../infra/errors";
import { createOpaqueToken, sha256Hex } from "../../infra/crypto";
import { ownerRolePermissions, platformPermissions } from "../../domain/permissions";
import { createUser, publicUser } from "../auth/service";
import { parseCursor, parseJsonBody } from "../../http/validation";
import { writeAudit } from "../audit/service";
import { requireOrganizationAccess } from "./access";
import { setRlsContext } from "../../db/rls";

const bootstrapAdminSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(12)
});

const createOrganizationSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(1)
});

const updateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  baseCurrency: z.string().length(3).optional(),
  timezone: z.string().min(1).optional(),
  businessDayStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  taxEnabled: z.boolean().optional(),
  serviceChargeEnabled: z.boolean().optional(),
  version: z.number().int().positive()
});

const createLocationSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(32),
  timezone: z.string().min(1).default("Asia/Vientiane"),
  defaultPaymentTiming: z.enum(["PREPAY", "POSTPAY"]).default("POSTPAY")
});

const createEmployeeSchema = z.object({
  displayName: z.string().min(1),
  email: z.string().email().optional(),
  locationIds: z.array(z.string().uuid()).default([]),
  roleIds: z.array(z.string().uuid()).default([])
});

const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissionCodes: z.array(z.string()).default([])
});

export async function handleBootstrapAdmin(c: Context<AppBindings>, deps: AppDependencies) {
  const body = await parseJsonBody(c, bootstrapAdminSchema);
  const db = requireDb(deps);

  if (body.email.toLowerCase() !== deps.config.PLATFORM_ADMIN_EMAIL.toLowerCase()) {
    throw new AppError("forbidden", "Bootstrap email does not match platform configuration", 403);
  }

  const [userCount] = await db.select({ value: count() }).from(users);
  const value = userCount?.value ?? 0;
  if (Number(value) > 0) {
    throw new AppError("bootstrap_locked", "Platform admin bootstrap is available only before users exist", 409);
  }

  const user = await createUser(db, { ...body, platformAdmin: true });
  await writeAudit(db, {
    actorUserId: user.id,
    action: "CREATE",
    entityType: "platform_admin",
    entityId: user.id,
    requestId: c.get("requestId")
  });

  return c.json({ data: { user: publicUser(user) } }, 201);
}

export async function handleCreateOrganization(c: Context<AppBindings>, deps: AppDependencies) {
  const actor = requireActor(c);
  const body = await parseJsonBody(c, createOrganizationSchema);
  const db = requireDb(deps);
  const [platformUser] = await db.select().from(users).where(eq(users.id, actor.userId)).limit(1);

  if (!platformUser?.platformAdmin) {
    throw new AppError("forbidden", "Platform admin access is required", 403);
  }

  const invitationToken = createOpaqueToken();
  const invitationHash = await sha256Hex(invitationToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  const created = await db.transaction(async (tx) => {
    await setRlsContext(tx, { platformAdmin: true, local: true });
    await tx.insert(permissions).values(platformPermissions.map((code) => ({ code, description: code }))).onConflictDoNothing();

    const [organization] = await tx
      .insert(organizations)
      .values({
        name: body.name,
        slug: body.slug,
        baseCurrency: "LAK",
        timezone: "Asia/Vientiane"
      })
      .returning();

    if (!organization) throw new AppError("organization_create_failed", "Unable to create organization", 500);
    await setRlsContext(tx, { organizationId: organization.id, platformAdmin: true, local: true });

    const [ownerUser] = await tx.select().from(users).where(eq(users.email, body.ownerEmail.toLowerCase())).limit(1);
    const owner =
      ownerUser ??
      (await createUser(tx, {
        email: body.ownerEmail,
        name: body.ownerName,
        password: createOpaqueToken(24),
        platformAdmin: false
      }));

    const [membership] = await tx
      .insert(organizationMemberships)
      .values({
        organizationId: organization.id,
        userId: owner.id,
        isOwner: true
      })
      .returning();

    const [ownerEmployee] = await tx
      .insert(employees)
      .values({
        organizationId: organization.id,
        userId: owner.id,
        displayName: body.ownerName
      })
      .returning();

    const [ownerRole] = await tx
      .insert(roles)
      .values({
        organizationId: organization.id,
        name: "Owner",
        description: "Full organization access",
        system: true
      })
      .returning();

    if (ownerRole && ownerEmployee) {
      await tx
        .insert(rolePermissions)
        .values(ownerRolePermissions.map((permissionCode) => ({ organizationId: organization.id, roleId: ownerRole.id, permissionCode })))
        .onConflictDoNothing();
      await tx.insert(employeeRoles).values({ organizationId: organization.id, employeeId: ownerEmployee.id, roleId: ownerRole.id }).onConflictDoNothing();
    }

    const [invitation] = await tx
      .insert(invitations)
      .values({
        organizationId: organization.id,
        email: body.ownerEmail.toLowerCase(),
        tokenHash: invitationHash,
        invitedByUserId: actor.userId,
        expiresAt
      })
      .returning();

    await writeAudit(tx, {
      organizationId: organization.id,
      actorUserId: actor.userId,
      action: "CREATE",
      entityType: "organization",
      entityId: organization.id,
      requestId: c.get("requestId"),
      metadata: { ownerMembershipId: membership?.id }
    });

    return { organization, invitation };
  });

  return c.json(
    {
      data: {
        organization: created.organization,
        ownerInvitation: {
          id: created.invitation?.id,
          email: body.ownerEmail.toLowerCase(),
          expiresAt,
          url: `${deps.config.INVITATION_BASE_URL}?token=${invitationToken}`
        }
      }
    },
    201
  );
}

export async function handleMe(c: Context<AppBindings>, deps: AppDependencies) {
  const actor = requireActor(c);
  const db = requireDb(deps);
  const [user] = await db.select().from(users).where(eq(users.id, actor.userId)).limit(1);
  return c.json({ data: { user: user ? publicUser(user) : undefined } });
}

export async function handleMyOrganizations(c: Context<AppBindings>, deps: AppDependencies) {
  const actor = requireActor(c);
  const db = requireDb(deps);
  const rows = await db.transaction(async (tx) => {
    await setRlsContext(tx, { platformAdmin: true, local: true });
    return tx
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        baseCurrency: organizations.baseCurrency,
        timezone: organizations.timezone,
        isOwner: organizationMemberships.isOwner,
        membershipStatus: organizationMemberships.status
      })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
      .where(eq(organizationMemberships.userId, actor.userId))
      .orderBy(asc(organizations.name));
  });

  return c.json({ data: rows });
}

export async function handleGetOrganization(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "organization.view");
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, access.organizationId)).limit(1);

  return c.json({ data: organization });
}

export async function handlePatchOrganization(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "organization.update");
  const body = await parseJsonBody(c, updateOrganizationSchema);

  const [updated] = await db
    .update(organizations)
    .set({
      name: body.name,
      baseCurrency: body.baseCurrency,
      timezone: body.timezone,
      businessDayStart: body.businessDayStart,
      taxEnabled: body.taxEnabled,
      serviceChargeEnabled: body.serviceChargeEnabled,
      version: sql`${organizations.version} + 1`,
      updatedAt: new Date()
    })
    .where(and(eq(organizations.id, access.organizationId), eq(organizations.version, body.version)))
    .returning();

  if (!updated) throw new AppError("version_conflict", "Organization was changed by another request", 409);
  await writeAudit(db, {
    organizationId: access.organizationId,
    actorUserId: access.actor.userId,
    action: "UPDATE",
    entityType: "organization",
    entityId: access.organizationId,
    requestId: c.get("requestId")
  });

  return c.json({ data: updated });
}

export async function handleListLocations(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "locations.manage");
  const rows = await db.select().from(locations).where(and(eq(locations.organizationId, access.organizationId), access.isOwner ? undefined : inArray(locations.id, access.locationIds))).orderBy(asc(locations.name));
  return c.json({ data: rows });
}

export async function handleCreateLocation(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "locations.manage");
  const body = await parseJsonBody(c, createLocationSchema);
  const [location] = await db.insert(locations).values({ ...body, organizationId: access.organizationId }).returning();

  await writeAudit(db, {
    organizationId: access.organizationId,
    actorUserId: access.actor.userId,
    action: "CREATE",
    entityType: "location",
    entityId: location?.id,
    requestId: c.get("requestId")
  });

  return c.json({ data: location }, 201);
}

export async function handleListEmployees(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "employees.manage");
  const url = new URL(c.req.url);
  const search = url.searchParams.get("search");
  const rows = await db
    .select()
    .from(employees)
    .where(search ? and(eq(employees.organizationId, access.organizationId), ilike(employees.displayName, `%${search}%`)) : eq(employees.organizationId, access.organizationId))
    .orderBy(asc(employees.displayName))
    .limit(100);

  return c.json({ data: rows });
}

export async function handleCreateEmployee(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "employees.manage");
  const body = await parseJsonBody(c, createEmployeeSchema);
  if (new Set(body.locationIds).size !== body.locationIds.length || new Set(body.roleIds).size !== body.roleIds.length) {
    throw new AppError("duplicate_assignment", "Location and role assignments must be unique", 400);
  }
  const [linkedUser] = body.email ? await db.select().from(users).where(eq(users.email, body.email.toLowerCase())).limit(1) : [];

  const created = await db.transaction(async (tx) => {
    if (body.locationIds.length > 0) {
      const rows = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.organizationId, access.organizationId), inArray(locations.id, body.locationIds)));
      if (rows.length !== body.locationIds.length) throw new AppError("location_not_found", "One or more locations do not belong to this organization", 400);
    }
    if (body.roleIds.length > 0) {
      const rows = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.organizationId, access.organizationId), inArray(roles.id, body.roleIds)));
      if (rows.length !== body.roleIds.length) throw new AppError("role_not_found", "One or more roles do not belong to this organization", 400);
    }
    const [employee] = await tx
      .insert(employees)
      .values({
        organizationId: access.organizationId,
        userId: linkedUser?.id,
        displayName: body.displayName
      })
      .returning();

    if (!employee) throw new AppError("employee_create_failed", "Unable to create employee", 500);

    if (body.locationIds.length > 0) {
      await tx
        .insert(employeeLocations)
        .values(body.locationIds.map((locationId) => ({ organizationId: access.organizationId, employeeId: employee.id, locationId })))
        .onConflictDoNothing();
    }

    if (body.roleIds.length > 0) {
      await tx
        .insert(employeeRoles)
        .values(body.roleIds.map((roleId) => ({ organizationId: access.organizationId, employeeId: employee.id, roleId })))
        .onConflictDoNothing();
    }

    await writeAudit(tx, {
      organizationId: access.organizationId,
      actorUserId: access.actor.userId,
      action: "CREATE",
      entityType: "employee",
      entityId: employee.id,
      requestId: c.get("requestId")
    });

    return employee;
  });

  return c.json({ data: created }, 201);
}

export async function handleListPermissions(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  await requireOrganizationAccess(c, db, "roles.manage");
  const rows = await db.select().from(permissions).orderBy(asc(permissions.code));
  return c.json({ data: rows });
}

export async function handleListRoles(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "roles.manage");
  const rows = await db.select().from(roles).where(eq(roles.organizationId, access.organizationId)).orderBy(asc(roles.name));
  return c.json({ data: rows });
}

export async function handleCreateRole(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "roles.manage");
  const body = await parseJsonBody(c, createRoleSchema);
  const unknownPermissions = body.permissionCodes.filter((code) => !platformPermissions.includes(code as never));

  if (unknownPermissions.length > 0) {
    throw new AppError("unknown_permissions", "One or more permissions are not supported", 400, unknownPermissions);
  }

  const role = await db.transaction(async (tx) => {
    await tx.insert(permissions).values(platformPermissions.map((code) => ({ code, description: code }))).onConflictDoNothing();
    const [created] = await tx
      .insert(roles)
      .values({
        organizationId: access.organizationId,
        name: body.name,
        description: body.description
      })
      .returning();

    if (!created) throw new AppError("role_create_failed", "Unable to create role", 500);

    if (body.permissionCodes.length > 0) {
      await tx
        .insert(rolePermissions)
        .values(body.permissionCodes.map((permissionCode) => ({ organizationId: access.organizationId, roleId: created.id, permissionCode })))
        .onConflictDoNothing();
    }

    await writeAudit(tx, {
      organizationId: access.organizationId,
      actorUserId: access.actor.userId,
      action: "CREATE",
      entityType: "role",
      entityId: created.id,
      requestId: c.get("requestId")
    });

    return created;
  });

  return c.json({ data: role }, 201);
}

export async function handleAuditLogs(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "audit.view");
  const { limit } = parseCursor(new URL(c.req.url));
  const rows = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.organizationId, access.organizationId))
    .orderBy(sql`${auditLogs.createdAt} desc`)
    .limit(limit);

  return c.json({ data: rows, page: { limit } });
}

function requireDb(deps: AppDependencies) {
  if (!deps.db) throw new AppError("database_unavailable", "Database connection is not configured", 503);
  return deps.db;
}

function requireActor(c: Context<AppBindings>) {
  const actor = c.get("actor");
  if (!actor) throw new AppError("unauthenticated", "Authentication is required", 401);
  return actor;
}
