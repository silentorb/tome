import { describe, expect, test } from "bun:test";
import { MEMBER_OF_TYPE, isTypeMembershipType } from "../src/labels";
import { emptyRelationshipTypesFile } from "../src/content/relationship-types-file";
import { isSetTraitPerspective } from "../src/relationship-type-traits";

describe("labels", () => {
  test("isTypeMembershipType recognizes member_of", () => {
    expect(isTypeMembershipType(MEMBER_OF_TYPE)).toBe(true);
    expect(isTypeMembershipType("in_database")).toBe(false);
    expect(isTypeMembershipType("features")).toBe(false);
  });
});

describe("isSetTraitPerspective", () => {
  test("recognizes perspectives from set-trait registry entries", () => {
    const registry = emptyRelationshipTypesFile();
    registry.types.member_of = {
      perspectives: ["members", "member_of"],
      traits: ["set"],
    };
    expect(isSetTraitPerspective(registry, MEMBER_OF_TYPE)).toBe(true);
    expect(isSetTraitPerspective(registry, "features")).toBe(false);
  });
});
