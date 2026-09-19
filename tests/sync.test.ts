import { describe, expect, test } from "bun:test";
import { isSameSyncCommandForReplay } from "../src/modules/sync/service";
import type { syncCommands } from "../src/db/schema";

type SyncCommandRow = typeof syncCommands.$inferSelect;

const baseCommand = {
  id: "00000000-0000-0000-0000-000000000001",
  organizationId: "00000000-0000-0000-0000-000000000002",
  deviceId: "00000000-0000-0000-0000-000000000003",
  clientCommandId: "00000000-0000-0000-0000-000000000004",
  commandType: "ticket.create",
  aggregateType: "ticket",
  aggregateId: null,
  baseSequence: 0,
  payload: { label: "A", nested: { second: 2, first: 1 } },
  status: "RECEIVED",
  resultEntityType: null,
  resultEntityId: null,
  resultSequence: null,
  errorCode: null,
  errorMessage: null,
  receivedByUserId: "00000000-0000-0000-0000-000000000005",
  receivedAt: new Date("2026-09-18T00:00:00.000Z"),
  processedAt: null
} satisfies SyncCommandRow;

describe("sync command replay validation", () => {
  test("accepts a duplicate client command only when the command content is identical", () => {
    expect(
      isSameSyncCommandForReplay(baseCommand, {
        clientCommandId: baseCommand.clientCommandId,
        commandType: "ticket.create",
        aggregateType: "ticket",
        baseSequence: 0,
        payload: { nested: { first: 1, second: 2 }, label: "A" }
      })
    ).toBe(true);
  });

  test("rejects a duplicate client command id when the payload changed", () => {
    expect(
      isSameSyncCommandForReplay(baseCommand, {
        clientCommandId: baseCommand.clientCommandId,
        commandType: "ticket.create",
        aggregateType: "ticket",
        baseSequence: 0,
        payload: { nested: { first: 1, second: 2 }, label: "B" }
      })
    ).toBe(false);
  });
});
