import { describe, expect, test } from "bun:test";
import type { ReactFlowGraph } from "imp-react-flow";
import {
  bindGraphParameters,
  listGraphParameters,
  resolveGraphParameterValues,
} from "../src/parameters";

const sampleGraph: ReactFlowGraph = {
  nodes: [
    {
      id: "includeConsiderations",
      type: "parameter",
      position: { x: 0, y: 0 },
      data: {
        inputValues: {
          label: "Include Consideration arcs",
          value: true,
        },
      },
    },
    {
      id: "lit",
      type: "literal",
      position: { x: 0, y: 0 },
      data: { inputValues: { value: "x" } },
    },
  ],
  edges: [],
};

describe("graph parameters", () => {
  test("listGraphParameters reads parameter nodes", () => {
    expect(listGraphParameters(sampleGraph)).toEqual([
      {
        id: "includeConsiderations",
        label: "Include Consideration arcs",
        defaultValue: true,
      },
    ]);
  });

  test("resolveGraphParameterValues layers overrides on defaults", () => {
    expect(resolveGraphParameterValues(sampleGraph, undefined)).toEqual({
      includeConsiderations: true,
    });
    expect(
      resolveGraphParameterValues(sampleGraph, { includeConsiderations: false }),
    ).toEqual({ includeConsiderations: false });
  });

  test("bindGraphParameters writes values onto parameter nodes", () => {
    const bound = bindGraphParameters(sampleGraph, { includeConsiderations: false });
    const node = bound.nodes.find((n) => n.id === "includeConsiderations");
    expect(node?.data?.inputValues?.value).toBe(false);
    expect(sampleGraph.nodes[0]?.data?.inputValues?.value).toBe(true);
  });
});
