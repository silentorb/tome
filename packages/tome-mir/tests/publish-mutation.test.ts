import { describe, expect, test } from "bun:test";
import {
  emptySyncPartialScope,
  publishMutation,
  syncScopeForNodeUpsert,
  type SyncEndpoint,
  type SyncSignal,
} from "../src/index";

describe("publishMutation", () => {
  test("runs write and sink applies in parallel and joins", async () => {
    const order: string[] = [];
    let writeStarted = false;
    let applyStarted = false;

    const sink: SyncEndpoint = {
      id: "cache",
      capabilities: { kind: "sqlite", canBeObserved: false, canObserve: true },
      asSource() {
        throw new Error("not a source");
      },
      async apply(signal: SyncSignal) {
        applyStarted = true;
        order.push("apply-start");
        expect(signal.preview?.nodes?.["n1"]).toEqual({ title: "T" });
        await Bun.sleep(20);
        order.push("apply-end");
      },
    };

    await publishMutation({
      storeId: "corpus",
      write: async () => {
        writeStarted = true;
        order.push("write-start");
        await Bun.sleep(20);
        order.push("write-end");
      },
      scope: syncScopeForNodeUpsert("n1", false),
      preview: { nodes: { n1: { title: "T" } } },
      source: {
        executeImp() {
          return { columns: ["id"], rows: [] };
        },
      },
      edges: [
        {
          fromStoreId: "corpus",
          toStoreId: "cache",
          fromNodeId: "src",
          toNodeId: "sink",
          fromKind: "store",
        },
      ],
      endpoint: () => sink,
    });

    expect(writeStarted).toBe(true);
    expect(applyStarted).toBe(true);
    expect(order[0]).toBe("write-start");
    expect(order[1]).toBe("apply-start");
    expect(order).toContain("write-end");
    expect(order).toContain("apply-end");
  });

  test("heals sinks when write fails after apply", async () => {
    const applies: Array<SyncSignal["preview"] | undefined> = [];
    const sink: SyncEndpoint = {
      id: "cache",
      capabilities: { kind: "sqlite", canBeObserved: false, canObserve: true },
      asSource() {
        throw new Error("not a source");
      },
      async apply(signal: SyncSignal) {
        applies.push(signal.preview);
      },
    };

    await expect(
      publishMutation({
        storeId: "corpus",
        write: async () => {
          await Bun.sleep(5);
          throw new Error("disk full");
        },
        scope: syncScopeForNodeUpsert("n1", false),
        preview: { nodes: { n1: { title: "T" } } },
        source: {
          executeImp() {
            return { columns: ["id"], rows: [] };
          },
        },
        edges: [
          {
            fromStoreId: "corpus",
            toStoreId: "cache",
            fromNodeId: "src",
            toNodeId: "sink",
            fromKind: "store",
          },
        ],
        endpoint: () => sink,
      }),
    ).rejects.toThrow("disk full");

    // First apply with preview, then heal without preview.
    expect(applies.length).toBeGreaterThanOrEqual(2);
    expect(applies[0]).toEqual({ nodes: { n1: { title: "T" } } });
    expect(applies[applies.length - 1]).toBeUndefined();
  });

  test("ignores edges for other storeIds", async () => {
    let applied = 0;
    const sink: SyncEndpoint = {
      id: "cache",
      capabilities: { kind: "sqlite", canBeObserved: false, canObserve: true },
      asSource() {
        throw new Error("not a source");
      },
      async apply() {
        applied++;
      },
    };

    await publishMutation({
      storeId: "corpus-a",
      write: async () => {},
      scope: { mode: "partial", changes: emptySyncPartialScope() },
      source: {
        executeImp() {
          return { columns: ["id"], rows: [] };
        },
      },
      edges: [
        {
          fromStoreId: "corpus-b",
          toStoreId: "cache",
          fromNodeId: "src",
          toNodeId: "sink",
          fromKind: "gitWatch",
        },
      ],
      endpoint: () => sink,
    });

    expect(applied).toBe(0);
  });
});
