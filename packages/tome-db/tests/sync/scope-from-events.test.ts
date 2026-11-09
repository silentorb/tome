import { describe, expect, test } from "bun:test";
import { storeChangeEventToSyncScope } from "../../src/sync";

describe("storeChangeEventToSyncScope", () => {
  test("maps nodes and content markers", () => {
    const nodeScope = storeChangeEventToSyncScope({
      path: "01KWN86X6MFZQAJ1V36T95928S.md",
      kind: "node",
    });
    expect(nodeScope.mode).toBe("partial");
    if (nodeScope.mode === "partial") {
      expect(nodeScope.changes.nodes.modified).toEqual(["01KWN86X6MFZQAJ1V36T95928S"]);
    }
    expect(storeChangeEventToSyncScope({ path: "relationships", kind: "relationships" })).toEqual({
      mode: "content",
      relativeName: "relationships",
    });
    expect(
      storeChangeEventToSyncScope({ path: "associations.json", kind: "relationship-types" }),
    ).toEqual({
      mode: "content",
      relativeName: "associations.json",
    });
    expect(storeChangeEventToSyncScope({ path: "schema.json", kind: "schema" })).toEqual({
      mode: "content",
      relativeName: "schema.json",
    });
    expect(storeChangeEventToSyncScope({ path: "mystery.bin", kind: "unknown" })).toEqual({
      mode: "full",
    });
  });
});
