import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import type { ExtensionGraphMutateServices } from "tome-interfaces/extension-services/graph-mutate";
import type { ExtensionGraphQueryServices } from "tome-interfaces/extension-services/graph-query";
import type { ExtensionExecuteImpServices } from "tome-interfaces/extension-services/execute-imp";
import { mutateTimelineDepends } from "../src/depends";
import { invalidateSequencingCache } from "../src/sequencing-file";

const PAGE_ID = "01KWN86X6MFZQAJ1V36T9592A9";
const ASSOC_ID = "01KXBNPNJDENZ9BXN5BYZ7JKPD";

function writeSequencingDir(): string {
  const root = mkdtempSync(join(tmpdir(), "tome-sequencing-depends-"));
  const contentDir = join(root, "content");
  mkdirSync(join(contentDir, "model"), { recursive: true });
  writeFileSync(
    join(contentDir, "model", "sequencing.json"),
    JSON.stringify({
      version: 1,
      tables: {
        [PAGE_ID]: {
          dependsAssociation: ASSOC_ID,
          defaultDuration: 1,
        },
      },
    }),
  );
  invalidateSequencingCache(contentDir);
  return contentDir;
}

function emptyMutate(
  overrides: Partial<ExtensionGraphMutateServices> = {},
): ExtensionGraphMutateServices {
  return {
    linkOutgoing() {
      return null;
    },
    unlinkOutgoing() {
      return null;
    },
    replaceOutgoingProperties() {
      return null;
    },
    ...overrides,
  };
}

function emptyExecuteImp(): ExtensionExecuteImpServices {
  return {
    executeImp: async () => ({ columns: ["id"], rows: [] }),
  };
}

function boomExecuteImp(): ExtensionExecuteImpServices {
  return {
    executeImp: async () => {
      throw new Error("query boom");
    },
  };
}

describe("mutateTimelineDepends", () => {
  test("rejects a self-loop without mutating", async () => {
    const calls: unknown[] = [];
    const graphMutate = emptyMutate({
      linkOutgoing(input) {
        calls.push(input);
        return null;
      },
      unlinkOutgoing() {
        calls.push("unlink");
        return null;
      },
    });
    const result = await mutateTimelineDepends({
      action: "addDepends",
      pageNodeId: PAGE_ID,
      prerequisiteId: "e1",
      dependentId: "e1",
      from: "end",
      to: "start",
      blockData: { version: 1, reactFlow: { nodes: [], edges: [] } },
      executeImp: emptyExecuteImp(),
      graphQuery: {
        listTypeMembers: () => [],
        listEdges: () => [],
      },
      graphMutate,
      contentDir: writeSequencingDir(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/itself/);
    expect(calls).toEqual([]);
  });

  test("addDepends links prerequisite to dependent with endpoints then returns depends on arrange failure", async () => {
    const links: unknown[] = [];
    const graphMutate = emptyMutate({
      linkOutgoing(input) {
        links.push(input);
        return null;
      },
    });
    const executeImp = boomExecuteImp();
    let listCount = 0;
    const createdEdge = {
      id: "edge-1",
      sourceId: "e1",
      targetId: "e2",
      type: `${ASSOC_ID}:0`,
      properties: { endpoints: [{ from: "end" as const, to: "start" as const }] },
    };
    const graphQuery: ExtensionGraphQueryServices = {
      listTypeMembers: () => [],
      listEdges: () => {
        listCount += 1;
        return listCount === 1 ? [] : [createdEdge];
      },
    };
    const result = await mutateTimelineDepends({
      action: "addDepends",
      pageNodeId: PAGE_ID,
      prerequisiteId: "e1",
      dependentId: "e2",
      from: "end",
      to: "start",
      blockData: { version: 1, reactFlow: { nodes: [], edges: [] } },
      executeImp,
      graphQuery,
      graphMutate,
      contentDir: writeSequencingDir(),
    });
    expect(links).toEqual([
      {
        sourceId: "e1",
        targetId: "e2",
        type: ASSOC_ID,
        properties: { endpoints: [{ from: "end", to: "start" }] },
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
      expect(result.depends).toEqual([
        { prerequisiteId: "e1", dependentId: "e2", from: "end", to: "start" },
      ]);
    }
  });

  test("addDepends merges a second endpoint combo onto an existing relationship", async () => {
    const replacements: unknown[] = [];
    const graphMutate = emptyMutate({
      linkOutgoing() {
        throw new Error("should merge, not create");
      },
      replaceOutgoingProperties(sourceId, targetId, type, properties) {
        replacements.push({ sourceId, targetId, type, properties });
        return null;
      },
    });
    const graphQuery: ExtensionGraphQueryServices = {
      listTypeMembers: () => [],
      listEdges: () => [
        {
          id: "edge-1",
          sourceId: "e1",
          targetId: "e2",
          type: `${ASSOC_ID}:0`,
          properties: { ordinal: 0, endpoints: [{ from: "start", to: "start" }] },
        },
      ],
    };
    const result = await mutateTimelineDepends({
      action: "addDepends",
      pageNodeId: PAGE_ID,
      prerequisiteId: "e1",
      dependentId: "e2",
      from: "end",
      to: "end",
      blockData: { version: 1, reactFlow: { nodes: [], edges: [] } },
      executeImp: boomExecuteImp(),
      graphQuery,
      graphMutate,
      contentDir: writeSequencingDir(),
    });
    expect(replacements).toEqual([
      {
        sourceId: "e1",
        targetId: "e2",
        type: ASSOC_ID,
        properties: {
          ordinal: 0,
          endpoints: [
            { from: "start", to: "start" },
            { from: "end", to: "end" },
          ],
        },
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.depends).toEqual([
        { prerequisiteId: "e1", dependentId: "e2", from: "start", to: "start" },
      ]);
    }
  });

  test("removeDepends unlinks the last combo then returns depends on arrange failure", async () => {
    const unlinks: unknown[] = [];
    const graphMutate = emptyMutate({
      unlinkOutgoing(sourceId, targetId, type) {
        unlinks.push({ sourceId, targetId, type });
        return null;
      },
    });
    let listCount = 0;
    const result = await mutateTimelineDepends({
      action: "removeDepends",
      pageNodeId: PAGE_ID,
      prerequisiteId: "e1",
      dependentId: "e2",
      from: "end",
      to: "start",
      blockData: { version: 1, reactFlow: { nodes: [], edges: [] } },
      executeImp: boomExecuteImp(),
      graphQuery: {
        listTypeMembers: () => [],
        listEdges: () => {
          listCount += 1;
          if (listCount === 1) {
            return [
              {
                id: "edge-1",
                sourceId: "e1",
                targetId: "e2",
                type: `${ASSOC_ID}:0`,
                properties: { endpoints: [{ from: "end", to: "start" }] },
              },
            ];
          }
          return [];
        },
      },
      graphMutate,
      contentDir: writeSequencingDir(),
    });
    expect(unlinks).toEqual([{ sourceId: "e1", targetId: "e2", type: ASSOC_ID }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.depends).toEqual([]);
  });

  test("removeDepends keeps the relationship when another combo remains", async () => {
    const replacements: unknown[] = [];
    const unlinks: unknown[] = [];
    const graphMutate = emptyMutate({
      unlinkOutgoing(sourceId, targetId, type) {
        unlinks.push({ sourceId, targetId, type });
        return null;
      },
      replaceOutgoingProperties(sourceId, targetId, type, properties) {
        replacements.push({ sourceId, targetId, type, properties });
        return null;
      },
    });
    const result = await mutateTimelineDepends({
      action: "removeDepends",
      pageNodeId: PAGE_ID,
      prerequisiteId: "e1",
      dependentId: "e2",
      from: "start",
      to: "start",
      blockData: { version: 1, reactFlow: { nodes: [], edges: [] } },
      executeImp: boomExecuteImp(),
      graphQuery: {
        listTypeMembers: () => [],
        listEdges: () => [
          {
            id: "edge-1",
            sourceId: "e1",
            targetId: "e2",
            type: `${ASSOC_ID}:0`,
            properties: {
              ordinal: 2,
              endpoints: [
                { from: "start", to: "start" },
                { from: "end", to: "end" },
              ],
            },
          },
        ],
      },
      graphMutate,
      contentDir: writeSequencingDir(),
    });
    expect(unlinks).toEqual([]);
    expect(replacements).toEqual([
      {
        sourceId: "e1",
        targetId: "e2",
        type: ASSOC_ID,
        properties: {
          ordinal: 2,
          endpoints: [{ from: "end", to: "end" }],
        },
      },
    ]);
    expect(result.ok).toBe(false);
  });
});
