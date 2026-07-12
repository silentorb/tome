import { describe, expect, test } from "bun:test";
import {
  expandAllRelationships,
  expandRelationshipEntry,
} from "../src/content/relationship-sync-expand";
import type { RelationshipEntry } from "tome-flatfile";
import { projectionTypeForEndpoint, type AssociationsFile } from "tome-flatfile";

const MEMBER_OF = "000000000000000000000000A1";
const INCLUDES = "000000000000000000000000B3";
const SCENES_PRODUCT = "000000000000000000000000A3";
const PARENTS_CHILDREN = "000000000000000000000000B1";

const registry: AssociationsFile = {
  version: 1,
  associations: {
    [MEMBER_OF]: { perspectives: ["Members", "Membership"], traits: ["set"] },
    [INCLUDES]: { perspectives: ["Includes", "Includes"] },
    [SCENES_PRODUCT]: { perspectives: ["Scenes", "Product"] },
    [PARENTS_CHILDREN]: { perspectives: ["Children", "Parents"] },
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
    const { projections } = expandRelationshipEntry(entry, registry);
    expect(projections).toHaveLength(2);
    expect(projections[0]).toMatchObject({
      sourceNodeId: set,
      targetNodeId: member,
      type: projectionTypeForEndpoint(MEMBER_OF, 0),
    });
    expect(projections[1]).toMatchObject({
      sourceNodeId: member,
      targetNodeId: set,
      type: projectionTypeForEndpoint(MEMBER_OF, 1),
    });
  });

  test("includes emits dual projections with same association endpoints", () => {
    const a = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const b = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
    const entry: RelationshipEntry = { a, b, type: INCLUDES, properties: {} };
    const { projections } = expandRelationshipEntry(entry, registry);
    expect(projections).toHaveLength(2);
    expect(projections.map((p) => p.type)).toEqual([
      projectionTypeForEndpoint(INCLUDES, 0),
      projectionTypeForEndpoint(INCLUDES, 1),
    ]);
  });

  test("named composite emits distinct projection types", () => {
    const scene = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const product = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
    const entry: RelationshipEntry = { a: scene, b: product, type: SCENES_PRODUCT, properties: {} };
    const { projections } = expandRelationshipEntry(entry, registry);
    expect(projections).toHaveLength(2);
    expect(projections[0]?.type).toBe(projectionTypeForEndpoint(SCENES_PRODUCT, 0));
    expect(projections[1]?.type).toBe(projectionTypeForEndpoint(SCENES_PRODUCT, 1));
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
    const { projections } = expandRelationshipEntry(entry, registry);
    expect(projections).toHaveLength(2);
    expect(projections[0]).toMatchObject({
      sourceNodeId: child,
      targetNodeId: parent,
      type: projectionTypeForEndpoint(PARENTS_CHILDREN, 0),
    });
    expect(projections[1]).toMatchObject({
      sourceNodeId: parent,
      targetNodeId: child,
      type: projectionTypeForEndpoint(PARENTS_CHILDREN, 1),
    });
  });
});

describe("expandAllRelationships", () => {
  test("batch expansion preserves record count", () => {
    const entries: RelationshipEntry[] = [
      { a: "BBBBBBBBBBBBBBBBBBBBBBBBBB", b: "AAAAAAAAAAAAAAAAAAAAAAAAAA", type: MEMBER_OF },
    ];
    const { records, projections } = expandAllRelationships(entries, registry);
    expect(records).toHaveLength(1);
    expect(projections).toHaveLength(2);
  });
});
