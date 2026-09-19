import { createMiddleware } from "hono/factory";
import type { AppBindings, AppDependencies } from "../context";

export function loggerMiddleware(deps: AppDependencies) {
  return createMiddleware<AppBindings>(async (c, next) => {
    c.set("logger", deps.logger);
    const startedAt = performance.now();
    await next();
    deps.logger.info("http_request", {
      requestId: c.get("requestId"),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt)
    });
  });
}
