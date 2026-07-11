import { describe, expect, test } from "bun:test";
import { emptyRelationshipTypesFile } from "tome-store-flatfile";
import { isSetTraitPerspective } from "tome-store-flatfile";

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
