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
    const member = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const set = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const entry: RelationshipEntry = {
      a: member,
      b: set,
      type: "member_of",
      properties: { view: "All" },
    };
    const { projections } = expandRelationshipEntry(entry, registry, {
      setNodeIds: new Set([set]),
    });
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
    const a = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const b = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const entry: RelationshipEntry = { a, b, type: "includes", properties: {} };
    const { projections } = expandRelationshipEntry(entry, registry);
    expect(projections).toHaveLength(2);
    expect(projections.map((p) => p.type)).toEqual(["includes", "includes"]);
  });

  test("named composite emits distinct perspective types", () => {
    const scene = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const product = "cccccccccccccccccccccccccccccccc";
    const entry: RelationshipEntry = { a: scene, b: product, type: "scenes_product", properties: {} };
    const { projections } = expandRelationshipEntry(entry, registry);
    expect(projections).toHaveLength(2);
    expect(projections[0]?.type).toBe("scenes");
    expect(projections[1]?.type).toBe("product");
  });

  test("parents_children composite emits distinct child/parent projections", () => {
    const child = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const parent = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
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

  test("legacy is_a with directedFrom still expands to dual projections", () => {
    const member = "c80ee480543c42eda65e330b6d1c6d9b";
    const set = "6f330e7947c94764a26456f93cfedaa4";
    const entry: RelationshipEntry = {
      a: member < set ? member : set,
      b: member < set ? set : member,
      type: "member_of",
      directedFrom: member,
      properties: {},
    };
    const { projections } = expandRelationshipEntry(entry, registry, {
      setNodeIds: new Set([set]),
    });
    expect(projections.some((p) => p.type === "member_of" && p.targetNodeId === set)).toBe(true);
    expect(projections.some((p) => p.type === "members" && p.sourceNodeId === set)).toBe(true);
  });
});

describe("expandAllRelationships", () => {
  test("batch expansion preserves record count", () => {
    const entries: RelationshipEntry[] = [
      { a: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", b: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", type: "member_of" },
    ];
    const { records, projections } = expandAllRelationships(entries, registry);
    expect(records).toHaveLength(1);
    expect(projections).toHaveLength(2);
  });
});
