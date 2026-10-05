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
import { predicateScopedMemberIds } from "../src/predicate-membership";

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

describe("predicate-scoped type table membership", () => {
  let fixture: TestContentFixture;

  afterAll(async () => {
    if (fixture) await destroyTestContentFixture(fixture);
  });

  test(
    "hub Members, typeIds, and Properties follow hosts_projection member-scope",
    async () => {
    fixture = await createTestContentFixture("tome-member-scope-");
    const contentDir = fixture.ctx.store.contentDir;
    const store = fixture.ctx.graphStore;

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
    await seedTestNode(
      fixture,
      { id: PRED, properties: { title: "Inspiration" } },
      `${serializePageBlock("node-filter", hostsProjectionFilterGraph(INSPIRES, 0), "predicate")}\n`,
    );
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

    const members = await predicateScopedMemberIds(store, HUB, contentDir);
    expect(members?.sort()).toEqual([INSP_A]);

    const view = await getDatabaseViewDetail(store, HUB, undefined, contentDir);
    expect(view?.rows.map((r) => r.nodeId)).toEqual([INSP_A]);
    expect(view?.rows[0]?.cells.wonder).toBe("3");

    expect(await typeIdsForInstance(store, INSP_A, contentDir)).toContain(HUB);
    // INSP_B has set membership but does not inspire — predicate scope excludes it from type ids
    // unless set membership alone still counts. typeIdsForInstance merges set + predicate.
    const typesB = await typeIdsForInstance(store, INSP_B, contentDir);
    expect(typesB).toContain(HUB); // still a set member
    // Hub listing is predicate-only:
    expect(view?.rows.some((r) => r.nodeId === INSP_B)).toBe(false);

    const props = await buildPropertiesSection(store, INSP_A, contentDir);
    expect(props?.databaseId).toBe(HUB);
  },
    30_000,
  );
});
