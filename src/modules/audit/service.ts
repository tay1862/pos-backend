import { auditLogs, syncEvents } from "../../db/schema";
import type { Database } from "../../db";
import type { auditAction } from "../../db/schema";

type AuditAction = (typeof auditAction.enumValues)[number];

export async function writeAudit(
  db: Pick<Database, "insert">,
  input: {
    organizationId?: string | undefined;
    actorUserId?: string | undefined;
    action: AuditAction;
    entityType: string;
    entityId?: string | undefined;
    requestId?: string | undefined;
    metadata?: Record<string, unknown>;
  }
) {
  await db.insert(auditLogs).values({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    requestId: input.requestId,
    metadata: input.metadata ?? {}
  });

  if (input.organizationId) {
    await db.insert(syncEvents).values({
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      eventType: `${input.entityType}.${input.action.toLowerCase()}`,
      payload: input.metadata ?? {},
      requestId: input.requestId
    });
  }
}
