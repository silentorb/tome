import { describe, expect, test } from "bun:test";
import {
  PAGE_NODE_ID_LITERAL,
  bindPageNodeId,
  defaultBlockData,
  defaultPageScopedImpGraph,
  parseSequencingBlockData,
} from "../src/config";

describe("sequencing block config", () => {
  test("default includes page node sentinel", () => {
    const data = defaultBlockData();
    const lit = data.graph.nodes?.find((n) => n.id === "lit");
    expect(lit?.inputs?.value).toBe(PAGE_NODE_ID_LITERAL);
  });

  test("bindPageNodeId replaces sentinel", () => {
    const bound = bindPageNodeId(defaultPageScopedImpGraph(), "01KWN86X6MFZQAJ1V36T9592A9");
    expect(bound.nodes.lit?.inputs?.value).toBe("01KWN86X6MFZQAJ1V36T9592A9");
  });

  test("parse falls back to default", () => {
    const parsed = parseSequencingBlockData(null);
    expect(Object.keys(parsed.graph.nodes).length).toBeGreaterThan(0);
  });

  test("parse dual-supports legacy reactFlow fences", () => {
    const parsed = parseSequencingBlockData({
      version: 1,
      reactFlow: {
        nodes: [
          {
            id: "in",
            type: "input",
            position: { x: 0, y: 0 },
            data: { inputValues: {} },
          },
          {
            id: "out",
            type: "output",
            position: { x: 10, y: 0 },
            data: { inputValues: {} },
          },
        ],
        edges: [
          {
            id: "e",
            source: "in",
            target: "out",
            sourceHandle: "value",
            targetHandle: "value",
          },
        ],
      },
    });
    expect(Object.keys(parsed.graph.nodes).sort()).toEqual(["in", "out"]);
    expect(parsed.layout.in).toEqual({ x: 0, y: 0 });
  });
});
