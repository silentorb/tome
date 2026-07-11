import { describe, expect, test } from "bun:test";
import { buildElkGraph, measureEdgeLabelSize } from "../src/build-elk-graph";
import { parseSchemaDiagramConfig } from "../src/config";

const SNAPSHOT = {
  typeTables: [
    { id: "AAAAAAAAAAAAAAAAAAAAAAAAAA", title: "Scene" },
    { id: "BBBBBBBBBBBBBBBBBBBBBBBBBB", title: "Feature" },
    { id: "CCCCCCCCCCCCCCCCCCCCCCCCCC", title: "Inspiration" },
  ],
  relationColumnEdges: [
    {
      id: "AAAAAAAAAAAAAAAAAAAAAAAAAA:features",
      sourceTypeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
      targetTypeId: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
      label: "features",
    },
    {
      id: "BBBBBBBBBBBBBBBBBBBBBBBBBB:inspirations",
      sourceTypeId: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
      targetTypeId: "CCCCCCCCCCCCCCCCCCCCCCCCCC",
      label: "inspirations",
    },
  ],
};

describe("buildElkGraph", () => {
  test("builds graph with type-table nodes and relation edges", () => {
    const config = parseSchemaDiagramConfig({});
    const result = buildElkGraph(SNAPSHOT, config);
    expect(result.entityCount).toBe(3);
    expect(result.edgeCount).toBe(2);
    expect(result.graph.children.map((node) => node.labels?.[0]?.text)).toEqual([
      "Scene",
      "Feature",
      "Inspiration",
    ]);
    expect(result.graph.edges.map((edge) => edge.labels?.[0]?.text)).toEqual([
      "features",
      "inspirations",
    ]);
    expect(result.graph.layoutOptions["elk.direction"]).toBe("DOWN");
  });

  test("filters by typeIds and perspectives", () => {
    const config = parseSchemaDiagramConfig({
      typeIds: ["AAAAAAAAAAAAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBBBBBBBBBBBB"],
      perspectives: ["features"],
    });
    const result = buildElkGraph(SNAPSHOT, config);
    expect(result.entityCount).toBe(2);
    expect(result.edgeCount).toBe(1);
    expect(result.graph.children.map((node) => node.labels?.[0]?.text)).toEqual(["Scene", "Feature"]);
    expect(result.graph.edges[0]?.labels?.[0]?.text).toBe("features");
  });

  test("uses RIGHT direction when configured LR", () => {
    const config = parseSchemaDiagramConfig({ direction: "LR" });
    const result = buildElkGraph(SNAPSHOT, config);
    expect(result.graph.layoutOptions["elk.direction"]).toBe("RIGHT");
  });

  test("includes edge label dimensions for layout", () => {
    const config = parseSchemaDiagramConfig({});
    const result = buildElkGraph(SNAPSHOT, config);
    const label = result.graph.edges[0]?.labels?.[0];
    expect(label?.width).toBeGreaterThan(0);
    expect(label?.height).toBeGreaterThan(0);
    expect(measureEdgeLabelSize("character_attributes").width).toBeGreaterThan(150);
  });

  test("carries member counts from snapshot", () => {
    const config = parseSchemaDiagramConfig({});
    const result = buildElkGraph(
      {
        ...SNAPSHOT,
        typeTables: SNAPSHOT.typeTables.map((table, index) => ({
          ...table,
          memberCount: index === 0 ? 5 : 0,
        })),
      },
      config,
    );
    expect(result.memberCounts.get(SNAPSHOT.typeTables[0]!.id)).toBe(5);
    expect(result.memberCounts.get(SNAPSHOT.typeTables[1]!.id)).toBe(0);
  });

  test("builds edges from relation columns without schema.json rules", () => {
    const config = parseSchemaDiagramConfig({});
    const result = buildElkGraph(
      {
        typeTables: [
          { id: "AAAAAAAAAAAAAAAAAAAAAAAAAA", title: "Scene" },
          { id: "BBBBBBBBBBBBBBBBBBBBBBBBBB", title: "Feature" },
        ],
        relationColumnEdges: [
          {
            id: "AAAAAAAAAAAAAAAAAAAAAAAAAA:features",
            sourceTypeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
            targetTypeId: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
            label: "features",
          },
        ],
      },
      config,
    );
    expect(result.edgeCount).toBe(1);
    expect(result.graph.edges[0]?.labels?.[0]?.text).toBe("features");
  });
});
