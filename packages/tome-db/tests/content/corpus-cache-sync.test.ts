import { describe, expect, test } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "tome-db/content/test-helpers";

describe("CacheSync corpora catalog and corpus_id", () => {
  test("fullRebuild writes corpora rows and node corpus_id", async () => {
    const fixture = await createTestContentFixture("tome-corpus-cache-sync-");
    try {
      const nodeId = "EEEEEEEEEEEEEEEEEEEEEEEEEE";
      await seedTestNode(fixture, {
        id: nodeId,
        properties: { title: "Corpus owned" },
      });
      await fixture.ctx.sync.fullRebuild();

      const corpusId = fixture.ctx.graphStore.locateNode(nodeId);
      expect(corpusId).toBeTruthy();
      expect(await fixture.ctx.cache.corpusIdForNode(nodeId)).toBe(corpusId);

      const catalog = await fixture.ctx.cache.listCorporaFromCache();
      expect(catalog.length).toBeGreaterThan(0);
      expect(catalog.some((c) => c.id === corpusId)).toBe(true);
      expect(catalog[0]?.workspace.homeNodeId).toBeTruthy();
    } finally {
      await destroyTestContentFixture(fixture);
    }
  });
});
