import { describe, expect, test } from "bun:test";
import { emptyAssociationsFile, projectionTypeForEndpoint } from "tome-flatfile";
import { isSetTraitProjectionType } from "tome-flatfile";

const MEMBER_OF = "000000000000000000000000A1";

describe("isSetTraitProjectionType", () => {
  test("recognizes projection types from set-trait registry entries", () => {
    const registry = emptyAssociationsFile();
    registry.associations[MEMBER_OF] = {
      perspectives: ["Members", "Membership"],
      traits: ["set"],
    };
    expect(isSetTraitProjectionType(registry, projectionTypeForEndpoint(MEMBER_OF, 1))).toBe(
      true,
    );
    expect(isSetTraitProjectionType(registry, MEMBER_OF)).toBe(true);
    expect(isSetTraitProjectionType(registry, "features")).toBe(false);
  });
});
