import { describe, expect, test } from "bun:test";
import {
  BLOCK_ROLE,
  PREDICATE_PROPERTY_ID,
  defaultBlockData,
  nodeFilterToReactFlow,
  parseNodeFilterBlockData,
  reactFlowToNodeFilter,
  summarizeNodeFilter,
} from "../src/config";

describe("node-filter config", () => {
  test("uses node-filter role and predicate property id", () => {
    expect(BLOCK_ROLE).toBe("node-filter");
    expect(PREDICATE_PROPERTY_ID).toBe("predicate");
  });

  test("default is literal true Imp graph", () => {
    const data = defaultBlockData();
    expect(data.nodes.lit?.type).toBe("literal");
    expect(data.nodes.lit?.inputs.value).toBe(true);
    expect(Object.keys(data.edges)).toHaveLength(0);
  });

  test("round-trips Imp → React Flow → Imp", () => {
    const original = defaultBlockData();
    const rf = nodeFilterToReactFlow(original);
    expect(rf.nodes.length).toBeGreaterThan(0);
    const back = reactFlowToNodeFilter(rf);
    expect(back.nodes.lit?.type).toBe("literal");
    expect(back.nodes.lit?.inputs.value).toBe(true);
  });

  test("parse falls back to default for invalid payloads", () => {
    expect(parseNodeFilterBlockData(null)).toEqual(defaultBlockData());
    expect(parseNodeFilterBlockData({ version: 1, reactFlow: { nodes: [], edges: [] } })).toEqual(
      defaultBlockData(),
    );
  });

  test("summarize lists operator and edge counts", () => {
    expect(summarizeNodeFilter(defaultBlockData())).toContain("1 operator");
    expect(summarizeNodeFilter(defaultBlockData())).toContain("literal");
  });
});
