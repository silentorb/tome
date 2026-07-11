import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ContentStore } from "../../src/content/store";
import {
  nodeFileName,
  nodeFilePath,
  nodeRelativePath,
  nodeShardDir,
} from "../../src/content/paths";

const ID = "01KWN86X6KNBWXKBG5EGFMQJXA";

describe("entropy-sharded node paths", () => {
  test("nodeShardDir skips the ULID timestamp prefix", () => {
    expect(nodeShardDir(ID)).toBe("NB");
    expect(nodeRelativePath(ID)).toBe("NB/01KWN86X6KNBWXKBG5EGFMQJXA.md");
    expect(nodeFileName(ID)).toBe("01KWN86X6KNBWXKBG5EGFMQJXA.md");
  });

  test("nodeFilePath nests under the entropy shard", () => {
    const root = "/tmp/content";
    expect(nodeFilePath(root, ID)).toBe(
      resolve(root, "data", "NB", "01KWN86X6KNBWXKBG5EGFMQJXA.md"),
    );
  });

  test("listNodeIds walks shard directories", () => {
    const root = mkdtempSync(resolve(tmpdir(), "shard-list-"));
    try {
      const other = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
      mkdirSync(resolve(root, "data", "NB"), { recursive: true });
      mkdirSync(resolve(root, "data", "TS"), { recursive: true });
      writeFileSync(resolve(root, "data", "NB", `${ID}.md`), "---\ntitle: A\n---\n", "utf-8");
      writeFileSync(resolve(root, "data", "TS", `${other}.md`), "---\ntitle: B\n---\n", "utf-8");
      writeFileSync(resolve(root, "data", "relationships.json"), '{"version":3,"relationships":[]}\n', "utf-8");
      // Flat leftover must be ignored.
      writeFileSync(resolve(root, "data", "00000000000000000000000001.md"), "---\ntitle: flat\n---\n", "utf-8");

      const store = new ContentStore(root);
      const ids = store.listNodeIds().sort();
      expect(ids).toEqual([ID, other].sort());
      expect(store.readNode(ID)?.properties.title).toBe("A");
      expect(store.readNode(other)?.properties.title).toBe("B");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("writeNode creates the shard directory", () => {
    const root = mkdtempSync(resolve(tmpdir(), "shard-write-"));
    try {
      const store = new ContentStore(root);
      store.writeNode(
        { id: ID, properties: { title: "Sharded" } },
        "body",
      );
      expect(store.listNodeIds()).toEqual([ID]);
      expect(store.readNode(ID)?.properties.title).toBe("Sharded");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
