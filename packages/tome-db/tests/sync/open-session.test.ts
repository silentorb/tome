import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDataStoreSession } from "../../src/sync";
import {
  createTestContentFixture,
  destroyTestContentFixture,
} from "../../src/content/test-helpers";

describe("openDataStoreSession smoke", async () => {
  test("opens solo flatfile + sqlite and wires default graph", async () => {
    const fixture = await createTestContentFixture();
    const dir = mkdtempSync(join(tmpdir(), "tome-sync-session-"));
    const dbPath = join(dir, "cache.sqlite");
    try {
      const session = await openDataStoreSession({
        dataStores: {
          content: {
            id: "content",
            module: "tome-flatfile",
            export: "createFlatfileModule",
            options: { contentPath: fixture.ctx.store.contentDir },
          },
          cache: {
            id: "cache",
            module: "tome-sqlite",
            export: "createSqliteModule",
            options: { dbPath },
          },
        },
        queryStoreId: "cache",
        deferReady: false,
      });
      expect(session.flatfileStoreIds).toEqual(["content"]);
      expect(session.wire?.edges).toHaveLength(1);
      expect(session.writeContext.sync).toBeDefined();
      expect(session.writeContext.store).toBeDefined();
      session.dispose();
    } finally {
      await destroyTestContentFixture(fixture);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("opens Queryable SoT-only session without CacheSync or FTS observe edges", async () => {
    const sotModule = new URL("./fixtures/fake-queryable-sot.ts", import.meta.url).pathname;
    const session = await openDataStoreSession({
      dataStores: {
        sot: {
          id: "sot",
          module: sotModule,
          export: "createFakeQueryableStoreModule",
          options: {},
        },
        fts: {
          id: "fts",
          module: sotModule,
          export: "createFakeFtsModule",
          options: {},
        },
      },
      queryStoreId: "sot",
      deferReady: false,
    });
    try {
      expect(session.flatfileStoreIds).toEqual([]);
      expect(session.writeContext.sync).toBeUndefined();
      expect(session.writeContext.store).toBeUndefined();
      expect(session.writeContext.graphStore.contentDir).toBe("fake://sot");
      expect(session.searchBackends.has("fts")).toBe(true);
      expect(session.wire?.edges ?? []).toHaveLength(0);
      const fts = session.registry.get("fts");
      expect(fts?.kind).toBe("fts");
      expect(fts?.endpoint).toBeUndefined();
    } finally {
      session.dispose();
    }
  });
});
