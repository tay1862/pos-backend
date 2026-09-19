import { z } from "zod";

const booleanString = z
  .string()
  .default("false")
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  DATABASE_SSL: booleanString,
  APP_ORIGIN: z.string().url(),
  CORS_ORIGINS: z.string().default(""),
  SESSION_COOKIE_NAME: z.string().min(1).default("pos_session"),
  PLATFORM_ADMIN_EMAIL: z.string().email(),
  INVITATION_BASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));

    throw new Error(`Invalid environment configuration: ${JSON.stringify(details)}`);
  }

  return parsed.data;
}

export function allowedOrigins(config: Pick<AppConfig, "APP_ORIGIN" | "CORS_ORIGINS">): string[] {
  return [...new Set([config.APP_ORIGIN, ...config.CORS_ORIGINS.split(",")].map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean))];
}
