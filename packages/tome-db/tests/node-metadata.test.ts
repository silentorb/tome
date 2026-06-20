import { describe, expect, test } from "bun:test";
import { GraphDatabase } from "../src/graph";
import { getNodePageMetadata } from "../src/node-metadata";
import { getNodePageDetail } from "../src/node-page-sections";
import { updateNodeBody } from "../src/queries";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "../src/content/test-helpers";

const PAGE_A = "0123456789abcdef0123456789abcdef";
const PAGE_B = "11111111111111111111111111111111";
const PAGE_C = "22222222222222222222222222222222";

describe("node-metadata", () => {
  test("counts incident edges but ignores them for backlinks", () => {
    const db = new GraphDatabase(":memory:", { clean: true });
    db.upsertNode(PAGE_A, { title: "Page A" });
    db.upsertNode(PAGE_B, { title: "Page B" });
    db.upsertNode(PAGE_C, { title: "Page C" });
    db.upsertRelationship(PAGE_B, PAGE_A, "links");
    db.upsertRelationship(PAGE_C, PAGE_A, "REFERENCES");

    const meta = getNodePageMetadata(db, PAGE_A);
    expect(meta?.relationshipCount).toBe(2);
    expect(meta?.backlinks).toEqual([]);

    db.close();
  });

  test("lists markdown body backlinks only", () => {
    const db = new GraphDatabase(":memory:", { clean: true });
    db.upsertNode(PAGE_A, { title: "Page A" });
    db.upsertNode(PAGE_B, {
      title: "Page B",
      body: `# Page B\n\nSee [Page A](marloth:${PAGE_A}).`,
    });
    db.upsertNode(PAGE_C, {
      title: "Page C",
      body: `# Page C\n\nRelated (${PAGE_A}.md)`,
    });

    const meta = getNodePageMetadata(db, PAGE_A);
    expect(meta?.backlinks).toHaveLength(2);
    expect(meta?.backlinks.map((b) => b.title).sort()).toEqual(["Page B", "Page C"]);
    expect(meta?.backlinks.find((b) => b.sourceId === PAGE_B)?.linkText).toBe("Page A");

    db.close();
  });

  test("reads created_at and modified_at from vertex properties", () => {
    const db = new GraphDatabase(":memory:", { clean: true });
    db.upsertNode(PAGE_A, {
      title: "Page A",
      created_at: "2024-01-15T10:00:00.000Z",
      modified_at: "2024-06-01T12:30:00.000Z",
    });

    const meta = getNodePageMetadata(db, PAGE_A);
    expect(meta?.createdAt).toBe("2024-01-15T10:00:00.000Z");
    expect(meta?.modifiedAt).toBe("2024-06-01T12:30:00.000Z");

    db.close();
  });

  test("getNodePageDetail includes metadata", () => {
    const db = new GraphDatabase(":memory:", { clean: true });
    db.upsertNode(PAGE_A, { title: "Page A", body: "Hello" });

    const detail = getNodePageDetail(db, PAGE_A);
    expect(detail?.metadata.relationshipCount).toBe(0);
    expect(detail?.metadata.backlinks).toEqual([]);

    db.close();
  });

  test("updateNodeBody sets modified_at and bootstraps created_at", () => {
    const fixture = createTestContentFixture("tome-db-meta-write-");
    seedTestNode(fixture, {
      id: PAGE_A,
      properties: { title: "Page A", body: "Old" },
    });

    updateNodeBody(fixture.ctx, PAGE_A, "New");
    const vertex = fixture.ctx.db.getNode(PAGE_A);
    expect(typeof vertex?.properties.modified_at).toBe("string");
    expect(typeof vertex?.properties.created_at).toBe("string");

    destroyTestContentFixture(fixture);
  });
});
