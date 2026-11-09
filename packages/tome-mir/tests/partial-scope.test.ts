import { describe, expect, test } from "bun:test";
import {
  emptySyncPartialScope,
  mergeSyncPartialScope,
  syncScopeForNodeDelete,
  syncScopeForNodeUpsert,
  syncScopeForRelationshipUpsert,
} from "../src/index";

describe("SyncPartialScope", () => {
  test("helpers distinguish create modify delete", () => {
    expect(syncScopeForNodeUpsert("n1", false)).toEqual({
      mode: "partial",
      changes: {
        ...emptySyncPartialScope(),
        nodes: { created: ["n1"], modified: [], deleted: [] },
      },
    });
    expect(syncScopeForNodeUpsert("n1", true).mode).toBe("partial");
    const modifiedScope = syncScopeForNodeUpsert("n1", true);
    expect(modifiedScope.mode).toBe("partial");
    if (modifiedScope.mode === "partial") {
      expect(modifiedScope.changes.nodes.modified).toEqual(["n1"]);
    }
    expect(syncScopeForNodeDelete("n1")).toMatchObject({
      mode: "partial",
      changes: { nodes: { deleted: ["n1"] } },
    });
    expect(syncScopeForRelationshipUpsert("a:b:t", false).mode).toBe("partial");
  });

  test("merge combines id sets", () => {
    const a = emptySyncPartialScope();
    const b = emptySyncPartialScope();
    const merged = mergeSyncPartialScope(
      { ...a, nodes: { created: ["a"], modified: [], deleted: [] } },
      { ...b, nodes: { created: ["b"], modified: ["c"], deleted: [] } },
    );
    expect([...merged.nodes.created].sort()).toEqual(["a", "b"]);
    expect(merged.nodes.modified).toEqual(["c"]);
  });
});
