import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRelationshipTypesFile } from "tome-flatfile";
import {
  ORDERED_TRAIT,
  SET_TRAIT,
  SYMMETRIC_TRAIT,
  compileAssociationConfig,
  endpointConstraintsFor,
  hasTrait,
  linkExistingFor,
  typesWithTrait,
} from "../src/index";

const MARLOTH_ASSOCIATIONS = join(
  import.meta.dir,
  "../../../../marloth-story/content/model/associations.json",
);

describe("Marloth AC → BR equivalence", () => {
  test("compiles Marloth associations when the corpus is mounted", () => {
    if (!existsSync(MARLOTH_ASSOCIATIONS)) {
      // Optional mount in some environments
      return;
    }
    const file = parseRelationshipTypesFile(readFileSync(MARLOTH_ASSOCIATIONS, "utf-8"));
    const runtime = compileAssociationConfig(file);

    expect(runtime.predicates.size).toBe(Object.keys(file.relationshipTypes).length);
    expect(runtime.patterns).toHaveLength(runtime.predicates.size);

    for (const [id, def] of Object.entries(file.relationshipTypes)) {
      const traits = def.traits ?? [];
      for (const entry of traits) {
        const key = typeof entry === "string" ? entry : entry.key;
        expect(hasTrait(runtime, { predicateId: id }, key)).toBe(true);
      }
      if (def.endpoints) {
        expect(endpointConstraintsFor(runtime, { predicateId: id })).toEqual(def.endpoints);
      } else {
        expect(endpointConstraintsFor(runtime, { predicateId: id })).toBeUndefined();
      }
      // linkExisting defaults / perspective overrides
      expect(typeof linkExistingFor(runtime, { predicateId: id, endpointIndex: 0 })).toBe(
        "boolean",
      );
    }

    const setIds = typesWithTrait(runtime, SET_TRAIT);
    expect(setIds.length).toBeGreaterThanOrEqual(1);
    for (const id of setIds) {
      expect(hasTrait(runtime, { predicateId: id }, SET_TRAIT)).toBe(true);
    }
    for (const id of typesWithTrait(runtime, ORDERED_TRAIT)) {
      expect(hasTrait(runtime, { predicateId: id }, ORDERED_TRAIT)).toBe(true);
      expect(hasTrait(runtime, { predicateId: id }, SET_TRAIT)).toBe(true);
    }
    for (const id of typesWithTrait(runtime, SYMMETRIC_TRAIT)) {
      expect(hasTrait(runtime, { predicateId: id }, SYMMETRIC_TRAIT)).toBe(true);
    }
  });
});
