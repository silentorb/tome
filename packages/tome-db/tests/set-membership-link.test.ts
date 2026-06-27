import { describe, expect, test, afterAll } from "bun:test";
import { GraphDatabase } from "../src/graph";
import { IS_A_TYPE } from "../src/labels";
import { linkOutgoingRelationship } from "../src/relationship-link-mutations";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  type TestContentFixture,
} from "../src/content/test-helpers";
import { registerSetMembershipType } from "../src/content/relationship-types-file";
import { getDatabaseViewDetail } from "../src/database-view";
import { listSetMemberRowConnections } from "../src/set-membership";

const TYPE_ID = "dddddddddddddddddddddddddddddddd";
const MEMBER_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("linkOutgoingRelationship is_a row metadata", () => {
  const fixture: TestContentFixture = createTestContentFixture("tome-link-is-a-row-");
  const { ctx } = fixture;
  const store = ctx.store;

  store.writeNode({ id: TYPE_ID, properties: { title: "Themes" } }, "");
  store.writeTableSchemasFile({
    version: 1,
    tables: { [TYPE_ID]: { columns: [] } },
  });
  const types = store.readRelationshipTypesFile();
  registerSetMembershipType(types);
  store.writeRelationshipTypesFile(types);
  ctx.sync.syncAll();

  test("link-existing stamps view and row_index so row appears in type table", () => {
    store.writeNode({ id: MEMBER_A, properties: { title: "Community" } }, "");
    ctx.sync.syncAll();

    const err = linkOutgoingRelationship(ctx, {
      sourceId: MEMBER_A,
      targetId: TYPE_ID,
      type: IS_A_TYPE,
    });
    expect(err).toBeNull();

    const db = ctx.db;
    const membership = db.listRelationshipsFromSource(MEMBER_A, IS_A_TYPE)[0];
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

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
