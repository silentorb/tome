import { describe, expect, test } from "bun:test";
import {
  compileAssociationConfig,
  compileNodePredicates,
  mergeRelationshipRuntimes,
  patternIdFromNodePredicate,
  predicateSelectsNode,
} from "../src/index";

describe("compileNodePredicates + merge", () => {
  test("overlays node predicates onto associations runtime", () => {
    const base = compileAssociationConfig({
      version: 1,
      relationshipTypes: {
        ASSOC1: { perspectives: ["A", "B"] },
      },
    });
    const overlay = compileNodePredicates([
      {
        id: "PRED1",
        title: "Parent of",
        nodeFilter: {
          nodes: {
            lit: { id: "lit", type: "literal", inputs: { value: true } },
          },
          edges: {},
        },
      },
    ]);
    const merged = mergeRelationshipRuntimes(base, overlay);
    expect(merged.predicates.has("ASSOC1")).toBe(true);
    expect(merged.predicates.get("PRED1")?.perspectives).toEqual(["Parent of", "Parent of"]);
    expect(merged.predicates.get("PRED1")?.nodeFilter?.nodes.lit?.type).toBe("literal");
    expect(merged.patterns.some((p) => p.id === patternIdFromNodePredicate("PRED1"))).toBe(true);
  });

  test("node overlay wins on same predicate id", () => {
    const base = compileAssociationConfig({
      version: 1,
      relationshipTypes: {
        SAME: { perspectives: ["Old0", "Old1"] },
      },
    });
    const overlay = compileNodePredicates([
      {
        id: "SAME",
        perspectives: ["New0", "New1"],
        nodeFilter: { nodes: {}, edges: {} },
      },
    ]);
    const merged = mergeRelationshipRuntimes(base, overlay);
    expect(merged.predicates.get("SAME")?.perspectives).toEqual(["New0", "New1"]);
    expect(merged.predicates.get("SAME")?.nodeFilter).toEqual({ nodes: {}, edges: {} });
  });

  test("predicateSelectsNode uses evaluator", async () => {
    const runtime = compileNodePredicates([
      {
        id: "P",
        nodeFilter: {
          nodes: { lit: { id: "lit", type: "literal", inputs: { value: true } } },
          edges: {},
        },
      },
    ]);
    const yes = await predicateSelectsNode(runtime, "P", "NODE1", (graph) => {
      const lit = Object.values(graph.nodes).find((n) => n.type === "literal");
      return lit?.inputs.value === true;
    });
    expect(yes).toBe(true);
    const no = await predicateSelectsNode(runtime, "MISSING", "NODE1", () => true);
    expect(no).toBe(false);
  });
});
