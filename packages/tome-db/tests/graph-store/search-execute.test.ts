import { afterAll, describe, expect, test } from "bun:test";
import { searchNodesGraph } from "../../src/graph-store/standard-graphs";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  projectionTypeForEndpoint,
  seedTestNode,
  seedTestRelationships,
  type TestContentFixture,
} from "../../src/content/test-helpers";

describe("searchNodesGraph via executeImp", () => {
  const fixture: TestContentFixture = createTestContentFixture("tome-db-search-imp-");
  const titleMatchId = "0000000000000000000000002F";
  const bodyOnlyId = "0000000000000000000000002R";
  const hostId = "0000000000000000000000003A";
  const memberId = "0000000000000000000000003B";
  const outsiderId = "0000000000000000000000003C";
  const associationType = "000000000000000000000000AA";

  seedTestNode(fixture, {
    id: titleMatchId,
    properties: {
      title: "Surreal Title Match",
      body: "no marker here",
    },
  });
  seedTestNode(fixture, {
    id: bodyOnlyId,
    properties: {
      title: "Unrelated",
      body: "contains surreal-body-marker text",
    },
  });
  seedTestNode(fixture, {
    id: hostId,
    properties: { title: "Active Host" },
  });
  seedTestNode(fixture, {
    id: memberId,
    properties: { title: "Active Member" },
  });
  seedTestNode(fixture, {
    id: outsiderId,
    properties: { title: "Active Outsider" },
  });
  seedTestRelationships(fixture, [
    {
      source: hostId,
      target: memberId,
      type: associationType,
    },
  ]);

  test("title hits rank above body-only hits", () => {
    const executed = fixture.ctx.graphStore.executeImp(searchNodesGraph(10), {
      parameters: { query: "surreal" },
    });
    expect(executed instanceof Promise).toBe(false);
    if (executed instanceof Promise) return;
    const ids = executed.rows.map((row) => String(row.id));
    expect(ids.indexOf(titleMatchId)).toBeLessThan(ids.indexOf(bodyOnlyId));
  });

  test("body-only hits include matchPreview", () => {
    const executed = fixture.ctx.graphStore.executeImp(searchNodesGraph(10), {
      parameters: { query: "surreal-body-marker" },
    });
    expect(executed instanceof Promise).toBe(false);
    if (executed instanceof Promise) return;
    const bodyRow = executed.rows.find((row) => String(row.id) === bodyOnlyId);
    expect(bodyRow?.matchPreview).toBeDefined();
  });

  test("Only-active target picking uses opposite projection hosts", () => {
    // Selecting :1 (Membership-like) → hosts of :0 (Members-like) = relationship sources.
    const membershipLike = projectionTypeForEndpoint(associationType, 1);
    const executed = fixture.ctx.graphStore.executeImp(searchNodesGraph(20), {
      parameters: { query: "Active" },
      participatesInProjectionType: membershipLike,
      onlyActivePickingRole: "target",
    });
    expect(executed instanceof Promise).toBe(false);
    if (executed instanceof Promise) return;
    const ids = executed.rows.map((row) => String(row.id));
    expect(ids).toContain(hostId);
    expect(ids).not.toContain(memberId);
    expect(ids).not.toContain(outsiderId);
  });

  test("Only-active source picking uses selected projection hosts", () => {
    const membersLike = projectionTypeForEndpoint(associationType, 0);
    const executed = fixture.ctx.graphStore.executeImp(searchNodesGraph(20), {
      parameters: { query: "Active" },
      participatesInProjectionType: membersLike,
      onlyActivePickingRole: "source",
    });
    expect(executed instanceof Promise).toBe(false);
    if (executed instanceof Promise) return;
    const ids = executed.rows.map((row) => String(row.id));
    expect(ids).toContain(hostId);
    expect(ids).not.toContain(memberId);
    expect(ids).not.toContain(outsiderId);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
