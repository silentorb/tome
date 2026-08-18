import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import type { ExtensionGraphMutateServices } from "tome-interfaces/extension-services/graph-mutate";
import type { ExtensionGraphQueryServices } from "tome-interfaces/extension-services/graph-query";
import type { ExtensionSqlQueryServices } from "tome-interfaces/extension-services/sql-query";
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

describe("mutateTimelineDepends", () => {
  test("rejects a self-loop without mutating", async () => {
    const calls: unknown[] = [];
    const graphMutate: ExtensionGraphMutateServices = {
      linkOutgoing(input) {
        calls.push(input);
        return null;
      },
      unlinkOutgoing() {
        calls.push("unlink");
        return null;
      },
    };
    const result = await mutateTimelineDepends({
      action: "addDepends",
      pageNodeId: PAGE_ID,
      prerequisiteId: "e1",
      dependentId: "e1",
      blockData: { version: 1, reactFlow: { nodes: [], edges: [] } },
      sqlQuery: { queryAll: async () => [] },
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

  test("addDepends links prerequisite to dependent then returns depends on arrange failure", async () => {
    const links: { sourceId: string; targetId: string; type: string }[] = [];
    const graphMutate: ExtensionGraphMutateServices = {
      linkOutgoing(input) {
        links.push(input);
        return null;
      },
      unlinkOutgoing() {
        return null;
      },
    };
    const sqlQuery: ExtensionSqlQueryServices = {
      queryAll: async () => {
        throw new Error("query boom");
      },
    };
    const graphQuery: ExtensionGraphQueryServices = {
      listTypeMembers: () => [],
      listEdges: () => [
        {
          id: "edge-1",
          sourceId: "e1",
          targetId: "e2",
          type: `${ASSOC_ID}:0`,
        },
      ],
    };
    const result = await mutateTimelineDepends({
      action: "addDepends",
      pageNodeId: PAGE_ID,
      prerequisiteId: "e1",
      dependentId: "e2",
      blockData: { version: 1, reactFlow: { nodes: [], edges: [] } },
      sqlQuery,
      graphQuery,
      graphMutate,
      contentDir: writeSequencingDir(),
    });
    expect(links).toEqual([{ sourceId: "e1", targetId: "e2", type: ASSOC_ID }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
      expect(result.depends).toEqual([{ prerequisiteId: "e1", dependentId: "e2" }]);
    }
  });

  test("removeDepends unlinks then returns depends on arrange failure", async () => {
    const unlinks: unknown[] = [];
    const graphMutate: ExtensionGraphMutateServices = {
      linkOutgoing() {
        return null;
      },
      unlinkOutgoing(sourceId, targetId, type) {
        unlinks.push({ sourceId, targetId, type });
        return null;
      },
    };
    const result = await mutateTimelineDepends({
      action: "removeDepends",
      pageNodeId: PAGE_ID,
      prerequisiteId: "e1",
      dependentId: "e2",
      blockData: { version: 1, reactFlow: { nodes: [], edges: [] } },
      sqlQuery: {
        queryAll: async () => {
          throw new Error("query boom");
        },
      },
      graphQuery: {
        listTypeMembers: () => [],
        listEdges: () => [],
      },
      graphMutate,
      contentDir: writeSequencingDir(),
    });
    expect(unlinks).toEqual([{ sourceId: "e1", targetId: "e2", type: ASSOC_ID }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.depends).toEqual([]);
  });
});
