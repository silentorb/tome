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
    is_a: { bidirectional: true, perspectives: ["is_a", "members"] },
    includes: { bidirectional: true, perspectives: ["includes", "includes"] },
    scenes_product: { bidirectional: true, perspectives: ["scenes", "product"] },
    children: { bidirectional: false, perspectives: ["children"] },
  },
};

describe("expandRelationshipEntry", () => {
  test("is_a emits dual projections when set node is known", () => {
    const member = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const set = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const entry: RelationshipEntry = {
      a: member,
      b: set,
      type: "is_a",
      properties: { view: "All" },
    };
    const { projections } = expandRelationshipEntry(entry, registry, {
      setNodeIds: new Set([set]),
    });
    expect(projections).toHaveLength(2);
    expect(projections[0]).toMatchObject({
      sourceNodeId: member,
      targetNodeId: set,
      type: "is_a",
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

  test("single-perspective type uses directedFrom when present", () => {
    const parent = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const child = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const entry: RelationshipEntry = {
      a: child,
      b: parent,
      type: "children",
      directedFrom: parent,
      properties: {},
    };
    const { projections } = expandRelationshipEntry(entry, registry);
    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({
      sourceNodeId: parent,
      targetNodeId: child,
      type: "children",
    });
  });

  test("legacy is_a with directedFrom still expands to dual projections", () => {
    const member = "c80ee480543c42eda65e330b6d1c6d9b";
    const set = "6f330e7947c94764a26456f93cfedaa4";
    const entry: RelationshipEntry = {
      a: member < set ? member : set,
      b: member < set ? set : member,
      type: "is_a",
      directedFrom: member,
      properties: {},
    };
    const { projections } = expandRelationshipEntry(entry, registry, {
      setNodeIds: new Set([set]),
    });
    expect(projections.some((p) => p.type === "is_a" && p.targetNodeId === set)).toBe(true);
    expect(projections.some((p) => p.type === "members" && p.sourceNodeId === set)).toBe(true);
  });
});

describe("expandAllRelationships", () => {
  test("batch expansion preserves record count", () => {
    const entries: RelationshipEntry[] = [
      { a: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", b: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", type: "is_a" },
    ];
    const { records, projections } = expandAllRelationships(entries, registry);
    expect(records).toHaveLength(1);
    expect(projections).toHaveLength(2);
  });
});
