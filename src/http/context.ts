import type { Logger } from "../infra/logger";
import type { AppConfig } from "../config";
import type { Database } from "../db";

export type AppBindings = {
  Variables: {
    requestId: string;
    logger: Logger;
    organizationId?: string;
    rlsLocal?: boolean;
    actor?: AuthActor;
  };
};

export interface AuthActor {
  userId: string;
  email: string;
  sessionId: string;
}

export interface AppDependencies {
  config: AppConfig;
  db?: Database;
  logger: Logger;
}
