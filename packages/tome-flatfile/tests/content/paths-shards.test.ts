import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ContentStore } from "../../src/content/store";
import {
  nodeFileName,
  nodeFilePath,
  nodeRelativePath,
  nodeShardDir,
  relationshipFilePath,
} from "../../src/content/paths";
import {
  relationshipDigest,
  relationshipRelativePath,
} from "../../src/content/relationship-path";
import { RELATIONSHIPS_FILE_VERSION } from "../../src/content/relationships-file";

const ID = "01KWN86X6KNBWXKBG5EGFMQJXA";
const A = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const B = "01ARZ3NDEKTSV4RRFFQ69G5FB0";
const TYPE = "01ARZ3NDEKTSV4RRFFQ69G5FB1";

describe("entropy-sharded node paths", () => {
  test("nodeShardDir skips the ULID timestamp prefix", () => {
    expect(nodeShardDir(ID)).toBe("NB");
    expect(nodeRelativePath(ID)).toBe("NB/01KWN86X6KNBWXKBG5EGFMQJXA.md");
    expect(nodeFileName(ID)).toBe("01KWN86X6KNBWXKBG5EGFMQJXA.md");
  });

  test("nodeFilePath nests under data/nodes or archive/nodes", () => {
    const root = "/tmp/content";
    expect(nodeFilePath(root, ID)).toBe(
      resolve(root, "data", "nodes", "NB", "01KWN86X6KNBWXKBG5EGFMQJXA.md"),
    );
    expect(nodeFilePath(root, ID, true)).toBe(
      resolve(root, "archive", "nodes", "NB", "01KWN86X6KNBWXKBG5EGFMQJXA.md"),
    );
  });

  test("listNodeIds walks live and archive node trees", () => {
    const root = mkdtempSync(resolve(tmpdir(), "shard-list-"));
    try {
      const other = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
      mkdirSync(resolve(root, "data", "nodes", "NB"), { recursive: true });
      mkdirSync(resolve(root, "archive", "nodes", "TS"), { recursive: true });
      writeFileSync(resolve(root, "data", "nodes", "NB", `${ID}.md`), "---\ntitle: A\n---\n", "utf-8");
      writeFileSync(resolve(root, "archive", "nodes", "TS", `${other}.md`), "---\ntitle: B\n---\n", "utf-8");

      const store = new ContentStore(root);
      const ids = store.listNodeIds().sort();
      expect(ids).toEqual([ID, other].sort());
      expect(store.readNode(ID)?.properties.title).toBe("A");
      expect(store.readNode(other)?.properties.title).toBe("B");
      expect(store.isNodeFileArchived(other)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("writeNode creates the live shard directory", () => {
    const root = mkdtempSync(resolve(tmpdir(), "shard-write-"));
    try {
      const store = new ContentStore(root);
      store.writeNode(
        { id: ID, properties: { title: "Sharded" } },
        "body",
      );
      expect(store.listNodeIds()).toEqual([ID]);
      expect(existsSync(nodeFilePath(root, ID, false))).toBe(true);
      expect(store.readNode(ID)?.properties.title).toBe("Sharded");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("relationship hash paths", () => {
  test("digest is stable and order-sensitive", () => {
    const d1 = relationshipDigest(A, B, TYPE);
    const d2 = relationshipDigest(A, B, TYPE);
    const swapped = relationshipDigest(B, A, TYPE);
    expect(d1).toBe(d2);
    expect(d1).toHaveLength(64);
    expect(d1).not.toBe(swapped);
    expect(relationshipRelativePath(A, B, TYPE)).toBe(`${d1.slice(0, 2)}/${d1.slice(2)}.json`);
  });

  test("upsert writes under data/relationships; archive moves to archive/relationships", () => {
    const root = mkdtempSync(resolve(tmpdir(), "rel-shard-"));
    try {
      const store = new ContentStore(root);
      store.writeAssociationsFile({
        version: 1,
        associations: {
          [TYPE]: { perspectives: ["From", "To"] },
        },
      });
      store.upsertRelationship(A, B, TYPE, { ordinal: 1 });
      const path = relationshipFilePath(root, A, B, TYPE, false);
      expect(path).toContain(`${resolve(root, "data", "relationships")}`);
      expect(existsSync(path)).toBe(true);

      store.moveRelationshipToArchive(A, B, TYPE);
      expect(existsSync(path)).toBe(false);
      expect(existsSync(relationshipFilePath(root, A, B, TYPE, true))).toBe(true);
      expect(store.readRelationshipsFile().relationships).toHaveLength(0);
      expect(store.readArchivedRelationships()).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("writeRelationshipsFile replaces live tree and optional archive", () => {
    const root = mkdtempSync(resolve(tmpdir(), "rel-bulk-"));
    try {
      const store = new ContentStore(root);
      store.writeRelationshipsFile(
        {
          version: RELATIONSHIPS_FILE_VERSION,
          relationships: [{ a: A, b: B, type: TYPE }],
        },
        {
          archivedEntries: [{ a: B, b: A, type: TYPE }],
        },
      );
      expect(store.readRelationshipsFile().relationships).toHaveLength(1);
      expect(store.readArchivedRelationships()).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
