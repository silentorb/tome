import { describe, expect, test } from "bun:test";
import { HOSTS_PROJECTION_NODE_TYPE, hostsProjectionFilterGraph } from "tome-ontology";
import {
  BLOCK_ROLE,
  PREDICATE_PROPERTY_ID,
  defaultBlockData,
  defaultNodeFilterLayout,
  parseNodeFilterBlockData,
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

  test("defaultNodeFilterLayout places nodes", () => {
    const layout = defaultNodeFilterLayout();
    expect(layout.lit).toEqual({ x: 80, y: 120 });
  });

  test("hosts_projection Inspiration-shaped filter parses", () => {
    const original = hostsProjectionFilterGraph("01KXBNPNJDENZ9BXN5BYZ7JKPR", 0);
    expect(original.nodes.hosts?.type).toBe(HOSTS_PROJECTION_NODE_TYPE);
    expect(original.nodes.association?.inputs.value).toBe("01KXBNPNJDENZ9BXN5BYZ7JKPR");
    expect(original.nodes.direction?.inputs.value).toBe(0);
    expect(Object.keys(original.edges)).toHaveLength(2);
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
