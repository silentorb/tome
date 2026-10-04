import { describe, expect, test } from "bun:test";
import { shouldShowPortLiteralInput } from "../src/imp-nodes";
import { dedupeInboundReactFlowEdges, withoutInboundToPort } from "../src/config";

describe("shouldShowPortLiteralInput", () => {
  test("hides collection and boolean ports even when unconnected", () => {
    expect(
      shouldShowPortLiteralInput({ id: "exclude", type: { id: "collection" } }, []),
    ).toBe(false);
    expect(
      shouldShowPortLiteralInput({ id: "predicate", type: { id: "boolean" } }, []),
    ).toBe(false);
  });

  test("shows scalar ports only when unconnected", () => {
    expect(
      shouldShowPortLiteralInput({ id: "association", type: { id: "string" } }, []),
    ).toBe(true);
    expect(
      shouldShowPortLiteralInput({ id: "association", type: { id: "string" } }, ["association"]),
    ).toBe(false);
    expect(
      shouldShowPortLiteralInput({ id: "column", type: { id: "string" } }, ["collection"]),
    ).toBe(true);
  });
});

describe("inbound edge helpers", () => {
  test("withoutInboundToPort drops edges to the same target handle", () => {
    const edges = [
      { id: "a", source: "in", target: "out", targetHandle: "value" },
      { id: "b", source: "x", target: "filter", targetHandle: "collection" },
    ];
    expect(withoutInboundToPort(edges, "out", "value")).toEqual([edges[1]]);
    expect(withoutInboundToPort(edges, "filter", "collection")).toEqual([edges[0]]);
  });

  test("dedupeInboundReactFlowEdges keeps last inbound per target handle", () => {
    const edges = [
      { id: "a", source: "old", target: "out", targetHandle: "value" },
      { id: "b", source: "new", target: "out", targetHandle: "value" },
      { id: "c", source: "x", target: "filter", targetHandle: "collection" },
    ];
    expect(dedupeInboundReactFlowEdges(edges)).toEqual([edges[1], edges[2]]);
  });
});
