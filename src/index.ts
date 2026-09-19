import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDatabase } from "./db";
import { createLogger } from "./infra/logger";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const db = createDatabase(config);
const app = createApp({ config, db, logger });

Bun.serve({
  hostname: config.HOST,
  port: config.PORT,
  fetch: app.fetch
});

logger.info("server_started", {
  host: config.HOST,
  port: config.PORT,
  environment: config.NODE_ENV
});
