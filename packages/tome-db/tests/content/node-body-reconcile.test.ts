import { describe, expect, test, afterAll } from "bun:test";
import { serializePageBlock } from "tome-interfaces/page-block";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "../../src/content/test-helpers";
import { openContentGraph } from "../../src/content/sync";
import { getNodeDetail } from "../../src/queries";

describe("CacheSync node body reconciliation", () => {
  const fixture = createTestContentFixture("tome-node-body-reconcile-");
  const nodeId = "cccccccccccccccccccccccccccccccc";
  const pageBlockBody = serializePageBlock("spatial-graph.block", {
    relationships: { parentTypes: ["parents"] },
  });

  seedTestNode(
    fixture,
    {
      id: nodeId,
      properties: { title: "Locations" },
    },
    pageBlockBody,
  );

  test("repairs SQLite body when it drifted from the node file", () => {
    fixture.ctx.db.upsertNode(nodeId, { title: "Locations", body: "" });
    expect(getNodeDetail(fixture.ctx.db, nodeId)?.body).toBe("");

    const reopened = openContentGraph(
      fixture.ctx.store.contentDir,
      fixture.ctx.db.path,
    );
    expect(getNodeDetail(reopened.db, nodeId)?.body.trimEnd()).toBe(pageBlockBody.trimEnd());
    reopened.db.close();
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
