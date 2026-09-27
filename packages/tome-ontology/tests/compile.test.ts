import { describe, expect, test } from "bun:test";
import type { RelationshipTypesFile } from "tome-graph-interfaces";
import {
  ORDERED_TRAIT,
  SET_TRAIT,
  SYMMETRIC_TRAIT,
  compileAssociationConfig,
  endpointConstraintsFor,
  hasTrait,
  isOrderedTraitPredicate,
  isSetTraitPredicate,
  isSymmetricPredicate,
  linkExistingFor,
  orderedPropertyNameFor,
  patternIdFromAssociationType,
  patternsMatching,
  setRoleIndicesFor,
  traitMapFor,
  typesWithTrait,
} from "../src/index";

const FIXTURE: RelationshipTypesFile = {
  version: 1,
  relationshipTypes: {
    SETPLAIN: {
      perspectives: [
        { title: "Members" },
        { title: "Membership", linkAdd: "Link type table" },
      ],
      traits: ["set"],
    },
    SETORDERED: {
      perspectives: ["Ordered members", "Ordered membership"],
      traits: ["ordered", "set"],
    },
    SYMM: {
      perspectives: ["Enemies", "Enemies"],
      traits: ["symmetric"],
    },
    WITH_ENDPOINTS: {
      perspectives: ["Left", "Right"],
      endpoints: {
        0: { typeId: "TYPEA" },
        1: { typeId: "TYPEB" },
      },
      linkExisting: false,
    },
    COMPLEX_PERSP: {
      perspectives: [
        { title: "From", linkExisting: true },
        { title: "To", linkExisting: false },
      ],
    },
  },
};

describe("compileAssociationConfig", () => {
  test("emits one predicate and one pattern per AC entry", () => {
    const runtime = compileAssociationConfig(FIXTURE);
    expect(runtime.predicates.size).toBe(5);
    expect(runtime.patterns).toHaveLength(5);
    for (const id of Object.keys(FIXTURE.relationshipTypes)) {
      expect(runtime.predicates.get(id)?.perspectives).toEqual(
        FIXTURE.relationshipTypes[id]!.perspectives,
      );
      const pattern = runtime.patterns.find((p) => p.match.predicateId === id);
      expect(pattern?.id).toBe(patternIdFromAssociationType(id));
      expect(pattern?.traits).toEqual(FIXTURE.relationshipTypes[id]!.traits ?? []);
    }
  });

  test("traits attach to patterns, not predicates", () => {
    const runtime = compileAssociationConfig(FIXTURE);
    const predicate = runtime.predicates.get("SETPLAIN");
    expect(predicate).toBeDefined();
    expect("traits" in (predicate as object)).toBe(false);
    const pattern = patternsMatching(runtime, { predicateId: "SETPLAIN" })[0]!;
    expect(pattern.traits).toContain("set");
  });

  test("set / ordered / symmetric classification matches AC traits", () => {
    const runtime = compileAssociationConfig(FIXTURE);
    expect(isSetTraitPredicate(runtime, "SETPLAIN")).toBe(true);
    expect(isOrderedTraitPredicate(runtime, "SETPLAIN")).toBe(false);
    expect(isSetTraitPredicate(runtime, "SETORDERED")).toBe(true);
    expect(isOrderedTraitPredicate(runtime, "SETORDERED")).toBe(true);
    expect(isSymmetricPredicate(runtime, "SYMM")).toBe(true);
    expect(typesWithTrait(runtime, SET_TRAIT).sort()).toEqual(["SETORDERED", "SETPLAIN"]);
    expect(typesWithTrait(runtime, ORDERED_TRAIT)).toEqual(["SETORDERED"]);
    expect(typesWithTrait(runtime, SYMMETRIC_TRAIT)).toEqual(["SYMM"]);
  });

  test("endpoint constraints and linkExisting come from patterns", () => {
    const runtime = compileAssociationConfig(FIXTURE);
    expect(endpointConstraintsFor(runtime, { predicateId: "WITH_ENDPOINTS" })).toEqual({
      0: { typeId: "TYPEA" },
      1: { typeId: "TYPEB" },
    });
    expect(linkExistingFor(runtime, { predicateId: "WITH_ENDPOINTS", endpointIndex: 0 })).toBe(
      false,
    );
    expect(linkExistingFor(runtime, { predicateId: "COMPLEX_PERSP", endpointIndex: 0 })).toBe(
      true,
    );
    expect(linkExistingFor(runtime, { predicateId: "COMPLEX_PERSP", endpointIndex: 1 })).toBe(
      false,
    );
    // Default when unset
    expect(linkExistingFor(runtime, { predicateId: "SETPLAIN", endpointIndex: 0 })).toBe(true);
  });

  test("set role indices default to parent 0 / child 1", () => {
    const runtime = compileAssociationConfig(FIXTURE);
    expect(setRoleIndicesFor(runtime, "SETPLAIN")).toEqual({
      parentIndex: 0,
      childIndex: 1,
    });
    expect(orderedPropertyNameFor(runtime, "SETORDERED")).toBe("order");
  });

  test("traitMapFor merges matching pattern traits", () => {
    const runtime = compileAssociationConfig(FIXTURE);
    const map = traitMapFor(runtime, { predicateId: "SETORDERED" });
    expect(map.get("set")).toBe(true);
    expect(map.get("ordered")).toBe(true);
    expect(hasTrait(runtime, { predicateId: "SETORDERED" }, "set")).toBe(true);
  });
});
