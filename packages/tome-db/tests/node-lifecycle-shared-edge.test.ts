import { describe, expect, test, afterAll } from "bun:test";
import { archiveNode, unarchiveNode } from "../src/node-lifecycle";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestIncludes,
  seedTestNode,
  TEST_ARCHIVE_NODE_ID,
  TEST_HOME_NODE_ID,
} from "../src/content/test-helpers";

const HUB = TEST_ARCHIVE_NODE_ID;
const HOME = TEST_HOME_NODE_ID;
const NODE_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NODE_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("shared archived edge unarchive", () => {
  const fixture = createTestContentFixture("tome-lifecycle-shared-");

  seedTestNode(fixture, { id: HOME, properties: { title: "Home" } });
  seedTestNode(fixture, { id: HUB, properties: { title: "Archive" } });
  seedTestNode(fixture, { id: NODE_A, properties: { title: "A" } });
  seedTestNode(fixture, { id: NODE_B, properties: { title: "B" } });

  seedTestIncludes(fixture, [{ a: NODE_A, b: NODE_B }]);

  test("unarchiving one endpoint keeps shared edge archived while other remains archived", () => {
    expect(archiveNode(fixture.ctx, NODE_A)).toBeNull();
    expect(archiveNode(fixture.ctx, NODE_B)).toBeNull();

    expect(unarchiveNode(fixture.ctx, NODE_A)).toBeNull();

    const file = fixture.ctx.store.readRelationshipsFile();
    const shared = file.relationships.find(
      (e) => e.type === "includes" && e.a !== HUB && e.b !== HUB,
    );
    expect(shared?.archived).toBe(true);
    expect(fixture.ctx.db.listRelationshipsFromSource(NODE_A)).toHaveLength(0);
    const nodeBOutgoing = fixture.ctx.db.listRelationshipsFromSource(NODE_B);
    expect(nodeBOutgoing).toHaveLength(1);
    expect(nodeBOutgoing[0]?.targetNodeId).toBe(HUB);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
