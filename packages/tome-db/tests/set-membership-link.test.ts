import { describe, expect, test, afterAll } from "bun:test";
import { MEMBER_OF_TYPE } from "../src/labels";
import { linkOutgoingRelationship } from "../src/relationship-link-mutations";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestTableSchema,
  type TestContentFixture,
} from "../src/content/test-helpers";
import { registerSetMembershipType } from "../src/content/relationship-types-file";
import { getDatabaseViewDetail } from "../src/database-view";
import { getNodePageDetail } from "../src/node-page-sections";
import { listSetMemberRowConnections } from "../src/set-membership";
import { typeTableMarkerProperties } from "../src/node-capabilities";

const TYPE_ID = "dddddddddddddddddddddddddddddddd";
const MEMBER_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("linkOutgoingRelationship member_of row metadata", () => {
  const fixture: TestContentFixture = createTestContentFixture("tome-link-member-of-row-");
  const { ctx } = fixture;
  const store = ctx.store;

  const types = store.readRelationshipTypesFile();
  registerSetMembershipType(types);
  store.writeRelationshipTypesFile(types);
  ctx.sync.syncRelationships();

  seedTestNode(fixture, { id: TYPE_ID, properties: typeTableMarkerProperties("Themes") });
  seedTestTableSchema(fixture, TYPE_ID, []);

  test("link-existing stamps view and row_index so row appears in type table", () => {
    seedTestNode(fixture, { id: MEMBER_A, properties: { title: "Community" } });

    const err = linkOutgoingRelationship(ctx, {
      sourceId: MEMBER_A,
      targetId: TYPE_ID,
      type: MEMBER_OF_TYPE,
    });
    expect(err).toBeNull();

    const db = ctx.db;
    const membership = db.listRelationshipsFromSource(MEMBER_A, MEMBER_OF_TYPE)[0];
    expect(membership?.properties.view).toBe("default");
    expect(membership?.properties.row_index).toBe(0);

    const membersProjections = db.listRelationshipsFromSource(TYPE_ID, "members");
    expect(membersProjections.some((p) => p.targetNodeId === MEMBER_A)).toBe(true);

    const view = getDatabaseViewDetail(db, TYPE_ID, undefined, store.contentDir);
    expect(view?.rows.some((r) => r.nodeId === MEMBER_A)).toBe(true);
    expect(listSetMemberRowConnections(db, TYPE_ID).some((r) => r.sourceNodeId === MEMBER_A)).toBe(
      true,
    );
  });

  test("type-table page has database section only without duplicate members relation section", () => {
    const detail = getNodePageDetail(ctx.db, TYPE_ID, { contentDir: store.contentDir });
    const sectionTypes = detail?.sections.map((s) => s.type) ?? [];
    expect(sectionTypes).toContain("database");
    expect(sectionTypes.filter((t) => t === "relations")).toHaveLength(0);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
