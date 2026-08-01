import { describe, expect, test } from "bun:test";
import { shouldShowPortLiteralInput } from "../src/imp-nodes";

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
      shouldShowPortLiteralInput({ id: "edgeType", type: { id: "string" } }, []),
    ).toBe(true);
    expect(
      shouldShowPortLiteralInput({ id: "edgeType", type: { id: "string" } }, ["edgeType"]),
    ).toBe(false);
    expect(
      shouldShowPortLiteralInput({ id: "column", type: { id: "string" } }, ["collection"]),
    ).toBe(true);
  });
});
