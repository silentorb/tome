import { describe, expect, test } from "bun:test";
import type { Graph } from "imp-core-types";
import {
  bindGraphParameters,
  listGraphParameters,
  resolveGraphParameterValues,
} from "../src/parameters";

const sampleGraph: Graph = {
  nodes: {
    includeConsiderations: {
      id: "includeConsiderations",
      type: "parameter",
      inputs: {
        label: "Include Consideration arcs",
        value: true,
      },
    },
    lit: {
      id: "lit",
      type: "literal",
      inputs: { value: "x" },
    },
  },
  edges: {},
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
    expect(bound.nodes.includeConsiderations?.inputs?.value).toBe(false);
    expect(sampleGraph.nodes.includeConsiderations?.inputs?.value).toBe(true);
  });
});
