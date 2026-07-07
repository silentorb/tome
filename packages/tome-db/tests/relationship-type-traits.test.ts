import { describe, expect, test } from "bun:test";
import {
  childNodeId,
  parentNodeId,
  resolveSetTraitComposite,
  setRoleIndices,
  SET_TRAIT,
  typesWithTrait,
} from "../src/relationship-type-traits";
import type { RelationshipTypeDefinition } from "../src/content/relationship-types-file";
import { emptyRelationshipTypesFile } from "../src/content/relationship-types-file";

const setMemberOfDef: RelationshipTypeDefinition = {
  perspectives: ["members", "member_of"],
  traits: { set: true },
};

describe("relationship-type-traits set trait", () => {
  test("setRoleIndices defaults to parent@0 child@1 for flag trait", () => {
    expect(setRoleIndices(setMemberOfDef)).toEqual({ parentIndex: 0, childIndex: 1 });
  });

  test("setRoleIndices reads configured indices", () => {
    expect(
      setRoleIndices({
        perspectives: ["members", "member_of"],
        traits: { set: { parentIndex: 0, childIndex: 1 } },
      }),
    ).toEqual({ parentIndex: 0, childIndex: 1 });
  });

  test("parentNodeId and childNodeId read tuple endpoints", () => {
    const entry = { a: "set-id", b: "member-id", type: "member_of" };
    expect(parentNodeId(setMemberOfDef, entry)).toBe("set-id");
    expect(childNodeId(setMemberOfDef, entry)).toBe("member-id");
  });

  test("resolveSetTraitComposite finds composite by perspective", () => {
    const registry = emptyRelationshipTypesFile();
    registry.types.member_of = setMemberOfDef;
    expect(resolveSetTraitComposite(registry, "member_of")).toBe("member_of");
    expect(resolveSetTraitComposite(registry, "members")).toBe("member_of");
    expect(resolveSetTraitComposite(registry, "includes")).toBeNull();
  });

  test("typesWithTrait lists composites carrying a trait", () => {
    const registry = emptyRelationshipTypesFile();
    registry.types.member_of = setMemberOfDef;
    registry.types.includes = { perspectives: ["includes", "includes"] };
    expect(typesWithTrait(registry, SET_TRAIT)).toEqual(["member_of"]);
  });
});
