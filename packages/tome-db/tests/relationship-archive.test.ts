import { describe, expect, test, afterAll } from "bun:test";
import {
  filterEntriesForCacheSync,
  isArchiveSetEntry,
  listArchiveMemberIds,
  markIncidentRelationshipsArchived,
  unmarkIncidentRelationshipsArchived,
} from "../src/relationship-archive";
import type { RelationshipEntry } from "tome-flatfile";
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
        [MEMBER_OF]: { perspectives: ["members", "member_of"], traits: ["set"] },
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
        [MEMBER_OF]: { perspectives: ["members", "member_of"], traits: ["set"] },
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

  test("filterEntriesForCacheSync drops archived entries", () => {
    const filtered = filterEntriesForCacheSync([
      entry(NODE_A, NODE_B, INCLUDES),
      entry(NODE_A, NODE_C, MEMBER_OF, { archived: true }),
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.b).toBe(NODE_B);
  });
});

describe("relationship-archive store mutations", () => {
  const fixture: TestContentFixture = createTestContentFixture("tome-rel-archive-");
  const { store } = fixture.ctx;

  store.writeAssociationsFile({
    version: 1,
    associations: {
      [MEMBER_OF]: { perspectives: ["members", "member_of"], traits: ["set"] },
      [INCLUDES]: { perspectives: ["includes", "includes"] },
    },
  });

  test("markIncidentRelationshipsArchived flags incident edges but not hub membership", () => {
    store.writeRelationshipsFile({
      version: 3,
      relationships: [
        entry(NODE_A, NODE_B, INCLUDES),
        entry(HUB, NODE_A, MEMBER_OF),
        entry(NODE_A, NODE_C, MEMBER_OF),
      ],
    });

    const changed = markIncidentRelationshipsArchived(store, NODE_A, HUB);
    expect(changed).toBe(2);

    const file = store.readRelationshipsFile();
    const byPair = new Map(file.relationships.map((e) => [`${e.a}:${e.b}:${e.type}`, e]));
    expect(byPair.get(`${NODE_A}:${NODE_B}:${INCLUDES}`)?.archived).toBe(true);
    expect(byPair.get(`${HUB}:${NODE_A}:${MEMBER_OF}`)?.archived).toBeUndefined();
    expect(byPair.get(`${NODE_A}:${NODE_C}:${MEMBER_OF}`)?.archived).toBe(true);
  });

  test("unmarkIncidentRelationshipsArchived keeps shared edge when other endpoint still archived", () => {
    store.writeRelationshipsFile({
      version: 3,
      relationships: [
        entry(NODE_A, NODE_B, INCLUDES, { archived: true }),
        entry(HUB, NODE_B, MEMBER_OF),
      ],
    });

    const stillArchived = new Set([NODE_B]);
    const changed = unmarkIncidentRelationshipsArchived(store, NODE_A, stillArchived, HUB);
    expect(changed).toBe(0);
    expect(store.readRelationshipsFile().relationships[0]?.archived).toBe(true);
  });

  test("unmarkIncidentRelationshipsArchived clears flags when other endpoint is active", () => {
    store.writeRelationshipsFile({
      version: 3,
      relationships: [
        entry(NODE_A, NODE_B, INCLUDES, { archived: true }),
        entry(NODE_A, NODE_C, MEMBER_OF, { archived: true }),
      ],
    });

    const changed = unmarkIncidentRelationshipsArchived(store, NODE_A, new Set(), HUB);
    expect(changed).toBe(2);
    for (const rel of store.readRelationshipsFile().relationships) {
      expect(rel.archived).toBeUndefined();
    }
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
