import { describe, expect, test } from "bun:test";
import type { Graph } from "imp-core-types";
import {
  isImpGraph,
  isReactFlowEnvelope,
  layoutForImpGraph,
  parseLayout,
  reactFlowToImpAndLayout,
} from "../src/layout";

const sampleGraph: Graph = {
  nodes: {
    in: { id: "in", type: "input", inputs: {} },
    out: { id: "out", type: "output", inputs: {} },
  },
  edges: {
    e: {
      from: { node: "in", port: "value" },
      to: { node: "out", port: "value" },
    },
  },
};

describe("tome-imp-view layout helpers", () => {
  test("layoutForImpGraph applies position overrides", () => {
    const layout = layoutForImpGraph(sampleGraph, {
      in: { x: 80, y: 120 },
      out: { x: 360, y: 120 },
    });
    expect(layout.in).toEqual({ x: 80, y: 120 });
    expect(layout.out).toEqual({ x: 360, y: 120 });
  });

  test("reactFlowToImpAndLayout round-trips a legacy envelope", () => {
    const { graph, layout } = reactFlowToImpAndLayout({
      nodes: [
        {
          id: "in",
          type: "input",
          position: { x: 10, y: 20 },
          data: { inputValues: {} },
        },
        {
          id: "out",
          type: "output",
          position: { x: 100, y: 20 },
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
    });
    expect(Object.keys(graph.nodes).sort()).toEqual(["in", "out"]);
    expect(layout.in).toEqual({ x: 10, y: 20 });
    expect(layout.out).toEqual({ x: 100, y: 20 });
  });

  test("detects Imp vs React Flow envelopes", () => {
    expect(isImpGraph(sampleGraph)).toBe(true);
    expect(isReactFlowEnvelope({ nodes: [], edges: [] })).toBe(true);
    expect(isReactFlowEnvelope(sampleGraph)).toBe(false);
  });

  test("parseLayout ignores invalid entries", () => {
    expect(parseLayout({ a: { x: 1, y: 2 }, b: "nope" })).toEqual({
      a: { x: 1, y: 2 },
    });
  });
});
