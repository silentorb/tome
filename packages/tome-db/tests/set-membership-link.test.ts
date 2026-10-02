import { describe, expect, test, afterAll } from "bun:test";
import { projectionTypeForEndpoint } from "tome-flatfile";
import { linkOutgoingRelationship } from "../src/relationship-link-mutations";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestTableSchema,
  TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
  type TestContentFixture,
} from "../src/content/test-helpers";
import { getDatabaseViewDetail } from "../src/database-view";
import { getNodePageDetail } from "../src/node-page-sections";
import { listSetMemberRowConnections } from "../src/set-membership";
import { typeTableMarkerProperties } from "../src/node-capabilities";

const TYPE_ID = "DDDDDDDDDDDDDDDDDDDDDDDDDD";
const MEMBER_A = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const MEMBER_SIDE = projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1);
const SET_SIDE = projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 0);

describe("linkOutgoingRelationship member_of row metadata", async () => {
  const fixture: TestContentFixture = await createTestContentFixture("tome-link-member-of-row-");
  const { ctx } = fixture;
  const store = ctx.store;

  await seedTestNode(fixture, { id: TYPE_ID, properties: typeTableMarkerProperties("Themes") });
  seedTestTableSchema(fixture, TYPE_ID, []);

  test("link-existing creates member_of without row_index stamping", async () => {
    await seedTestNode(fixture, { id: MEMBER_A, properties: { title: "Community" } });

    const err = await linkOutgoingRelationship(ctx, {
      sourceId: MEMBER_A,
      targetId: TYPE_ID,
      type: MEMBER_SIDE,
    });
    expect(err).toBeNull();

    const db = ctx.cache;
    const membership = (await db.listRelationshipsFromSource(MEMBER_A, MEMBER_SIDE))[0];
    expect(membership?.properties.view).toBeUndefined();
    expect(membership?.properties.row_index).toBeUndefined();

    const membersProjections = await db.listRelationshipsFromSource(TYPE_ID, SET_SIDE);
    expect(membersProjections.some((p) => p.targetNodeId === MEMBER_A)).toBe(true);

    const view = await getDatabaseViewDetail(db, TYPE_ID, undefined, store.contentDir);
    expect(view?.rows.some((r) => r.nodeId === MEMBER_A)).toBe(true);
    expect((await listSetMemberRowConnections(db, TYPE_ID, store.contentDir)).some((r) => r.sourceNodeId === MEMBER_A)).toBe(
      true,
    );
  });

  test("type-table page has database section only without duplicate members relation section", async () => {
    const detail = await getNodePageDetail(ctx.cache, TYPE_ID, { contentDir: store.contentDir });
    const sectionTypes = detail?.sections.map((s) => s.type) ?? [];
    expect(sectionTypes).toContain("database");
    expect(sectionTypes.filter((t) => t === "relations")).toHaveLength(0);
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});
