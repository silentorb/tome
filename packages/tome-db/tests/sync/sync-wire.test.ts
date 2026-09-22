import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildDefaultSyncGraph,
  createDefaultSyncNodeTypeRegistry,
  createStubSyncEndpointRecording,
  DataStoreRegistry,
  emptySyncPartialScope,
  mergeSyncPartialScope,
  openDataStoreSession,
  storeChangeEventToSyncScope,
  syncScopeForNodeDelete,
  syncScopeForNodeUpsert,
  syncScopeForRelationshipUpsert,
  wireSyncGraph,
  SYNC_OBSERVE_IN_PORT,
  SYNC_OBSERVE_OUT_PORT,
  SYNC_STORE_ID_INPUT,
  SYNC_STORE_NODE_TYPE,
} from "../../src/sync";
import type { SyncEndpoint, SyncSignal } from "../../src/sync";
import {
  createTestContentFixture,
  destroyTestContentFixture,
} from "../../src/content/test-helpers";

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

  test("storeChangeEventToSyncScope maps nodes and coarsens relationships", () => {
    const nodeScope = storeChangeEventToSyncScope({
      path: "01KWN86X6MFZQAJ1V36T95928S.md",
      kind: "node",
    });
    expect(nodeScope.mode).toBe("partial");
    if (nodeScope.mode === "partial") {
      expect(nodeScope.changes.nodes.modified).toEqual(["01KWN86X6MFZQAJ1V36T95928S"]);
    }
    expect(storeChangeEventToSyncScope({ path: "relationships", kind: "relationships" })).toEqual({
      mode: "full",
    });
  });
});

describe("SyncGraphWire", () => {
  test("wires A→B and A→C fan-out", async () => {
    const registry = new DataStoreRegistry();
    const appliedB: SyncSignal[] = [];
    const appliedC: SyncSignal[] = [];

    const sourceListeners: Array<(s: SyncSignal) => void> = [];
    const sourceEndpoint: SyncEndpoint = {
      id: "A",
      capabilities: { kind: "flatfile", canBeObserved: true, canObserve: false },
      asSource() {
        return {
          executeImp() {
            return { columns: ["id"], rows: [{ id: "x" }] };
          },
        };
      },
      apply() {
        throw new Error("source");
      },
      subscribe(listener) {
        sourceListeners.push(listener);
        return () => {
          const i = sourceListeners.indexOf(listener);
          if (i >= 0) sourceListeners.splice(i, 1);
        };
      },
    };

    const b = createStubSyncEndpointRecording("B");
    const c = createStubSyncEndpointRecording("C");
    // replace apply to also track
    const bEp = {
      ...b.endpoint,
      apply(s: SyncSignal) {
        appliedB.push(s);
        b.applied.push(s);
      },
    };
    const cEp = {
      ...c.endpoint,
      apply(s: SyncSignal) {
        appliedC.push(s);
        c.applied.push(s);
      },
    };

    registry.set({ id: "A", kind: "unknown", endpoint: sourceEndpoint });
    registry.set({ id: "B", kind: "unknown", endpoint: bEp });
    registry.set({ id: "C", kind: "unknown", endpoint: cEp });

    const graph = {
      nodes: {
        a: { id: "a", type: SYNC_STORE_NODE_TYPE, inputs: { [SYNC_STORE_ID_INPUT]: "A" } },
        b: { id: "b", type: SYNC_STORE_NODE_TYPE, inputs: { [SYNC_STORE_ID_INPUT]: "B" } },
        c: { id: "c", type: SYNC_STORE_NODE_TYPE, inputs: { [SYNC_STORE_ID_INPUT]: "C" } },
      },
      edges: {
        e1: {
          from: { node: "a", port: SYNC_OBSERVE_OUT_PORT },
          to: { node: "b", port: SYNC_OBSERVE_IN_PORT },
        },
        e2: {
          from: { node: "a", port: SYNC_OBSERVE_OUT_PORT },
          to: { node: "c", port: SYNC_OBSERVE_IN_PORT },
        },
      },
    };

    const wire = wireSyncGraph({
      graph,
      registry,
      nodeTypes: createDefaultSyncNodeTypeRegistry(),
    });
    expect(wire.edges).toHaveLength(2);

    const signal: SyncSignal = {
      source: sourceEndpoint.asSource(),
      scope: syncScopeForNodeUpsert("n1", false),
    };
    for (const listener of sourceListeners) listener(signal);

    expect(appliedB).toHaveLength(1);
    expect(appliedC).toHaveLength(1);
    wire.dispose();
  });

  test("rejects unknown node types and cycles", () => {
    const registry = new DataStoreRegistry();
    const stub = createStubSyncEndpointRecording("A");
    registry.set({ id: "A", kind: "unknown", endpoint: stub.endpoint });

    expect(() =>
      wireSyncGraph({
        graph: {
          nodes: { a: { id: "a", type: "nope.store", inputs: { storeId: "A" } } },
          edges: {},
        },
        registry,
        nodeTypes: createDefaultSyncNodeTypeRegistry(),
      }),
    ).toThrow(/Unknown sync node type/);

    const a = createStubSyncEndpointRecording("A2");
    const b = createStubSyncEndpointRecording("B2");
    // make both observe and be observed for cycle test
    const epA: SyncEndpoint = {
      ...a.endpoint,
      capabilities: { kind: "unknown", canBeObserved: true, canObserve: true },
    };
    const epB: SyncEndpoint = {
      ...b.endpoint,
      capabilities: { kind: "unknown", canBeObserved: true, canObserve: true },
    };
    const reg2 = new DataStoreRegistry();
    reg2.set({ id: "A2", kind: "unknown", endpoint: epA });
    reg2.set({ id: "B2", kind: "unknown", endpoint: epB });

    expect(() =>
      wireSyncGraph({
        graph: {
          nodes: {
            a: { id: "a", type: SYNC_STORE_NODE_TYPE, inputs: { [SYNC_STORE_ID_INPUT]: "A2" } },
            b: { id: "b", type: SYNC_STORE_NODE_TYPE, inputs: { [SYNC_STORE_ID_INPUT]: "B2" } },
          },
          edges: {
            e1: {
              from: { node: "a", port: SYNC_OBSERVE_OUT_PORT },
              to: { node: "b", port: SYNC_OBSERVE_IN_PORT },
            },
            e2: {
              from: { node: "b", port: SYNC_OBSERVE_OUT_PORT },
              to: { node: "a", port: SYNC_OBSERVE_IN_PORT },
            },
          },
        },
        registry: reg2,
        nodeTypes: createDefaultSyncNodeTypeRegistry(),
      }),
    ).toThrow(/cycle/);
  });

  test("buildDefaultSyncGraph creates flatfile→sqlite edges", () => {
    const g = buildDefaultSyncGraph(["marloth", "translucence"], "session-cache");
    expect(Object.keys(g.nodes)).toHaveLength(3);
    expect(Object.keys(g.edges)).toHaveLength(2);
  });
});

describe("openDataStoreSession smoke", () => {
  test("opens solo flatfile + sqlite and wires default graph", async () => {
    const fixture = createTestContentFixture();
    const dir = mkdtempSync(join(tmpdir(), "tome-sync-session-"));
    const dbPath = join(dir, "cache.sqlite");
    try {
      const session = await openDataStoreSession({
        dataStores: {
          content: {
            id: "content",
            module: "tome-flatfile",
            export: "createFlatfileModule",
            options: { contentPath: fixture.ctx.store.contentDir },
          },
          cache: {
            id: "cache",
            module: "tome-sqlite",
            export: "createSqliteModule",
            options: { dbPath },
          },
        },
        queryStoreId: "cache",
        deferReady: false,
      });
      expect(session.flatfileStoreIds).toEqual(["content"]);
      expect(session.wire?.edges).toHaveLength(1);
      expect(session.writeContext.sync).toBeDefined();
      session.dispose();
    } finally {
      destroyTestContentFixture(fixture);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
