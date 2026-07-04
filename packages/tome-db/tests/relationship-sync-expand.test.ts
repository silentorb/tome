import { describe, expect, test } from "bun:test";
import {
  expandAllRelationships,
  expandRelationshipEntry,
} from "../src/content/relationship-sync-expand";
import type { RelationshipEntry } from "../src/content/relationships-file";
import type { RelationshipTypesFile } from "../src/content/relationship-types-file";

const registry: RelationshipTypesFile = {
  version: 1,
  types: {
    member_of: { perspectives: ["member_of", "members"] },
    includes: { perspectives: ["includes", "includes"] },
    scenes_product: { perspectives: ["scenes", "product"] },
    parents_children: { perspectives: ["children", "parents"] },
  },
};

describe("expandRelationshipEntry", () => {
  test("member_of emits dual projections when set node is known", () => {
    const member = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const set = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
    const entry: RelationshipEntry = {
      a: member,
      b: set,
      type: "member_of",
      properties: { view: "All" },
    };
    const { projections } = expandRelationshipEntry(entry, registry);
    expect(projections).toHaveLength(2);
    expect(projections[0]).toMatchObject({
      sourceNodeId: member,
      targetNodeId: set,
      type: "member_of",
    });
    expect(projections[1]).toMatchObject({
      sourceNodeId: set,
      targetNodeId: member,
      type: "members",
    });
  });

  test("includes emits symmetric dual projections", () => {
    const a = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const b = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
    const entry: RelationshipEntry = { a, b, type: "includes", properties: {} };
    const { projections } = expandRelationshipEntry(entry, registry);
    expect(projections).toHaveLength(2);
    expect(projections.map((p) => p.type)).toEqual(["includes", "includes"]);
  });

  test("named composite emits distinct perspective types", () => {
    const scene = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const product = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
    const entry: RelationshipEntry = { a: scene, b: product, type: "scenes_product", properties: {} };
    const { projections } = expandRelationshipEntry(entry, registry);
    expect(projections).toHaveLength(2);
    expect(projections[0]?.type).toBe("scenes");
    expect(projections[1]?.type).toBe("product");
  });

  test("parents_children composite emits distinct child/parent projections", () => {
    const child = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const parent = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
    const entry: RelationshipEntry = {
      a: child,
      b: parent,
      type: "parents_children",
      properties: {},
    };
    const { projections } = expandRelationshipEntry(entry, registry);
    expect(projections).toHaveLength(2);
    expect(projections[0]).toMatchObject({
      sourceNodeId: child,
      targetNodeId: parent,
      type: "children",
    });
    expect(projections[1]).toMatchObject({
      sourceNodeId: parent,
      targetNodeId: child,
      type: "parents",
    });
  });

  test("member_of orientation follows tuple order, not node-id ordering", () => {
    // member id sorts AFTER set id — lexicographic order would invert membership.
    const set = "00000000000000000000000013";
    const member = "0000000000000000000000002C";
    const entry: RelationshipEntry = {
      a: member,
      b: set,
      type: "member_of",
      properties: {},
    };
    const { projections } = expandRelationshipEntry(entry, registry);
    expect(projections.some((p) => p.type === "member_of" && p.sourceNodeId === member && p.targetNodeId === set)).toBe(true);
    expect(projections.some((p) => p.type === "members" && p.sourceNodeId === set && p.targetNodeId === member)).toBe(true);
  });
});

describe("expandAllRelationships", () => {
  test("batch expansion preserves record count", () => {
    const entries: RelationshipEntry[] = [
      { a: "AAAAAAAAAAAAAAAAAAAAAAAAAA", b: "BBBBBBBBBBBBBBBBBBBBBBBBBB", type: "member_of" },
    ];
    const { records, projections } = expandAllRelationships(entries, registry);
    expect(records).toHaveLength(1);
    expect(projections).toHaveLength(2);
  });
});
