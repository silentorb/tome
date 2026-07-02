import { describe, expect, test } from "bun:test";
import {
  BIDIRECTIONAL_EDGE_LABEL_SEPARATOR,
  buildElkGraph,
  mergeBidirectionalEdges,
} from "../src/build-elk-graph";
import { parseSchemaDiagramConfig } from "../src/config";

describe("mergeBidirectionalEdges", () => {
  test("combines reciprocal relation columns into one labeled edge", () => {
    const merged = mergeBidirectionalEdges([
      {
        id: "product:characters",
        sourceTypeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        targetTypeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        label: "characters",
      },
      {
        id: "character:products",
        sourceTypeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        targetTypeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        label: "products",
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.bidirectional).toBe(true);
    expect(merged[0]?.label).toBe(`products${BIDIRECTIONAL_EDGE_LABEL_SEPARATOR}characters`);
    expect(merged[0]?.sourceTypeId).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(merged[0]?.targetTypeId).toBe("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  test("keeps unidirectional edges separate", () => {
    const merged = mergeBidirectionalEdges([
      {
        id: "scene:features",
        sourceTypeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        targetTypeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        label: "features",
      },
      {
        id: "feature:inspirations",
        sourceTypeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        targetTypeId: "cccccccccccccccccccccccccccccccc",
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
          { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Product" },
          { id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Character" },
        ],
        relationColumnEdges: [
          {
            id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:characters",
            sourceTypeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            targetTypeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            label: "characters",
          },
          {
            id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:products",
            sourceTypeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            targetTypeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            label: "products",
          },
        ],
      },
      config,
    );
    expect(result.edgeCount).toBe(1);
    expect(result.graph.edges[0]?.bidirectional).toBe(true);
    expect(result.graph.edges[0]?.labels?.[0]?.text).toBe(
      `products${BIDIRECTIONAL_EDGE_LABEL_SEPARATOR}characters`,
    );
  });
});
