import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { serializePageBlock } from "tome-interfaces/page-block";
import { hostsProjectionFilterGraph } from "tome-ontology";
import {
  invalidateOntologyCache,
  invalidateRelationshipTypesCache,
  invalidateTableSchemasCache,
  ontologyFilePath,
  parseRelationshipTypesFile,
  relationshipTypesFilePath,
  serializeOntologyFile,
  serializeRelationshipTypesFile,
  serializeTableSchemasFile,
  tableSchemasFilePath,
} from "tome-flatfile";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
  TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
  type TestContentFixture,
} from "../src/content/test-helpers";
import { getDatabaseViewDetail } from "../src/database-view";
import { buildPropertiesSection } from "../src/node-type-properties";
import { typeIdsForInstance } from "../src/node-capabilities";
import { createNode } from "../src/node-create";
import {
  UnevaluableMemberScopeError,
  isMemberOfTypeTable,
  predicateScopedMemberIds,
} from "../src/predicate-membership";
import { removeDatabaseMember } from "../src/relationship-link-mutations";
import { updateDatabaseRowProperty } from "../src/relationship-property-update";
import { findSetEdge } from "../src/set-membership";

const SET = TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID;
const INSPIRES = "01M4539SDZBJYGAE103DF6J7RH";
const HUB = "01M4539SDZ4Y1TSVJWEW51J774";
const ONTOLOGY_TYPE = "01M4539SDZ7A4P0FX3CHDTFCYN";
const PREDICATE_TYPE = "01M4539SE0QD0AY0X3MJJEKD2E";
const MEMBER_SCOPE_TYPE = "01M4539SE09RFFJS62JXGDZEPK";
const ONTOLOGY_INST = "01M4539SE0Y21VB5X49S62VZQZ";
const PRED = "01M4539SE0HMHYEP0CMVX8WWTQ";
const SCOPE = "01M4539SE06YM3QQH3A99DH0SY";
const INSP_A = "01M4539SE0N91JMGMJW2VGE53T";
const INSP_B = "01M4539SE0RJG9NPCAFE7HXPE5";
const FEATURE = "01M4539SE0J97VZKF5BS4KTP1X";

async function seedScopedInspirationFixture(
  fixture: TestContentFixture,
  options?: { predicateFence?: "canonical" | "role-only" | "missing" },
): Promise<string> {
  const contentDir = fixture.ctx.store.contentDir;
  const fenceMode = options?.predicateFence ?? "canonical";

  const registry = parseRelationshipTypesFile(
    readFileSync(relationshipTypesFilePath(contentDir), "utf-8"),
  );
  registry.relationshipTypes[INSPIRES] = {
    perspectives: ["Inspires", "Inspired by"],
    endpoints: {
      0: { typeId: HUB },
      1: {},
    },
  };
  writeFileSync(
    relationshipTypesFilePath(contentDir),
    serializeRelationshipTypesFile(registry),
  );
  invalidateRelationshipTypesCache();

  writeFileSync(
    ontologyFilePath(contentDir),
    serializeOntologyFile({
      version: 1,
      types: {
        ontology: ONTOLOGY_TYPE,
        predicate: PREDICATE_TYPE,
        memberScope: MEMBER_SCOPE_TYPE,
      },
    }),
  );
  invalidateOntologyCache();

  writeFileSync(
    tableSchemasFilePath(contentDir),
    serializeTableSchemasFile({
      version: 1,
      tables: {
        [HUB]: {
          columns: [
            {
              key: "features",
              name: "Features",
              type: "relation",
              association: INSPIRES,
              endpoint: 0,
            },
            {
              key: "wonder",
              name: "Wonder",
              type: "number",
            },
          ],
        },
      },
    }),
  );
  invalidateTableSchemasCache();

  await seedTestNode(fixture, { id: HUB, properties: { title: "Inspirations" } });
  await seedTestNode(fixture, { id: ONTOLOGY_TYPE, properties: { title: "Ontology" } });
  await seedTestNode(fixture, { id: PREDICATE_TYPE, properties: { title: "Predicate" } });
  await seedTestNode(fixture, { id: MEMBER_SCOPE_TYPE, properties: { title: "Member scope" } });
  await seedTestNode(fixture, { id: ONTOLOGY_INST, properties: { title: "Demo ontology" } });

  let predicateBody = "";
  if (fenceMode === "canonical") {
    predicateBody = `${serializePageBlock("node-filter", hostsProjectionFilterGraph(INSPIRES, 0), "predicate")}\n`;
  } else if (fenceMode === "role-only") {
    predicateBody = `${serializePageBlock("node-filter", hostsProjectionFilterGraph(INSPIRES, 0))}\n`;
  }

  await seedTestNode(fixture, { id: PRED, properties: { title: "Inspiration" } }, predicateBody);
  await seedTestNode(
    fixture,
    { id: SCOPE, properties: { title: "Inspirations member scope" } },
    `${serializePageBlock("member-scope", { typeTableId: HUB, predicateId: PRED }, "memberScope")}\n`,
  );
  await seedTestNode(fixture, { id: INSP_A, properties: { title: "Work A" } });
  await seedTestNode(fixture, { id: INSP_B, properties: { title: "Work B (no inspires)" } });
  await seedTestNode(fixture, { id: FEATURE, properties: { title: "Feature X" } });

  await seedTestRelationships(fixture, [
    { source: ONTOLOGY_INST, target: ONTOLOGY_TYPE, type: SET },
    { source: PRED, target: PREDICATE_TYPE, type: SET },
    { source: SCOPE, target: MEMBER_SCOPE_TYPE, type: SET },
    { source: PRED, target: ONTOLOGY_INST, type: SET },
    { source: SCOPE, target: ONTOLOGY_INST, type: SET },
    { source: INSP_A, target: HUB, type: SET, properties: { wonder: "3" } },
    { source: INSP_B, target: HUB, type: SET },
    { source: INSP_A, target: FEATURE, type: INSPIRES },
  ]);

  invalidateRelationshipTypesCache();
  invalidateOntologyCache();
  return contentDir;
}

describe("predicate-scoped type table membership", () => {
  let fixture: TestContentFixture;

  afterAll(async () => {
    if (fixture) await destroyTestContentFixture(fixture);
  });

  test(
    "hub Members, typeIds, and Properties follow hosts_projection member-scope",
    async () => {
      fixture = await createTestContentFixture("tome-member-scope-");
      const contentDir = await seedScopedInspirationFixture(fixture);
      const store = fixture.ctx.graphStore;

      const members = await predicateScopedMemberIds(store, HUB, contentDir);
      expect(members?.sort()).toEqual([INSP_A]);

      const view = await getDatabaseViewDetail(store, HUB, undefined, contentDir);
      expect(view?.rows.map((r) => r.nodeId)).toEqual([INSP_A]);
      expect(view?.rows[0]?.cells.wonder).toBe("3");
      expect(view?.predicateMembership?.relationshipTypeId).toBe(INSPIRES);
      expect(view?.predicateMembership?.projectionType).toBe(`${INSPIRES}:0`);

      expect(await typeIdsForInstance(store, INSP_A, contentDir)).toContain(HUB);
      // Set-only orphan is not typed as Inspiration once membership ≡ predicate.
      expect(await typeIdsForInstance(store, INSP_B, contentDir)).not.toContain(HUB);
      expect(await isMemberOfTypeTable(store, INSP_A, HUB, contentDir)).toBe(true);
      expect(await isMemberOfTypeTable(store, INSP_B, HUB, contentDir)).toBe(false);
      expect(view?.rows.some((r) => r.nodeId === INSP_B)).toBe(false);

      const props = await buildPropertiesSection(store, INSP_A, contentDir);
      expect(props?.databaseId).toBe(HUB);
    },
    30_000,
  );

  test(
    "role-only node-filter fence still loads via discovery resilience",
    async () => {
      fixture = await createTestContentFixture("tome-member-scope-role-only-");
      const contentDir = await seedScopedInspirationFixture(fixture, {
        predicateFence: "role-only",
      });
      const store = fixture.ctx.graphStore;
      const members = await predicateScopedMemberIds(store, HUB, contentDir);
      expect(members?.sort()).toEqual([INSP_A]);
    },
    30_000,
  );

  test(
    "unevaluable member-scope throws instead of empty success",
    async () => {
      fixture = await createTestContentFixture("tome-member-scope-unevaluable-");
      const contentDir = await seedScopedInspirationFixture(fixture, {
        predicateFence: "missing",
      });
      const store = fixture.ctx.graphStore;
      await expect(predicateScopedMemberIds(store, HUB, contentDir)).rejects.toBeInstanceOf(
        UnevaluableMemberScopeError,
      );
      await expect(getDatabaseViewDetail(store, HUB, undefined, contentDir)).rejects.toBeInstanceOf(
        UnevaluableMemberScopeError,
      );
    },
    30_000,
  );

  test(
    "create-row requires membership relation and remove breaks predicate",
    async () => {
      fixture = await createTestContentFixture("tome-member-scope-create-");
      const contentDir = await seedScopedInspirationFixture(fixture);
      const ctx = fixture.ctx;

      const rejected = await createNode(ctx, {
        title: "Ghost Inspiration",
        link: { kind: "database-row", databaseId: HUB },
      });
      expect(rejected).toBe("membership_relation_required");

      const created = await createNode(ctx, {
        title: "New Inspiration",
        link: {
          kind: "database-row",
          databaseId: HUB,
          relations: [{ type: `${INSPIRES}:0`, targetId: FEATURE }],
        },
      });
      expect(typeof created).toBe("object");
      if (typeof created === "string") throw new Error(created);
      const newId = created.id;

      expect(await isMemberOfTypeTable(ctx.graphStore, newId, HUB, contentDir)).toBe(true);
      expect(await typeIdsForInstance(ctx.graphStore, newId, contentDir)).toContain(HUB);
      // No set carrier until a scalar is written.
      expect(await findSetEdge(ctx.graphStore, newId, HUB, contentDir)).toBeNull();

      const propError = await updateDatabaseRowProperty(ctx, HUB, newId, "wonder", "9");
      expect(propError).toBeNull();
      expect(await findSetEdge(ctx.graphStore, newId, HUB, contentDir)).not.toBeNull();

      const removeError = await removeDatabaseMember(ctx, HUB, newId);
      expect(removeError).toBeNull();
      expect(await isMemberOfTypeTable(ctx.graphStore, newId, HUB, contentDir)).toBe(false);
      expect(await typeIdsForInstance(ctx.graphStore, newId, contentDir)).not.toContain(HUB);
    },
    30_000,
  );
});
