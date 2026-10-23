/**
 * Always-on CacheSync timing baseline (in-process SQLite).
 * Logs elapsed ms for cold/warm ensureReady, syncNode, and syncRelationships.
 * No TOME_BENCHMARK gate — fixture size is CI-friendly.
 * Production worker-RPC overhead is a separate measurement if needed later.
 */
import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  loadRelationshipTypesFromContent,
  loadSchemaFromContent,
  nodeFilePath,
  RELATIONSHIPS_FILE_VERSION,
  serializeNodeFile,
  setTraitProjectionTypes,
  type RelationshipEntry,
} from "tome-flatfile";
import { GraphDatabase, wrapSyncGraphDatabase, type TomeQueryCache } from "tome-sqlite";
import { decodeEnumProperties, encodeEnumProperties } from "../../src/enum-codec";
import { CacheSync } from "../../src/content/sync";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  TEST_RELATED_ASSOCIATION_ID,
  type TestContentFixture,
} from "../../src/content/test-helpers";

const NODE_COUNT = 200;
const RELATIONSHIP_COUNT = 800;
const LOG_PREFIX = "[cache-sync-benchmark]";

/** Stable Crockford-base32 ids: `01BENCHS` + 18 digits. */
function benchNodeId(index: number): string {
  return `01BENCHS${String(index).padStart(18, "0")}`;
}

function openInProcessCache(contentDir: string, dbPath: string): TomeQueryCache {
  const db = new GraphDatabase(dbPath, {
    propertyCodec: {
      encode: (properties) => encodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
      decode: (properties) => decodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
    },
    memberPerspectives: () =>
      setTraitProjectionTypes(loadRelationshipTypesFromContent(contentDir)),
  });
  return wrapSyncGraphDatabase(db);
}

function seedFlatfileCorpus(fixture: TestContentFixture): {
  nodeIds: string[];
  relationshipCount: number;
} {
  const contentDir = fixture.ctx.store.contentDir;
  const nodeIds: string[] = [];
  for (let i = 0; i < NODE_COUNT; i += 1) {
    const id = benchNodeId(i);
    nodeIds.push(id);
    const path = nodeFilePath(contentDir, id);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      serializeNodeFile({ id, properties: { title: `Bench node ${i}` } }, `Body ${i}\n`),
      "utf-8",
    );
  }

  const registry = fixture.ctx.store.readRelationshipTypesFile();
  if (!registry.relationshipTypes[TEST_RELATED_ASSOCIATION_ID]) {
    registry.relationshipTypes[TEST_RELATED_ASSOCIATION_ID] = {
      perspectives: ["Related", "Related"],
      traits: ["symmetric"],
    };
  }
  fixture.ctx.store.writeRelationshipTypesFile(registry);

  const relationships: RelationshipEntry[] = [];
  // 200 nodes × 4 outgoing edges = 800 (wrap targets).
  for (let i = 0; i < NODE_COUNT; i += 1) {
    for (let offset = 1; offset <= 4; offset += 1) {
      relationships.push({
        a: nodeIds[i]!,
        b: nodeIds[(i + offset) % NODE_COUNT]!,
        type: TEST_RELATED_ASSOCIATION_ID,
        properties: {},
      });
    }
  }
  expect(relationships.length).toBe(RELATIONSHIP_COUNT);
  fixture.ctx.store.writeRelationshipsFile({
    version: RELATIONSHIPS_FILE_VERSION,
    relationships,
  });

  return { nodeIds, relationshipCount: relationships.length };
}

async function countRows(
  cache: TomeQueryCache,
  table: "nodes" | "relationship_records" | "relationship_projections",
): Promise<number> {
  const rows = await cache.queryAll<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table}`);
  return Number(rows[0]?.c ?? 0);
}

describe("CacheSync timing baseline", () => {
  let fixture: TestContentFixture;
  let nodeIds: string[] = [];
  let relationshipCount = 0;
  let cache: TomeQueryCache;
  let sync: CacheSync;

  test(
    "times cold ensureReady, warm ensureReady, syncNode, and syncRelationships",
    async () => {
      fixture = await createTestContentFixture("tome-cache-sync-bench-");
      const seeded = seedFlatfileCorpus(fixture);
      nodeIds = seeded.nodeIds;
      relationshipCount = seeded.relationshipCount;

      const contentDir = fixture.ctx.store.contentDir;
      const dbPath = fixture.ctx.cache.path;
      await fixture.ctx.cache.close();
      unlinkSync(dbPath);

      cache = openInProcessCache(contentDir, dbPath);
      sync = new CacheSync(fixture.ctx.store, cache);

      const coldStarted = performance.now();
      await sync.ensureReady();
      const coldMs = performance.now() - coldStarted;
      console.log(
        `${LOG_PREFIX} cold_ensureReady=${coldMs.toFixed(1)}ms nodes=${NODE_COUNT} relationships=${relationshipCount}`,
      );

      const nodeRows = await countRows(cache, "nodes");
      const recordRows = await countRows(cache, "relationship_records");
      const projectionRows = await countRows(cache, "relationship_projections");
      expect(nodeRows).toBeGreaterThanOrEqual(NODE_COUNT);
      expect(recordRows).toBe(relationshipCount);
      // Symmetric Related expands to two directed projections per record.
      expect(projectionRows).toBeGreaterThanOrEqual(relationshipCount);

      const warmStarted = performance.now();
      await sync.ensureReady();
      const warmMs = performance.now() - warmStarted;
      console.log(`${LOG_PREFIX} warm_ensureReady=${warmMs.toFixed(1)}ms`);

      const targetId = nodeIds[0]!;
      const path = nodeFilePath(contentDir, targetId);
      writeFileSync(
        path,
        serializeNodeFile(
          { id: targetId, properties: { title: "Bench node 0 updated" } },
          "Body 0 updated\n",
        ),
        "utf-8",
      );

      const nodeStarted = performance.now();
      await sync.syncNode(targetId);
      const nodeMs = performance.now() - nodeStarted;
      console.log(`${LOG_PREFIX} syncNode=${nodeMs.toFixed(1)}ms`);

      const cached = await cache.getNode(targetId);
      expect(cached?.properties.title).toBe("Bench node 0 updated");
      expect(cached?.properties.body).toBe("Body 0 updated\n");

      const file = fixture.ctx.store.readRelationshipsFile();
      file.relationships.push({
        a: nodeIds[0]!,
        b: nodeIds[5]!,
        type: TEST_RELATED_ASSOCIATION_ID,
        properties: { note: "extra" },
      });
      // Same endpoints+type already exist from offset=5? offset 1..4 only — 0→5 is new.
      fixture.ctx.store.writeRelationshipsFile(file);
      const expectedRecords = relationshipCount + 1;

      const relStarted = performance.now();
      await sync.syncRelationships();
      const relMs = performance.now() - relStarted;
      console.log(`${LOG_PREFIX} syncRelationships=${relMs.toFixed(1)}ms`);

      expect(await countRows(cache, "relationship_records")).toBe(expectedRecords);

      console.log(
        `${LOG_PREFIX} summary cold=${coldMs.toFixed(1)}ms warm=${warmMs.toFixed(1)}ms node=${nodeMs.toFixed(1)}ms rel=${relMs.toFixed(1)}ms`,
      );
    },
    { timeout: 120_000 },
  );

  afterAll(async () => {
    try {
      await cache?.close();
    } catch {
      /* may already be closed */
    }
    if (fixture) {
      // Fixture's original cache was closed; destroy still removes tempDir.
      try {
        await destroyTestContentFixture(fixture);
      } catch {
        /* ignore */
      }
    }
  });
});
