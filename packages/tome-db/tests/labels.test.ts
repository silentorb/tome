import { describe, expect, test } from "bun:test";
import { emptyAssociationsFile } from "tome-flatfile";
import { isSetTraitPerspective } from "tome-flatfile";

describe("isSetTraitPerspective", () => {
  test("recognizes perspectives from set-trait registry entries", () => {
    const registry = emptyAssociationsFile();
    registry.associations["000000000000000000000000A1"] = {
      perspectives: ["members", "member_of"],
      traits: ["set"],
    };
    expect(isSetTraitPerspective(registry, "member_of")).toBe(true);
    expect(isSetTraitPerspective(registry, "features")).toBe(false);
  });
});
