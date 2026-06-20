import { describe, expect, test } from "bun:test";
import { formatRelationshipTypeLabel } from "../src/relationship-type-label";

describe("formatRelationshipTypeLabel", () => {
  test("title-cases snake_case types", () => {
    expect(formatRelationshipTypeLabel("bible_passages")).toBe("Bible Passages");
    expect(formatRelationshipTypeLabel("is_a")).toBe("Is A");
  });
});
