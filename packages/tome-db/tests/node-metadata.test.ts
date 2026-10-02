import { describe, expect, test } from "bun:test";
import { GraphDatabase, wrapSyncGraphDatabase } from "tome-sqlite";
import { getNodePageMetadata } from "../src/node-metadata";
import { getNodePageDetail } from "../src/node-page-sections";
import { updateNodeBody } from "../src/queries";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "../src/content/test-helpers";

const PAGE_A = "00000000000000000000000001";
const PAGE_B = "11111111111111111111111111";
const PAGE_C = "22222222222222222222222222";

describe("node-metadata", async () => {
  test("counts incident edges but ignores them for backlinks", async () => {
    const db = new GraphDatabase(":memory:", { clean: true });
  const cache = wrapSyncGraphDatabase(db);
    db.upsertNode(PAGE_A, { title: "Page A" });
    db.upsertNode(PAGE_B, { title: "Page B" });
    db.upsertNode(PAGE_C, { title: "Page C" });
    db.upsertRelationship(PAGE_B, PAGE_A, "links");
    db.upsertRelationship(PAGE_C, PAGE_A, "REFERENCES");

    const meta = await getNodePageMetadata(cache, PAGE_A);
    expect(meta?.relationshipCount).toBe(2);
    expect(meta?.backlinks).toEqual([]);

    await cache.close();
  });

  test("lists markdown body backlinks only", async () => {
    const db = new GraphDatabase(":memory:", { clean: true });
  const cache = wrapSyncGraphDatabase(db);
    db.upsertNode(PAGE_A, { title: "Page A" });
    db.upsertNode(PAGE_B, {
      title: "Page B",
      body: `# Page B\n\nSee [Page A](./${PAGE_A}.md).`,
    });
    db.upsertNode(PAGE_C, {
      title: "Page C",
      body: `# Page C\n\nRelated (./${PAGE_A}.md)`,
    });

    const meta = await getNodePageMetadata(cache, PAGE_A);
    expect(meta?.backlinks).toHaveLength(2);
    expect(meta?.backlinks.map((b) => b.title).sort()).toEqual(["Page B", "Page C"]);
    expect(meta?.backlinks.find((b) => b.sourceId === PAGE_B)?.linkText).toBe("Page A");

    await cache.close();
  });

  test("reads created_at and modified_at from vertex properties", async () => {
    const db = new GraphDatabase(":memory:", { clean: true });
  const cache = wrapSyncGraphDatabase(db);
    db.upsertNode(PAGE_A, {
      title: "Page A",
      created_at: "2024-01-15T10:00:00.000Z",
      modified_at: "2024-06-01T12:30:00.000Z",
    });

    const meta = await getNodePageMetadata(cache, PAGE_A);
    expect(meta?.createdAt).toBe("2024-01-15T10:00:00.000Z");
    expect(meta?.modifiedAt).toBe("2024-06-01T12:30:00.000Z");

    await cache.close();
  });

  test("getNodePageDetail includes metadata", async () => {
    const db = new GraphDatabase(":memory:", { clean: true });
  const cache = wrapSyncGraphDatabase(db);
    db.upsertNode(PAGE_A, { title: "Page A", body: "Hello" });

    const detail = await getNodePageDetail(cache, PAGE_A);
    expect(detail?.metadata.relationshipCount).toBe(0);
    expect(detail?.metadata.backlinks).toEqual([]);

    await cache.close();
  });

  test("updateNodeBody sets modified_at and bootstraps created_at", async () => {
    const fixture = await createTestContentFixture("tome-db-meta-write-");
    await seedTestNode(fixture, {
      id: PAGE_A,
      properties: { title: "Page A", body: "Old" },
    });

    await updateNodeBody(fixture.ctx, PAGE_A, "New");
    const vertex = await fixture.ctx.cache.getNode(PAGE_A);
    expect(typeof vertex?.properties.modified_at).toBe("string");
    expect(typeof vertex?.properties.created_at).toBe("string");

    await destroyTestContentFixture(fixture);
  });
});
