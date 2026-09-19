import type { ErrorHandler } from "hono";
import { AppError } from "../../infra/errors";
import type { AppBindings } from "../context";

export const errorHandler: ErrorHandler<AppBindings> = (error, c) => {
  const requestId = c.get("requestId") ?? crypto.randomUUID();
  const logger = c.get("logger");

  if (error instanceof AppError) {
    logger?.warn(error.message, { requestId, code: error.code, status: error.status });
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        },
        requestId
      },
      error.status as 400
    );
  }

  logger?.error("Unhandled request error", {
    requestId,
    name: error.name,
    message: error.message
  });

  return c.json(
    {
      error: {
        code: "internal_server_error",
        message: "Internal server error"
      },
      requestId
    },
    500
  );
};
