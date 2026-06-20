import { describe, expect, test, afterAll } from "bun:test";
import { archiveNode, unarchiveNode } from "../src/node-lifecycle";
import { IS_A_TYPE } from "../src/labels";
import { isArchiveMembershipEntry } from "../src/relationship-archive";
import { getDatabaseViewDetail } from "../src/database-view";
import { getNodeDetail } from "../src/queries";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestIncludes,
  seedTestNode,
  seedTestRelationships,
  seedTestTableSchema,
  TEST_ARCHIVE_NODE_ID,
  TEST_HOME_NODE_ID,
} from "../src/content/test-helpers";

const HUB = TEST_ARCHIVE_NODE_ID;
const HOME = TEST_HOME_NODE_ID;
const TYPE_DB = "dddddddddddddddddddddddddddddddd";
const PAGE = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const OTHER = "ffffffffffffffffffffffffffffffff";

describe("archive relationship flags", () => {
  const fixture = createTestContentFixture("tome-lifecycle-archive-");

  seedTestNode(fixture, { id: HOME, properties: { title: "Home" } });
  seedTestNode(fixture, { id: HUB, properties: { title: "Archive" } });
  seedTestNode(fixture, { id: TYPE_DB, properties: typeTableMarkerProperties("Features") });
  seedTestTableSchema(fixture, TYPE_DB, [{ key: "priority", name: "Priority", type: "text" }]);
  seedTestNode(fixture, { id: PAGE, properties: { title: "Draft Feature" } });
  seedTestNode(fixture, { id: OTHER, properties: { title: "Linked Scene" } });

  seedTestRelationships(fixture, [
    {
      source: PAGE,
      target: TYPE_DB,
      type: IS_A_TYPE,
      properties: { view: "all", row_index: 0 },
    },
  ]);
  seedTestIncludes(fixture, [{ a: PAGE, b: OTHER }]);

  test("archiveNode marks incident relationships archived in JSON", () => {
    expect(archiveNode(fixture.ctx, PAGE)).toBeNull();

    const file = fixture.ctx.store.readRelationshipsFile();
    const membership = file.relationships.find(
      (e) => e.type === "includes" && (e.a === HUB || e.b === HUB) && (e.a === PAGE || e.b === PAGE),
    );
    expect(membership?.archived).toBeUndefined();

    const incident = file.relationships.filter(
      (e) => !isArchiveMembershipEntry(e, HUB) && (e.a === PAGE || e.b === PAGE),
    );
    expect(incident.length).toBeGreaterThanOrEqual(2);
    for (const entry of incident) {
      expect(entry.archived).toBe(true);
    }
  });

  test("archived incident relationships are excluded from SQLite cache", () => {
    const outgoing = fixture.ctx.db.listRelationshipsFromSource(PAGE);
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]?.targetNodeId).toBe(HUB);
    expect(outgoing[0]?.type).toBe("includes");
    expect(fixture.ctx.db.listRelationshipsFromSource(PAGE, IS_A_TYPE)).toHaveLength(0);
    expect(fixture.ctx.db.listRelationshipsFromSource(HUB, "includes").length).toBeGreaterThan(0);
  });

  test("archived member is absent from database table rows", () => {
    const detail = getDatabaseViewDetail(fixture.ctx.db, TYPE_DB, "all", fixture.ctx.store.contentDir);
    expect(detail?.rows.some((row) => row.nodeId === PAGE)).toBe(false);
  });

  test("unarchiveNode restores relationships and archived status", () => {
    expect(unarchiveNode(fixture.ctx, PAGE)).toBeNull();
    expect(getNodeDetail(fixture.ctx.db, PAGE)?.archived).toBe(false);

    const file = fixture.ctx.store.readRelationshipsFile();
    for (const entry of file.relationships) {
      if (entry.a === HUB || entry.b === HUB) continue;
      if (entry.a === PAGE || entry.b === PAGE) {
        expect(entry.archived).toBeUndefined();
      }
    }

    expect(fixture.ctx.db.listRelationshipsFromSource(PAGE, IS_A_TYPE)).toHaveLength(1);
    expect(fixture.ctx.db.listRelationshipsFromSource(PAGE, "includes")).toHaveLength(1);
    const detail = getDatabaseViewDetail(fixture.ctx.db, TYPE_DB, "all", fixture.ctx.store.contentDir);
    expect(detail?.rows.some((row) => row.nodeId === PAGE)).toBe(true);
  });

  test("unarchiveNode rejects non-archived page", () => {
    expect(unarchiveNode(fixture.ctx, PAGE)).toBe("not_archived");
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
