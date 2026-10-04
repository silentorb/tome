import { describe, expect, test, afterAll } from "bun:test";
import { serializePageBlock } from "tome-interfaces/page-block";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "../../src/content/test-helpers";
import { openContentGraph } from "../../src/content/sync";
import { getNodeDetail } from "../../src/queries";

describe("CacheSync node body reconciliation", async () => {
  const fixture = await createTestContentFixture("tome-node-body-reconcile-");
  const nodeId = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
  const pageBlockBody = serializePageBlock("spatial-graph", {
    relationships: { parentTypes: ["parents"] },
  });

  await seedTestNode(
    fixture,
    {
      id: nodeId,
      properties: { title: "Locations" },
    },
    pageBlockBody,
  );

  test("repairs SQLite body when it drifted from the node file", async () => {
    await fixture.ctx.cache.upsertNode(nodeId, { title: "Locations", body: "" });
    expect((await getNodeDetail(fixture.ctx.cache, nodeId))?.body).toBe("");

    const reopened = await openContentGraph(
      fixture.ctx.store.contentDir,
      fixture.ctx.cache.path,
    );
    expect((await getNodeDetail(reopened.cache, nodeId))?.body.trimEnd()).toBe(pageBlockBody.trimEnd());
    await reopened.cache.close();
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});
