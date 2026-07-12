import { describe, expect, test } from "bun:test";
import {
  expandAllRelationships,
  expandRelationshipEntry,
} from "../src/content/relationship-sync-expand";
import type { RelationshipEntry } from "tome-flatfile";
import type { AssociationsFile } from "tome-flatfile";

const MEMBER_OF = "000000000000000000000000A1";
const INCLUDES = "000000000000000000000000B3";
const SCENES_PRODUCT = "000000000000000000000000A3";
const PARENTS_CHILDREN = "000000000000000000000000B1";

const legacyRegistry: AssociationsFile = {
  version: 1,
  associations: {
    [MEMBER_OF]: { perspectives: ["member_of", "members"], traits: ["set"] },
    [INCLUDES]: { perspectives: ["includes", "includes"] },
    [SCENES_PRODUCT]: { perspectives: ["scenes", "product"] },
    [PARENTS_CHILDREN]: { perspectives: ["children", "parents"] },
  },
};

const parentFirstRegistry: AssociationsFile = {
  version: 1,
  associations: {
    [MEMBER_OF]: { perspectives: ["members", "member_of"], traits: ["set"] },
    [INCLUDES]: { perspectives: ["includes", "includes"] },
    [SCENES_PRODUCT]: { perspectives: ["scenes", "product"] },
    [PARENTS_CHILDREN]: { perspectives: ["children", "parents"] },
  },
};

describe("expandRelationshipEntry", () => {
  test("member_of emits dual projections with parent-first tuple", () => {
    const member = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const set = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
    const entry: RelationshipEntry = {
      a: set,
      b: member,
      type: MEMBER_OF,
      properties: { view: "All" },
    };
    const { projections } = expandRelationshipEntry(entry, parentFirstRegistry);
    expect(projections).toHaveLength(2);
    expect(projections[0]).toMatchObject({
      sourceNodeId: set,
      targetNodeId: member,
      type: "members",
    });
    expect(projections[1]).toMatchObject({
      sourceNodeId: member,
      targetNodeId: set,
      type: "member_of",
    });
  });

  test("parent-first tuple+perspectives preserve member_of graph semantics", () => {
    const set = "00000000000000000000000013";
    const member = "0000000000000000000000002C";
    const legacyEntry: RelationshipEntry = { a: member, b: set, type: MEMBER_OF, properties: {} };
    const parentFirstEntry: RelationshipEntry = { a: set, b: member, type: MEMBER_OF, properties: {} };

    const legacy = expandRelationshipEntry(legacyEntry, legacyRegistry).projections;
    const parentFirst = expandRelationshipEntry(parentFirstEntry, parentFirstRegistry).projections;

    const key = (p: { sourceNodeId: string; targetNodeId: string; type: string }) =>
      `${p.sourceNodeId}:${p.type}:${p.targetNodeId}`;
    expect(new Set(parentFirst.map(key))).toEqual(new Set(legacy.map(key)));
  });

  test("includes emits symmetric dual projections", () => {
    const a = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const b = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
    const entry: RelationshipEntry = { a, b, type: INCLUDES, properties: {} };
    const { projections } = expandRelationshipEntry(entry, parentFirstRegistry);
    expect(projections).toHaveLength(2);
    expect(projections.map((p) => p.type)).toEqual(["includes", "includes"]);
  });

  test("named composite emits distinct perspective types", () => {
    const scene = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const product = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
    const entry: RelationshipEntry = { a: scene, b: product, type: SCENES_PRODUCT, properties: {} };
    const { projections } = expandRelationshipEntry(entry, parentFirstRegistry);
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
      type: PARENTS_CHILDREN,
      properties: {},
    };
    const { projections } = expandRelationshipEntry(entry, parentFirstRegistry);
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
});

describe("expandAllRelationships", () => {
  test("batch expansion preserves record count", () => {
    const entries: RelationshipEntry[] = [
      { a: "BBBBBBBBBBBBBBBBBBBBBBBBBB", b: "AAAAAAAAAAAAAAAAAAAAAAAAAA", type: MEMBER_OF },
    ];
    const { records, projections } = expandAllRelationships(entries, parentFirstRegistry);
    expect(records).toHaveLength(1);
    expect(projections).toHaveLength(2);
  });
});
