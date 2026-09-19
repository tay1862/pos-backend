import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { invitations, sessions, users } from "../../db/schema";
import type { Database } from "../../db";
import type { Context } from "hono";
import { AppError } from "../../infra/errors";
import { createOpaqueToken, hashSecret, sha256Hex, verifySecret } from "../../infra/crypto";
import type { AppBindings, AppDependencies } from "../../http/context";
import { parseJsonBody } from "../../http/validation";
import { writeAudit } from "../audit/service";
import { setRlsContext } from "../../db/rls";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const acceptInvitationSchema = z.object({
  token: z.string().min(32),
  name: z.string().min(1),
  password: z.string().min(12)
});

export function sessionCookieOptions(config: AppDependencies["config"]) {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "Lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  };
}

export async function handleLogin(c: Context<AppBindings>, deps: AppDependencies) {
  const body = await parseJsonBody(c, loginSchema);
  const db = requireDb(deps.db);
  const [user] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase())).limit(1);

  if (!user || !(await verifySecret(body.password, user.passwordHash))) {
    throw new AppError("invalid_credentials", "Email or password is incorrect", 401);
  }

  const token = createOpaqueToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  const [session] = await db
    .insert(sessions)
    .values({
      userId: user.id,
      tokenHash,
      userAgent: c.req.header("User-Agent"),
      ipAddress: c.req.header("X-Forwarded-For"),
      expiresAt
    })
    .returning();

  setCookie(c, deps.config.SESSION_COOKIE_NAME, token, sessionCookieOptions(deps.config));
  await writeAudit(db, {
    actorUserId: user.id,
    action: "LOGIN",
    entityType: "session",
    entityId: session?.id,
    requestId: c.get("requestId")
  });

  return c.json({
    data: {
      user: publicUser(user),
      session: {
        id: session?.id,
        expiresAt
      }
    }
  });
}

export async function handleLogout(c: Context<AppBindings>, deps: AppDependencies) {
  const actor = requireActor(c);
  const db = requireDb(deps.db);
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, actor.sessionId));
  deleteCookie(c, deps.config.SESSION_COOKIE_NAME, { path: "/" });
  await writeAudit(db, {
    actorUserId: actor.userId,
    action: "LOGOUT",
    entityType: "session",
    entityId: actor.sessionId,
    requestId: c.get("requestId")
  });

  return c.json({ data: { ok: true } });
}

export async function handleSession(c: Context<AppBindings>, deps: AppDependencies) {
  const actor = requireActor(c);
  const db = requireDb(deps.db);
  const [user] = await db.select().from(users).where(eq(users.id, actor.userId)).limit(1);

  return c.json({
    data: {
      user: user ? publicUser(user) : undefined,
      session: {
        id: actor.sessionId
      }
    }
  });
}

export async function handleSessions(c: Context<AppBindings>, deps: AppDependencies) {
  const actor = requireActor(c);
  const db = requireDb(deps.db);
  const rows = await db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      ipAddress: sessions.ipAddress,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
      current: eq(sessions.id, actor.sessionId)
    })
    .from(sessions)
    .where(and(eq(sessions.userId, actor.userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.createdAt))
    .limit(100);

  return c.json({ data: rows });
}

export async function handleRevokeSession(c: Context<AppBindings>, deps: AppDependencies) {
  const actor = requireActor(c);
  const db = requireDb(deps.db);
  const sessionId = c.req.param()["id"];
  if (!sessionId) throw new AppError("validation_failed", "Session id is required", 400);

  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, actor.userId), ne(sessions.id, actor.sessionId)));

  await writeAudit(db, {
    actorUserId: actor.userId,
    action: "REVOKE",
    entityType: "session",
    entityId: sessionId,
    requestId: c.get("requestId")
  });

  return c.json({ data: { ok: true } });
}

export async function createUser(db: Pick<Database, "insert">, input: { email: string; name: string; password: string; platformAdmin?: boolean }) {
  const [user] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: await hashSecret(input.password),
      platformAdmin: input.platformAdmin ?? false
    })
    .returning();

  if (!user) throw new AppError("user_create_failed", "Unable to create user", 500);
  return user;
}

export async function handleAcceptInvitation(c: Context<AppBindings>, deps: AppDependencies) {
  const body = await parseJsonBody(c, acceptInvitationSchema);
  const db = requireDb(deps.db);
  const tokenHash = await sha256Hex(body.token);

  const accepted = await db.transaction(async (tx) => {
    await setRlsContext(tx, { platformAdmin: true, local: true });
    const [invitation] = await tx.select().from(invitations).where(eq(invitations.tokenHash, tokenHash)).limit(1);

    if (!invitation) {
      throw new AppError("invalid_invitation", "Invitation token is invalid", 404);
    }

    if (invitation.status !== "PENDING" || invitation.acceptedAt || invitation.revokedAt) {
      throw new AppError("invitation_unavailable", "Invitation has already been used or revoked", 409);
    }

    await setRlsContext(tx, { organizationId: invitation.organizationId, platformAdmin: true, local: true });

    if (invitation.expiresAt <= new Date()) {
      await tx.update(invitations).set({ status: "EXPIRED" }).where(eq(invitations.id, invitation.id));
      throw new AppError("invitation_expired", "Invitation has expired", 410);
    }

    const [existingUser] = await tx.select().from(users).where(eq(users.email, invitation.email.toLowerCase())).limit(1);
    if (existingUser) {
      const sessionUserId = await resolveAuthenticatedUserId(c, deps, tx);
      if (sessionUserId !== existingUser.id) {
        throw new AppError("invitation_login_required", "Sign in as the invited account before accepting this invitation", 401);
      }
    }
    const user = existingUser ?? (await createUser(tx, {
        email: invitation.email,
        name: body.name,
        password: body.password
      }));

    await tx
      .update(invitations)
      .set({
        status: "ACCEPTED",
        acceptedAt: new Date()
      })
      .where(eq(invitations.id, invitation.id));

    await writeAudit(tx, {
      organizationId: invitation.organizationId,
      actorUserId: user.id,
      action: "UPDATE",
      entityType: "invitation",
      entityId: invitation.id,
      requestId: c.get("requestId")
    });

    return user;
  });

  return c.json({
    data: {
      user: publicUser(accepted),
      accepted: true
    }
  });
}

async function resolveAuthenticatedUserId(c: Context<AppBindings>, deps: AppDependencies, db: Pick<Database, "select">) {
  const token = getCookie(c, deps.config.SESSION_COOKIE_NAME) ?? readBearerToken(c.req.header("Authorization"));
  if (!token) return undefined;
  const [session] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, await sha256Hex(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return session?.userId;
}

function readBearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim();
}

export function publicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    platformAdmin: user.platformAdmin
  };
}

function requireDb(db: Database | undefined): Database {
  if (!db) throw new AppError("database_unavailable", "Database connection is not configured", 503);
  return db;
}

function requireActor(c: Context<AppBindings>) {
  const actor = c.get("actor");
  if (!actor) throw new AppError("unauthenticated", "Authentication is required", 401);
  return actor;
}
