import { describe, expect, test } from "bun:test";
import { emptyRelationshipTypesFile } from "../src/content/relationship-types-file";
import { isSetTraitPerspective } from "../src/relationship-type-traits";

describe("isSetTraitPerspective", () => {
  test("recognizes perspectives from set-trait registry entries", () => {
    const registry = emptyRelationshipTypesFile();
    registry.types.member_of = {
      perspectives: ["members", "member_of"],
      traits: ["set"],
    };
    expect(isSetTraitPerspective(registry, "member_of")).toBe(true);
    expect(isSetTraitPerspective(registry, "features")).toBe(false);
  });
});
