import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import type { ExtensionExecuteImpServices } from "tome-interfaces/extension-services/execute-imp";
import type { ExtensionGraphQueryServices } from "tome-interfaces/extension-services/graph-query";
import { arrangeTimeline } from "../src/arrange";
import { defaultBlockData } from "../src/config";
import { invalidateSequencingCache } from "../src/sequencing-file";

const PAGE_ID = "01KWN86X6MFZQAJ1V36T9592A9";
const ASSOC_ID = "01KXBNPNJDENZ9BXN5BYZ7JKPD";

function writeSequencingDir(): string {
  const root = mkdtempSync(join(tmpdir(), "tome-sequencing-arrange-"));
  const contentDir = join(root, "content");
  mkdirSync(join(contentDir, "model"), { recursive: true });
  writeFileSync(
    join(contentDir, "model", "sequencing.json"),
    JSON.stringify({
      version: 1,
      tables: {
        [PAGE_ID]: {
          dependsRelationshipType: ASSOC_ID,
          defaultDuration: 1,
        },
      },
    }),
  );
  writeFileSync(
    join(contentDir, "model", "schema.json"),
    JSON.stringify({
      version: 1,
      relationshipRules: [],
      enums: {
        priority: {
          options: ["Consideration", "Low", "Medium", "High", "Primary"],
          default: "Low",
          defaultOrder: "desc",
          values: { Low: 1, Medium: 2, High: 4, Consideration: 0, Primary: 8 },
        },
      },
    }),
  );
  invalidateSequencingCache(contentDir);
  return contentDir;
}

function groupedBlockData() {
  return {
    version: 1,
    graph: {
      nodes: [
        { id: "in", type: "input", inputs: {} },
        {
          id: "group",
          type: "group",
          inputs: { column: "priority", direction: "desc" },
        },
        { id: "out", type: "output", inputs: {} },
      ],
      edges: [
        {
          id: "e1",
          from: { node: "in", port: "value" },
          to: { node: "group", port: "collection" },
        },
        {
          id: "e2",
          from: { node: "group", port: "collection" },
          to: { node: "out", port: "value" },
        },
      ],
    },
    layout: {
      in: { x: 0, y: 0 },
      group: { x: 0, y: 0 },
      out: { x: 0, y: 0 },
    },
  };
}

function emptyGraphQuery(): ExtensionGraphQueryServices {
  return {
    listTypeMembers: () => [],
    listEdges: () => [],
  };
}

function mockExecuteImp(
  rows: Record<string, unknown>[],
): ExtensionExecuteImpServices {
  return {
    executeImp: async () => ({ columns: Object.keys(rows[0] ?? { id: "" }), rows }),
  };
}

describe("arrangeTimeline grouping", async () => {
  test("flat query still packs overlapping events onto distinct lanes", async () => {
    const layout = await arrangeTimeline({
      pageNodeId: PAGE_ID,
      blockData: defaultBlockData(),
      executeImp: mockExecuteImp([
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ]),
      graphQuery: emptyGraphQuery(),
      contentDir: writeSequencingDir(),
    });
    const lanes = layout.events.map((event) => event.lane).sort();
    expect(lanes).toEqual([0, 1]);
    expect(layout.laneCount).toBe(2);
  });

  test("grouped query stacks priority bands and packs overlap inside a band", async () => {
    const layout = await arrangeTimeline({
      pageNodeId: PAGE_ID,
      blockData: groupedBlockData(),
      executeImp: mockExecuteImp([
        { id: "low", title: "Low arc", priority: "Low" },
        { id: "p1", title: "Primary one", priority: "Primary" },
        { id: "p2", title: "Primary two", priority: "Primary" },
      ]),
      graphQuery: emptyGraphQuery(),
      contentDir: writeSequencingDir(),
    });
    const byId = new Map(layout.events.map((event) => [event.id, event]));
    const primaryLanes = [byId.get("p1")?.lane, byId.get("p2")?.lane].sort();
    expect(primaryLanes).toEqual([0, 1]);
    expect(byId.get("low")?.lane).toBe(2);
    expect(layout.laneCount).toBe(3);
  });
});
