import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { AppError } from "../../infra/errors";
import { allowedOrigins } from "../../config";
import type { AppBindings, AppDependencies } from "../context";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isAllowedOrigin(origin: string | undefined, appOrigin: string, corsOrigins = ""): boolean {
  if (!origin) return false;
  const normalizedOrigin = origin.replace(/\/$/, "");
  return allowedOrigins({ APP_ORIGIN: appOrigin, CORS_ORIGINS: corsOrigins }).includes(normalizedOrigin);
}

export function csrfMiddleware(deps: AppDependencies) {
  return createMiddleware<AppBindings>(async (c, next) => {
    if (unsafeMethods.has(c.req.method) && getCookie(c, deps.config.SESSION_COOKIE_NAME)) {
      if (!isAllowedOrigin(c.req.header("Origin"), deps.config.APP_ORIGIN, deps.config.CORS_ORIGINS)) {
        throw new AppError("csrf_origin_rejected", "Request origin is not allowed", 403);
      }
    }
    await next();
  });
}
