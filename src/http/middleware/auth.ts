import { and, eq, gt, isNull } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { sessions, users } from "../../db/schema";
import { AppError } from "../../infra/errors";
import { sha256Hex } from "../../infra/crypto";
import type { AppBindings, AppDependencies } from "../context";

export function requireDatabase(deps: AppDependencies) {
  if (!deps.db) {
    throw new AppError("database_unavailable", "Database connection is not configured", 503);
  }

  return deps.db;
}

export function authMiddleware(deps: AppDependencies) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const token = getCookie(c, deps.config.SESSION_COOKIE_NAME) ?? readBearerToken(c.req.header("Authorization"));
    if (!token) {
      throw new AppError("unauthenticated", "Authentication is required", 401);
    }

    const db = requireDatabase(deps);
    const tokenHash = await sha256Hex(token);
    const [row] = await db
      .select({
        sessionId: sessions.id,
        userId: users.id,
        email: users.email
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .limit(1);

    if (!row) {
      throw new AppError("unauthenticated", "Session is invalid or expired", 401);
    }

    c.set("actor", {
      sessionId: row.sessionId,
      userId: row.userId,
      email: row.email
    });

    await next();
  });
}

function readBearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim();
}
