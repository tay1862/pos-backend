import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { devices, locations, syncClientStates } from "../../db/schema";
import type { AppBindings, AppDependencies } from "../../http/context";
import { parseJsonBody } from "../../http/validation";
import { AppError } from "../../infra/errors";
import { writeAudit } from "../audit/service";
import { requireLocationAccess, requireOrganizationAccess } from "../platform/access";

const deviceCreateSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1),
  locationId: z.string().uuid().optional()
});

const deviceUpdateSchema = z.object({
  code: z.string().min(1).max(64).optional(),
  name: z.string().min(1).optional(),
  locationId: z.string().uuid().nullable().optional(),
  version: z.number().int().positive()
});

const versionSchema = z.object({ version: z.number().int().positive() });

const cursorSchema = z.object({
  lastSequence: z.number().int().min(0)
});

export async function listDevices(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "devices.view");
  const rows = await db.select().from(devices).where(and(eq(devices.organizationId, access.organizationId), access.isOwner ? undefined : inArray(devices.locationId, access.locationIds))).orderBy(asc(devices.name)).limit(200);
  return c.json({ data: rows });
}

export async function createDevice(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "devices.manage");
  const body = await parseJsonBody(c, deviceCreateSchema);
  if (body.locationId) {
    await ensureLocation(db, access.organizationId, body.locationId);
    await requireLocationAccess(db, access, body.locationId);
  } else if (!access.isOwner) {
    throw new AppError("location_required", "A location is required for non-owner devices", 400);
  }
  const [created] = await db
    .insert(devices)
    .values({ organizationId: access.organizationId, locationId: body.locationId, code: body.code.toUpperCase(), name: body.name, createdByUserId: access.actor.userId })
    .returning();
  await writeAudit(db, auditInput(c, access, "CREATE", "device", created?.id));
  return c.json({ data: created }, 201);
}

export async function updateDevice(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "devices.manage");
  const id = readId(c);
  const body = await parseJsonBody(c, deviceUpdateSchema);
  const [current] = await db.select().from(devices).where(and(eq(devices.organizationId, access.organizationId), eq(devices.id, id), eq(devices.status, "ACTIVE"))).limit(1);
  if (!current) throw new AppError("device_not_found", "Active device was not found", 404);
  if (current.locationId) await requireLocationAccess(db, access, current.locationId);
  if (body.locationId) {
    await ensureLocation(db, access.organizationId, body.locationId);
    await requireLocationAccess(db, access, body.locationId);
  } else if (!access.isOwner) {
    throw new AppError("location_required", "A location is required for non-owner devices", 400);
  }
  const [updated] = await db
    .update(devices)
    .set({ code: body.code?.toUpperCase(), name: body.name, locationId: body.locationId, version: sql`${devices.version} + 1` })
    .where(and(eq(devices.organizationId, access.organizationId), eq(devices.id, id), eq(devices.version, body.version), eq(devices.status, "ACTIVE")))
    .returning();
  if (!updated) throw new AppError("version_conflict", "Device was changed or is not active", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "device", id));
  return c.json({ data: updated });
}

export async function revokeDevice(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "devices.manage");
  const id = readId(c);
  const body = await parseJsonBody(c, versionSchema);
  const [current] = await db.select().from(devices).where(and(eq(devices.organizationId, access.organizationId), eq(devices.id, id), eq(devices.status, "ACTIVE"))).limit(1);
  if (!current) throw new AppError("device_not_found", "Active device was not found", 404);
  if (current.locationId) await requireLocationAccess(db, access, current.locationId);
  const [updated] = await db
    .update(devices)
    .set({ status: "REVOKED", version: sql`${devices.version} + 1` })
    .where(and(eq(devices.organizationId, access.organizationId), eq(devices.id, id), eq(devices.version, body.version), eq(devices.status, "ACTIVE")))
    .returning();
  if (!updated) throw new AppError("version_conflict", "Device was changed or already revoked", 409);
  await writeAudit(db, auditInput(c, access, "UPDATE", "device", id, { status: "REVOKED" }));
  return c.json({ data: updated });
}

export async function updateDeviceSyncCursor(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "sync.read");
  const id = readId(c);
  const body = await parseJsonBody(c, cursorSchema);
  const [device] = await db.select().from(devices).where(and(eq(devices.organizationId, access.organizationId), eq(devices.id, id), eq(devices.status, "ACTIVE"))).limit(1);
  if (!device) throw new AppError("device_not_found", "Active device was not found", 404);
  if (device.locationId) await requireLocationAccess(db, access, device.locationId);

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(syncClientStates)
      .values({ organizationId: access.organizationId, deviceId: id, lastSequence: body.lastSequence, lastSeenAt: now, updatedByUserId: access.actor.userId })
      .onConflictDoUpdate({
        target: [syncClientStates.organizationId, syncClientStates.deviceId],
        set: { lastSequence: body.lastSequence, lastSeenAt: now, updatedByUserId: access.actor.userId }
      });
    await tx.update(devices).set({ lastSeenAt: now }).where(and(eq(devices.organizationId, access.organizationId), eq(devices.id, id)));
    await writeAudit(tx, auditInput(c, access, "UPDATE", "sync_client_state", id, { lastSequence: body.lastSequence }));
  });

  return c.json({ data: { deviceId: id, lastSequence: body.lastSequence, lastSeenAt: now } });
}

export async function listDevicePresence(c: Context<AppBindings>, deps: AppDependencies) {
  const db = requireDb(deps);
  const access = await requireOrganizationAccess(c, db, "sync.read");
  const now = Date.now();
  const rows = await db.select().from(devices).where(and(eq(devices.organizationId, access.organizationId), access.isOwner ? undefined : inArray(devices.locationId, access.locationIds))).orderBy(asc(devices.name)).limit(500);
  return c.json({
    data: rows.map((device) => {
      const ageSeconds = device.lastSeenAt ? Math.floor((now - device.lastSeenAt.getTime()) / 1000) : undefined;
      return {
        deviceId: device.id,
        code: device.code,
        name: device.name,
        locationId: device.locationId,
        status: device.status,
        lastSeenAt: device.lastSeenAt,
        ageSeconds,
        presence: device.status === "REVOKED" ? "revoked" : ageSeconds === undefined ? "offline" : ageSeconds <= 90 ? "active" : ageSeconds <= 300 ? "recent" : "offline"
      };
    })
  });
}

async function ensureLocation(db: Pick<ReturnType<typeof requireDb>, "select">, organizationId: string, id: string) {
  const [row] = await db.select({ id: locations.id }).from(locations).where(and(eq(locations.organizationId, organizationId), eq(locations.id, id), eq(locations.active, true))).limit(1);
  if (!row) throw new AppError("location_not_found", "Location was not found in this organization", 404);
}

function readId(c: Context<AppBindings>) {
  const id = c.req.param()["id"];
  if (!id) throw new AppError("validation_failed", "Resource id is required", 400);
  return id;
}

function auditInput(c: Context<AppBindings>, access: { organizationId: string; actor: { userId: string } }, action: "CREATE" | "UPDATE", entityType: string, entityId?: string, metadata?: Record<string, unknown>) {
  return {
    organizationId: access.organizationId,
    actorUserId: access.actor.userId,
    action,
    entityType,
    entityId,
    requestId: c.get("requestId"),
    ...(metadata ? { metadata } : {})
  };
}

function requireDb(deps: AppDependencies) {
  if (!deps.db) throw new AppError("database_unavailable", "Database connection is not configured", 503);
  return deps.db;
}
