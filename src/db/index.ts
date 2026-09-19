import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { AppConfig } from "../config";
import * as schema from "./schema";

export function createDatabase(config: AppConfig) {
  const client = postgres(config.DATABASE_URL, {
    ssl: config.DATABASE_SSL ? "require" : false,
    max: 10
  });

  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDatabase>;
