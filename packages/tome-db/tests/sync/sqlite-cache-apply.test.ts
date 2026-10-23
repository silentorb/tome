import { describe, expect, test, afterAll } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestCompositeRelationships,
  seedTestNode,
  TEST_RELATED_ASSOCIATION_ID,
  projectionTypeForEndpoint,
} from "../../src/content/test-helpers";
import { createSqliteCacheSyncEndpoint } from "../../src/sync";
import { relationshipRecordId, RELATIONSHIPS_SYNC_MARKER } from "tome-flatfile";
import type { SyncSourceRead } from "../../src/sync";

const stubSource: SyncSourceRead = {
  executeImp() {
    return { columns: ["id"], rows: [] };
  },
};

describe("createSqliteCacheSyncEndpoint apply", async () => {
  const fixture = await createTestContentFixture("tome-sqlite-cache-apply-");
  const a = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
  const b = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
  const c = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
  const related0 = projectionTypeForEndpoint(TEST_RELATED_ASSOCIATION_ID, 0);

  await seedTestNode(fixture, { id: a, properties: { title: "A" } });
  await seedTestNode(fixture, { id: b, properties: { title: "B" } });
  await seedTestNode(fixture, { id: c, properties: { title: "C" } });
  await seedTestCompositeRelationships(fixture, [
    {
      a,
      b,
      typeFromA: "Related",
      typeFromB: "Related",
      relationshipTypeId: TEST_RELATED_ASSOCIATION_ID,
      properties: { note: "ab" },
    },
    {
      a,
      b: c,
      typeFromA: "Related",
      typeFromB: "Related",
      relationshipTypeId: TEST_RELATED_ASSOCIATION_ID,
      properties: { note: "ac" },
    },
  ]);

  const endpoint = createSqliteCacheSyncEndpoint({
    id: "session-cache",
    sync: fixture.ctx.sync,
  });

  test("content relationships scope refreshes via syncFile not ensureReady", async () => {
    const file = fixture.ctx.store.readRelationshipsFile();
    const ab = file.relationships.find(
      (e) => e.a === a && e.b === b && e.type === TEST_RELATED_ASSOCIATION_ID,
    )!;
    ab.properties = { note: "ab-updated" };
    fixture.ctx.store.writeRelationshipsFile(file);

    await endpoint.apply({
      source: stubSource,
      scope: { mode: "content", relativeName: RELATIONSHIPS_SYNC_MARKER },
    });

    const edge = (await fixture.ctx.cache.listRelationshipsFromSource(a, related0)).find(
      (r) => r.targetNodeId === b,
    );
    expect(edge?.properties.note).toBe("ab-updated");
    // Unrelated edge still present (full expand, not wipe of nodes).
    expect(
      (await fixture.ctx.cache.listRelationshipsFromSource(a, related0)).some(
        (r) => r.targetNodeId === c,
      ),
    ).toBe(true);
  });

  test("partial relationship delete removes one record and keeps others", async () => {
    const deleteId = relationshipRecordId(a, b, TEST_RELATED_ASSOCIATION_ID);
    const keepId = relationshipRecordId(a, c, TEST_RELATED_ASSOCIATION_ID);

    const file = fixture.ctx.store.readRelationshipsFile();
    file.relationships = file.relationships.filter(
      (e) => relationshipRecordId(e.a, e.b, e.type) !== deleteId,
    );
    fixture.ctx.store.writeRelationshipsFile(file);

    await endpoint.apply({
      source: stubSource,
      scope: {
        mode: "partial",
        changes: {
          nodes: { created: [], modified: [], deleted: [] },
          relationships: { created: [], modified: [], deleted: [deleteId] },
        },
      },
    });

    expect(await fixture.ctx.cache.getRelationshipRecord(deleteId)).toBeNull();
    expect(await fixture.ctx.cache.getRelationshipRecord(keepId)).not.toBeNull();
    expect(
      (await fixture.ctx.cache.listRelationshipsFromSource(a, related0)).map((r) => r.targetNodeId),
    ).toEqual([c]);
  });

  test("partial relationship upsert applies without clearing other edges", async () => {
    const newId = relationshipRecordId(b, c, TEST_RELATED_ASSOCIATION_ID);
    const file = fixture.ctx.store.readRelationshipsFile();
    file.relationships.push({
      a: b,
      b: c,
      type: TEST_RELATED_ASSOCIATION_ID,
      properties: { note: "bc" },
    });
    fixture.ctx.store.writeRelationshipsFile(file);

    await endpoint.apply({
      source: stubSource,
      scope: {
        mode: "partial",
        changes: {
          nodes: { created: [], modified: [], deleted: [] },
          relationships: { created: [newId], modified: [], deleted: [] },
        },
      },
    });

    expect(await fixture.ctx.cache.getRelationshipRecord(newId)).not.toBeNull();
    expect(
      await fixture.ctx.cache.getRelationshipRecord(
        relationshipRecordId(a, c, TEST_RELATED_ASSOCIATION_ID),
      ),
    ).not.toBeNull();
  });

  test("queued apply does not drop when another apply is in flight", async () => {
    const nodeId = a;
    fixture.ctx.store.writeNode(
      { id: nodeId, properties: { title: "A-queued-1" } },
      "body1\n",
    );
    const p1 = endpoint.apply({
      source: stubSource,
      scope: {
        mode: "partial",
        changes: {
          nodes: { created: [], modified: [nodeId], deleted: [] },
          relationships: { created: [], modified: [], deleted: [] },
        },
      },
    });
    fixture.ctx.store.writeNode(
      { id: nodeId, properties: { title: "A-queued-2" } },
      "body2\n",
    );
    const p2 = endpoint.apply({
      source: stubSource,
      scope: {
        mode: "partial",
        changes: {
          nodes: { created: [], modified: [nodeId], deleted: [] },
          relationships: { created: [], modified: [], deleted: [] },
        },
      },
    });
    await Promise.all([p1, p2]);
    const node = await fixture.ctx.cache.getNode(nodeId);
    expect(node?.properties.title).toBe("A-queued-2");
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});
