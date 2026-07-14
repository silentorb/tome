import { describe, expect, test, afterAll } from "bun:test";
import {
  isArchiveSetEntry,
  listArchiveMemberIds,
  markIncidentRelationshipsArchived,
  unmarkIncidentRelationshipsArchived,
} from "../src/relationship-archive";
import type { RelationshipEntry } from "tome-flatfile";
import { RELATIONSHIPS_FILE_VERSION } from "tome-flatfile";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  TEST_ARCHIVE_NODE_ID,
  TEST_INCLUDES_ASSOCIATION_ID,
  TEST_MEMBER_OF_ASSOCIATION_ID,
  type TestContentFixture,
} from "../src/content/test-helpers";

const HUB = TEST_ARCHIVE_NODE_ID;
const NODE_A = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const NODE_B = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
const NODE_C = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
const MEMBER_OF = TEST_MEMBER_OF_ASSOCIATION_ID;
const INCLUDES = TEST_INCLUDES_ASSOCIATION_ID;

function entry(
  a: string,
  b: string,
  type: string,
  extra: Partial<RelationshipEntry> = {},
): RelationshipEntry {
  return { a, b, type, ...extra };
}

describe("relationship-archive helpers", () => {
  const fixture = createTestContentFixture("tome-rel-archive-helpers-");
  const contentDir = fixture.ctx.store.contentDir;

  afterAll(() => destroyTestContentFixture(fixture));

  test("isArchiveSetEntry detects hub membership", () => {
    fixture.ctx.store.writeAssociationsFile({
      version: 1,
      associations: {
        [MEMBER_OF]: { perspectives: ["Members", "Membership"], traits: ["set"] },
      },
    });
    expect(isArchiveSetEntry(entry(HUB, NODE_A, MEMBER_OF), HUB, contentDir)).toBe(true);
    expect(isArchiveSetEntry(entry(NODE_A, NODE_B, INCLUDES), HUB, contentDir)).toBe(false);
    expect(isArchiveSetEntry(entry(NODE_A, NODE_B, MEMBER_OF), HUB, contentDir)).toBe(false);
  });

  test("listArchiveMemberIds returns non-hub endpoints", () => {
    fixture.ctx.store.writeAssociationsFile({
      version: 1,
      associations: {
        [MEMBER_OF]: { perspectives: ["Members", "Membership"], traits: ["set"] },
      },
    });
    const ids = listArchiveMemberIds(
      [
        entry(HUB, NODE_A, MEMBER_OF),
        entry(HUB, NODE_B, MEMBER_OF),
        entry(NODE_A, NODE_C, INCLUDES),
      ],
      HUB,
      contentDir,
    );
    expect(ids.sort()).toEqual([NODE_A, NODE_B].sort());
  });
});

describe("relationship-archive store mutations", () => {
  const fixture: TestContentFixture = createTestContentFixture("tome-rel-archive-");
  const { store } = fixture.ctx;

  store.writeAssociationsFile({
    version: 1,
    associations: {
      [MEMBER_OF]: { perspectives: ["Members", "Membership"], traits: ["set"] },
      [INCLUDES]: { perspectives: ["Includes", "Includes"] },
    },
  });

  test("markIncidentRelationshipsArchived moves incident edges but not hub membership", () => {
    store.writeRelationshipsFile({
      version: RELATIONSHIPS_FILE_VERSION,
      relationships: [
        entry(NODE_A, NODE_B, INCLUDES),
        entry(HUB, NODE_A, MEMBER_OF),
        entry(NODE_A, NODE_C, MEMBER_OF),
      ],
    });

    const changed = markIncidentRelationshipsArchived(store, NODE_A, HUB);
    expect(changed).toBe(2);

    const live = store.readRelationshipsFile().relationships;
    const archived = store.readArchivedRelationships();
    expect(live).toHaveLength(1);
    expect(live[0]?.a).toBe(HUB);
    expect(live[0]?.b).toBe(NODE_A);
    expect(archived).toHaveLength(2);
    expect(store.isRelationshipArchived(NODE_A, NODE_B, INCLUDES)).toBe(true);
    expect(store.isRelationshipArchived(NODE_A, NODE_C, MEMBER_OF)).toBe(true);
    expect(store.isRelationshipArchived(HUB, NODE_A, MEMBER_OF)).toBe(false);
  });

  test("unmarkIncidentRelationshipsArchived keeps shared edge when other endpoint still archived", () => {
    store.writeRelationshipsFile(
      { version: RELATIONSHIPS_FILE_VERSION, relationships: [entry(HUB, NODE_B, MEMBER_OF)] },
      { archivedEntries: [entry(NODE_A, NODE_B, INCLUDES)] },
    );

    const stillArchived = new Set([NODE_B]);
    const changed = unmarkIncidentRelationshipsArchived(store, NODE_A, stillArchived, HUB);
    expect(changed).toBe(0);
    expect(store.isRelationshipArchived(NODE_A, NODE_B, INCLUDES)).toBe(true);
  });

  test("unmarkIncidentRelationshipsArchived restores edges when other endpoint is active", () => {
    store.writeRelationshipsFile(
      { version: RELATIONSHIPS_FILE_VERSION, relationships: [] },
      {
        archivedEntries: [
          entry(NODE_A, NODE_B, INCLUDES),
          entry(NODE_A, NODE_C, MEMBER_OF),
        ],
      },
    );

    const changed = unmarkIncidentRelationshipsArchived(store, NODE_A, new Set(), HUB);
    expect(changed).toBe(2);
    expect(store.readArchivedRelationships()).toHaveLength(0);
    expect(store.readRelationshipsFile().relationships).toHaveLength(2);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
