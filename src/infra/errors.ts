export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function assertFound<T>(value: T | undefined | null, message = "Resource not found"): T {
  if (value === undefined || value === null) {
    throw new AppError("not_found", message, 404);
  }

  return value;
}
