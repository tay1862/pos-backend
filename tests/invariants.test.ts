import { describe, expect, test } from "bun:test";
import { canAccessLocation } from "../src/modules/platform/authorization";
import { isPositiveDecimalString } from "../src/modules/sales/decimal-input";
import { canTransitionKitchenJobItem } from "../src/modules/restaurant/kitchen-state";
import { businessDateForTimezone } from "../src/domain/business-date";
import { isAllowedOrigin } from "../src/http/middleware/csrf";

describe("foundation invariants", () => {
  test("location access is granted only to owners or assigned employees", () => {
    expect(canAccessLocation({ isOwner: true, assignedLocationIds: [] }, "loc-a")).toBe(true);
    expect(canAccessLocation({ isOwner: false, assignedLocationIds: ["loc-a"] }, "loc-a")).toBe(true);
    expect(canAccessLocation({ isOwner: false, assignedLocationIds: ["loc-a"] }, "loc-b")).toBe(false);
  });

  test("business decimal inputs must be greater than zero", () => {
    expect(isPositiveDecimalString("1")).toBe(true);
    expect(isPositiveDecimalString("0")).toBe(false);
    expect(isPositiveDecimalString("0.000000")).toBe(false);
    expect(isPositiveDecimalString("1.250000")).toBe(true);
    expect(isPositiveDecimalString("1.0000000")).toBe(false);
  });

  test("kitchen job transitions follow the workflow", () => {
    expect(canTransitionKitchenJobItem("QUEUED", "PREPARING")).toBe(true);
    expect(canTransitionKitchenJobItem("PREPARING", "READY")).toBe(true);
    expect(canTransitionKitchenJobItem("READY", "SERVED")).toBe(true);
    expect(canTransitionKitchenJobItem("SERVED", "PREPARING")).toBe(false);
    expect(canTransitionKitchenJobItem("CANCELLED", "READY")).toBe(false);
  });

  test("business dates use the location timezone", () => {
    const instant = new Date("2026-01-01T23:30:00.000Z");
    expect(businessDateForTimezone("Asia/Vientiane", instant)).toBe("2026-01-02");
    expect(businessDateForTimezone("America/Los_Angeles", instant)).toBe("2026-01-01");
  });

  test("cookie state changes require the configured origin", () => {
    expect(isAllowedOrigin("https://pos.example", "https://pos.example")).toBe(true);
    expect(isAllowedOrigin("https://evil.example", "https://pos.example")).toBe(false);
    expect(isAllowedOrigin(undefined, "https://pos.example")).toBe(false);
  });
});
