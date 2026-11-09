import { describe, expect, test } from "bun:test";
import {
  buildDefaultSyncGraph,
  ensureFtsObserveEdges,
  createDefaultSyncNodeTypeRegistry,
  createStubSyncEndpointRecording,
  DataStoreRegistry,
  syncScopeForNodeUpsert,
  wireSyncGraph,
  SYNC_OBSERVE_IN_PORT,
  SYNC_OBSERVE_OUT_PORT,
  SYNC_STORE_ID_INPUT,
  SYNC_STORE_NODE_TYPE,
  type SyncEndpoint,
  type SyncSignal,
} from "../src/index";

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

  test("buildDefaultSyncGraph wires flatfile→fts sinks", () => {
    const g = buildDefaultSyncGraph(["marloth"], "session-cache", ["fts"]);
    expect(g.nodes["sink:fts"]?.inputs?.storeId).toBe("fts");
    expect(g.edges["obs:marloth->fts"]).toBeTruthy();
    expect(Object.keys(g.edges)).toHaveLength(2);
  });

  test("ensureFtsObserveEdges is idempotent when edges already exist", () => {
    const g = buildDefaultSyncGraph(["marloth"], "session-cache", ["fts"]);
    const again = ensureFtsObserveEdges(g, ["marloth"], ["fts"]);
    expect(Object.keys(again.edges)).toEqual(Object.keys(g.edges));
  });

  test("ensureFtsObserveEdges adds missing fts edges to an explicit graph", () => {
    const g = buildDefaultSyncGraph(["marloth"], "session-cache");
    const patched = ensureFtsObserveEdges(g, ["marloth"], ["fts"]);
    expect(patched.nodes["sink:fts"]).toBeTruthy();
    expect(patched.edges["obs:marloth->fts"]).toBeTruthy();
  });

  test("idsWithEndpoint omits stores without an endpoint", () => {
    const registry = new DataStoreRegistry();
    registry.set({
      id: "fts-same-db",
      kind: "fts",
      close: () => undefined,
    });
    const stub = createStubSyncEndpointRecording("fts-sync");
    registry.set({
      id: "fts-sync",
      kind: "fts",
      endpoint: stub.endpoint,
      close: () => undefined,
    });
    expect(registry.idsWithEndpoint()).toEqual(["fts-sync"]);
    expect(() => registry.endpoint("fts-same-db")).toThrow(/no sync endpoint/);
  });
});
