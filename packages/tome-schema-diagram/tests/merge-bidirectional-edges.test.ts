import { describe, expect, test } from "bun:test";
import { buildElkGraph, mergeBidirectionalEdges } from "../src/build-elk-graph";
import { parseSchemaDiagramConfig } from "../src/config";

describe("mergeBidirectionalEdges", () => {
  test("combines reciprocal relation columns into one bidirectional edge", () => {
    const merged = mergeBidirectionalEdges([
      {
        id: "product:characters",
        sourceTypeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
        targetTypeId: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
        label: "characters",
      },
      {
        id: "character:products",
        sourceTypeId: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
        targetTypeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
        label: "products",
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.bidirectional).toBe(true);
    expect(merged[0]?.sourceTypeId).toBe("AAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(merged[0]?.targetTypeId).toBe("BBBBBBBBBBBBBBBBBBBBBBBBBB");
  });

  test("keeps unidirectional edges separate", () => {
    const merged = mergeBidirectionalEdges([
      {
        id: "scene:features",
        sourceTypeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
        targetTypeId: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
        label: "features",
      },
      {
        id: "feature:inspirations",
        sourceTypeId: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
        targetTypeId: "CCCCCCCCCCCCCCCCCCCCCCCCCC",
        label: "inspirations",
      },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.every((edge) => !edge.bidirectional)).toBe(true);
  });
});

describe("buildElkGraph bidirectional edges", () => {
  test("emits one graph edge for reciprocal relation columns", () => {
    const config = parseSchemaDiagramConfig({});
    const result = buildElkGraph(
      {
        typeTables: [
          { id: "AAAAAAAAAAAAAAAAAAAAAAAAAA", title: "Product" },
          { id: "BBBBBBBBBBBBBBBBBBBBBBBBBB", title: "Character" },
        ],
        relationColumnEdges: [
          {
            id: "AAAAAAAAAAAAAAAAAAAAAAAAAA:characters",
            sourceTypeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
            targetTypeId: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
            label: "characters",
          },
          {
            id: "BBBBBBBBBBBBBBBBBBBBBBBBBB:products",
            sourceTypeId: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
            targetTypeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
            label: "products",
          },
        ],
      },
      config,
    );
    expect(result.edgeCount).toBe(1);
    expect(result.graph.edges[0]?.bidirectional).toBe(true);
    expect(result.graph.edges[0]?.labels).toBeUndefined();
  });
});
