import { describe, expect, test } from "bun:test";
import { MEMBER_OF_TYPE, isTypeMembershipType } from "../src/labels";

describe("labels", () => {
  test("isTypeMembershipType recognizes member_of", () => {
    expect(isTypeMembershipType(MEMBER_OF_TYPE)).toBe(true);
    expect(isTypeMembershipType("in_database")).toBe(false);
    expect(isTypeMembershipType("features")).toBe(false);
  });
});
