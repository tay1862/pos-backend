import { AppError } from "../infra/errors";
import type { Context } from "hono";

export async function parseJsonBody<T>(c: Context, schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: { issues: unknown } } }): Promise<T> {
  let payload: unknown;

  try {
    payload = await c.req.json();
  } catch {
    throw new AppError("invalid_json", "Request body must be valid JSON", 400);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError("validation_failed", "Request validation failed", 400, parsed.error.issues);
  }

  return parsed.data;
}

export function parseCursor(url: URL) {
  const limitValue = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 100) : 50;
  const cursor = url.searchParams.get("cursor") ?? undefined;

  return { limit, cursor };
}
