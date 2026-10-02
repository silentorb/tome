import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";
import { loadRelationshipTypesFromContent, loadSchemaFromContent, setTraitProjectionTypes } from "tome-flatfile";
import { GraphDatabase, wrapSyncGraphDatabase } from "tome-sqlite";
import { decodeEnumProperties, encodeEnumProperties } from "../../src/enum-codec";
import {
  CacheSync,
  createCacheSyncStatusTracker,
  type SyncProgressEvent,
  type SyncProgressPhase,
} from "../../src/content/sync";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  type TestContentFixture,
} from "../../src/content/test-helpers";

describe("CacheSync startup progress", async () => {
  let fixture: TestContentFixture;
  const nodeId = "DDDDDDDDDDDDDDDDDDDDDDDDDD";

  beforeAll(async () => {
    fixture = await createTestContentFixture("tome-sync-progress-");
    await seedTestNode(fixture, {
      id: nodeId,
      properties: { title: "Progress test node" },
    });
  });

  test("reports rebuild phases on a cold cache", async () => {
    const events: SyncProgressEvent[] = [];
    const reporter = (event: SyncProgressEvent) => {
      events.push(event);
    };

    const contentDir = fixture.ctx.store.contentDir;
    const dbPath = fixture.ctx.cache.path;
    await fixture.ctx.cache.close();
    unlinkSync(dbPath);

    const db = new GraphDatabase(dbPath, {
      propertyCodec: {
        encode: (properties) => encodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
        decode: (properties) => decodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
      },
      memberPerspectives: () =>
        setTraitProjectionTypes(loadRelationshipTypesFromContent(contentDir)),
    });
  const cache = wrapSyncGraphDatabase(db);
    const sync = new CacheSync(fixture.ctx.store, cache, reporter);
    await sync.ensureReady();

    const phases = events.map((event) => event.phase);
    const expected: SyncProgressPhase[] = [
      "check",
      "rebuild",
      "rebuild_nodes",
      "expand_relationships",
      "ready",
    ];
    for (const phase of expected) {
      expect(phases).toContain(phase);
    }
    expect(events.some((event) => event.phase === "rebuild" && (event.total ?? 0) >= 1)).toBe(true);
    await cache.close();
  });

  test("status tracker exposes numeric progress during ensureReady", async () => {
    const tracker = createCacheSyncStatusTracker();
    const contentDir = fixture.ctx.store.contentDir;
    const dbPath = `${fixture.ctx.cache.path}.async`;
    try {
      unlinkSync(dbPath);
    } catch {
      /* fresh */
    }

    const db = new GraphDatabase(dbPath, {
      propertyCodec: {
        encode: (properties) => encodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
        decode: (properties) => decodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
      },
      memberPerspectives: () =>
        setTraitProjectionTypes(loadRelationshipTypesFromContent(contentDir)),
    });
  const cache = wrapSyncGraphDatabase(db);
    const sync = new CacheSync(fixture.ctx.store, cache, tracker.report);
    expect(tracker.getStatus().ready).toBe(false);
    expect(tracker.getStatus().syncing).toBe(true);

    await sync.ensureReady();
    tracker.markReady();

    const status = tracker.getStatus();
    expect(status.ready).toBe(true);
    expect(status.syncing).toBe(false);
    expect(status.phase).toBe("ready");
    await cache.close();
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});
