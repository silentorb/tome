import { describe, expect, test } from "bun:test";
import { buildElkGraph, measureEdgeLabelSize } from "../src/build-elk-graph";
import { parseSchemaDiagramConfig } from "../src/config";

const SNAPSHOT = {
  typeTables: [
    { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Scene" },
    { id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Feature" },
    { id: "cccccccccccccccccccccccccccccccc", title: "Inspiration" },
  ],
  relationColumnEdges: [
    {
      id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:features",
      sourceTypeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      targetTypeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      label: "features",
    },
    {
      id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:inspirations",
      sourceTypeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      targetTypeId: "cccccccccccccccccccccccccccccccc",
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

  test("filters by typeIds and relationshipTypes", () => {
    const config = parseSchemaDiagramConfig({
      typeIds: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
      relationshipTypes: ["features"],
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

  test("builds edges from relation columns without schema.json rules", () => {
    const config = parseSchemaDiagramConfig({});
    const result = buildElkGraph(
      {
        typeTables: [
          { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Scene" },
          { id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Feature" },
        ],
        relationColumnEdges: [
          {
            id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:features",
            sourceTypeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            targetTypeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
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
