import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import type { Logger } from "../src/infra/logger";

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

const config = loadConfig({
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: "3000",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/pos_backend_test",
  DATABASE_SSL: "false",
  APP_ORIGIN: "http://localhost:3000",
  SESSION_COOKIE_NAME: "pos_session",
  PLATFORM_ADMIN_EMAIL: "admin@example.com",
  INVITATION_BASE_URL: "http://localhost:3000/invitations",
  LOG_LEVEL: "error"
});

describe("foundation app", () => {
  test("root endpoint describes the API without requiring a database", async () => {
    const app = createApp({ config, logger });
    const response = await app.request("/");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        service: "pos-backend",
        status: "ok",
        apiBase: "/api/v1",
        docs: "/api/docs",
        health: "/api/v1/health",
        ready: "/api/v1/ready"
      }
    });
  });

  test("health endpoint is available without a database", async () => {
    const app = createApp({ config, logger });
    const response = await app.request("/api/v1/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        status: "ok",
        service: "pos-backend"
      }
    });
  });

  test("readiness fails closed when database is not configured", async () => {
    const app = createApp({ config, logger });
    const response = await app.request("/api/v1/ready");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      data: {
        status: "not_ready",
        database: "not_configured"
      }
    });
  });

  test("protected routes use the shared error envelope", async () => {
    const app = createApp({ config, logger });
    const response = await app.request("/api/v1/me", {
      headers: {
        "X-Request-Id": "test-request"
      }
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: {
        code: "unauthenticated",
        message: "Authentication is required"
      },
      requestId: "test-request"
    });
  });

  test("OpenAPI document declares implemented and future ticket routes", async () => {
    const app = createApp({ config, logger });
    const response = await app.request("/api/openapi.json");
    const body = (await response.json()) as {
      paths: Record<string, unknown>;
      "x-future-ticket-contract": { note: string };
    };

    expect(response.status).toBe(200);
    expect(body.paths["/auth/login"]).toBeDefined();
    expect(body.paths["/organization"]).toBeDefined();
    expect(body.paths["/catalog/products"]).toBeDefined();
    expect(body.paths["/catalog/price-list-items"]).toBeDefined();
    expect(body.paths["/tickets"]).toBeDefined();
    expect(body.paths["/bills/{id}/payments"]).toBeDefined();
    expect(body.paths["/kitchen-jobs"]).toBeDefined();
    expect(body.paths["/print-jobs/{id}/claim"]).toBeDefined();
    expect(body.paths["/warehouses"]).toBeDefined();
    expect(body.paths["/inventory/on-hand"]).toBeDefined();
    expect(body.paths["/purchase-orders"]).toBeDefined();
    expect(body.paths["/recipes"]).toBeDefined();
    expect(body.paths["/customers"]).toBeDefined();
    expect(body.paths["/quotations"]).toBeDefined();
    expect(body.paths["/invoices/{id}/payments"]).toBeDefined();
    expect(body.paths["/receivables"]).toBeDefined();
    expect(body.paths["/sync/events"]).toBeDefined();
    expect(body.paths["/sync/events/stream"]).toBeDefined();
    expect(body.paths["/sync/snapshot"]).toBeDefined();
    expect(body.paths["/sync/snapshots/build"]).toBeDefined();
    expect(body.paths["/devices"]).toBeDefined();
    expect(body.paths["/devices/{id}/sync-cursor"]).toBeDefined();
    expect(body.paths["/devices/{id}/sync-commands"]).toBeDefined();
    expect(body.paths["/sync/commands/process"]).toBeDefined();
    expect(body.paths["/sync/presence"]).toBeDefined();
    expect(body["x-future-ticket-contract"].note).toContain("No table management API");
  });
});

describe("configuration", () => {
  test("invalid environment stops startup without secret values", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: "not-a-url",
        APP_ORIGIN: "http://localhost:3000",
        PLATFORM_ADMIN_EMAIL: "admin@example.com",
        INVITATION_BASE_URL: "http://localhost:3000/invitations"
      })
    ).toThrow("Invalid environment configuration");
  });
});
