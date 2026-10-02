import { describe, expect, test, afterAll } from "bun:test";
import { archiveNode, unarchiveNode } from "../src/node-lifecycle";
import { isArchiveSetEntry } from "../src/relationship-archive";
import { getDatabaseViewDetail } from "../src/database-view";
import { getNodeDetail } from "../src/queries";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { createTestContentFixture, destroyTestContentFixture, seedTestIncludes, seedTestNode, seedTestRelationships, seedTestTableSchema, TEST_ARCHIVE_NODE_ID, TEST_HOME_NODE_ID, projectionTypeForEndpoint, TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, TEST_RELATED_ASSOCIATION_ID } from "../src/content/test-helpers";

const HUB = TEST_ARCHIVE_NODE_ID;
const HOME = TEST_HOME_NODE_ID;
const TYPE_DB = "DDDDDDDDDDDDDDDDDDDDDDDDDD";
const PAGE = "EEEEEEEEEEEEEEEEEEEEEEEEEE";
const OTHER = "FFFFFFFFFFFFFFFFFFFFFFFFFF";

describe("archive relationship flags", async () => {
  const fixture = await createTestContentFixture("tome-lifecycle-archive-");

  await seedTestNode(fixture, { id: HOME, properties: { title: "Home" } });
  await seedTestNode(fixture, { id: HUB, properties: { title: "Archive" } });
  await seedTestNode(fixture, { id: TYPE_DB, properties: typeTableMarkerProperties("Features") });
  seedTestTableSchema(fixture, TYPE_DB, [{ key: "priority", name: "Priority", type: "text" }]);
  await seedTestNode(fixture, { id: PAGE, properties: { title: "Draft Feature" } });
  await seedTestNode(fixture, { id: OTHER, properties: { title: "Linked Scene" } });

  await seedTestRelationships(fixture, [
    {
      source: PAGE,
      target: TYPE_DB,
      type: "member_of",
      properties: { row_index: 0 },
    },
  ]);
  await seedTestIncludes(fixture, [{ a: PAGE, b: OTHER, compositeType: "000000000000000000000000BF" }]);

  test("archiveNode moves incident relationships and the node file into archive trees", async () => {
    expect(await archiveNode(fixture.ctx, PAGE)).toBeNull();

    expect(await fixture.ctx.store.isNodeFileArchived(PAGE)).toBe(true);

    const live = fixture.ctx.store.readRelationshipsFile().relationships;
    const membership = live.find(
      (e) => e.type === TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID && (e.a === HUB || e.b === HUB) && (e.a === PAGE || e.b === PAGE),
    );
    expect(membership).toBeDefined();
    expect(fixture.ctx.store.isRelationshipArchived(membership!.a, membership!.b, membership!.type)).toBe(
      false,
    );

    const archived = fixture.ctx.store.readArchivedRelationships().filter(
      (e) => !isArchiveSetEntry(e, HUB, fixture.ctx.store.contentDir) && (e.a === PAGE || e.b === PAGE),
    );
    expect(archived.length).toBeGreaterThanOrEqual(2);
  });

  test("archived incident relationships are excluded from SQLite cache", async () => {
    const outgoing = await fixture.ctx.cache.listRelationshipsFromSource(PAGE);
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]?.targetNodeId).toBe(HUB);
    expect(outgoing[0]?.type).toBe(projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1));
    expect(await fixture.ctx.cache.listRelationshipsFromSource(PAGE, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1))).toHaveLength(1);
    expect((await fixture.ctx.cache.listRelationshipsFromSource(HUB, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 0))).length).toBeGreaterThan(0);
  });

  test("archived member is absent from database table rows", async () => {
    const detail = await getDatabaseViewDetail(fixture.ctx.cache, TYPE_DB, "all", fixture.ctx.store.contentDir);
    expect(detail?.rows.some((row) => row.nodeId === PAGE)).toBe(false);
  });

  test("unarchiveNode restores relationships and archived status", async () => {
    expect(await unarchiveNode(fixture.ctx, PAGE)).toBeNull();
    expect((await getNodeDetail(fixture.ctx.cache, PAGE))?.archived).toBe(false);
    expect(await fixture.ctx.store.isNodeFileArchived(PAGE)).toBe(false);

    const archivedIncident = fixture.ctx.store.readArchivedRelationships().filter(
      (e) => e.a === PAGE || e.b === PAGE,
    );
    expect(archivedIncident).toHaveLength(0);

    expect(await fixture.ctx.cache.listRelationshipsFromSource(PAGE, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1))).toHaveLength(1);
    expect(await fixture.ctx.cache.listRelationshipsFromSource(PAGE, projectionTypeForEndpoint(TEST_RELATED_ASSOCIATION_ID, 0))).toHaveLength(1);
    const detail = await getDatabaseViewDetail(fixture.ctx.cache, TYPE_DB, "all", fixture.ctx.store.contentDir);
    expect(detail?.rows.some((row) => row.nodeId === PAGE)).toBe(true);
  });

  test("unarchiveNode rejects non-archived page", async () => {
    expect(await unarchiveNode(fixture.ctx, PAGE)).toBe("not_archived");
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});
