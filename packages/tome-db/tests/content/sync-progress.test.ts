import { describe, expect, test, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";
import { loadAssociationsFromContent, loadSchemaFromContent, setTraitProjectionTypes } from "tome-flatfile";
import { GraphDatabase } from "tome-sqlite";
import { decodeEnumProperties, encodeEnumProperties } from "../../src/enum-codec";
import {
  CacheSync,
  type SyncProgressEvent,
  type SyncProgressPhase,
} from "../../src/content/sync";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "../../src/content/test-helpers";

describe("CacheSync startup progress", () => {
  const fixture = createTestContentFixture("tome-sync-progress-");
  const nodeId = "DDDDDDDDDDDDDDDDDDDDDDDDDD";

  seedTestNode(fixture, {
    id: nodeId,
    properties: { title: "Progress test node" },
  });

  test("reports rebuild phases on a cold cache", () => {
    const events: SyncProgressEvent[] = [];
    const reporter = (event: SyncProgressEvent) => {
      events.push(event);
    };

    const contentDir = fixture.ctx.store.contentDir;
    const dbPath = fixture.ctx.cache.path;
    fixture.ctx.cache.close();
    unlinkSync(dbPath);

    const cache = new GraphDatabase(dbPath, {
      propertyCodec: {
        encode: (properties) => encodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
        decode: (properties) => decodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
      },
      memberPerspectives: () =>
        setTraitProjectionTypes(loadAssociationsFromContent(contentDir)),
    });
    const sync = new CacheSync(fixture.ctx.store, cache, reporter);
    sync.ensureReady();

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
    cache.close();
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
