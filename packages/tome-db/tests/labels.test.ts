import { describe, expect, test } from "bun:test";
import { IS_A_TYPE, isTypeMembershipType } from "../src/labels";

describe("labels", () => {
  test("isTypeMembershipType recognizes is_a", () => {
    expect(isTypeMembershipType(IS_A_TYPE)).toBe(true);
    expect(isTypeMembershipType("in_database")).toBe(false);
    expect(isTypeMembershipType("features")).toBe(false);
  });
});
