import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { migrateRelationshipsToShards } from "../../src/migrations/relationships-to-shards";
import { ContentStore } from "../../src/content/store";
import { relationshipFilePath } from "../../src/content/paths";

const A = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const B = "01ARZ3NDEKTSV4RRFFQ69G5FB0";
const C = "01ARZ3NDEKTSV4RRFFQ69G5FB2";
const TYPE = "01ARZ3NDEKTSV4RRFFQ69G5FB1";

describe("migrateRelationshipsToShards", () => {
  test("splits live and archived entries into shard trees", () => {
    const root = mkdtempSync(resolve(tmpdir(), "rel-migrate-"));
    try {
      mkdirSync(resolve(root, "data"), { recursive: true });
      writeFileSync(
        resolve(root, "data", "relationships.json"),
        JSON.stringify({
          version: 3,
          relationships: [
            { a: A, b: B, type: TYPE, properties: { ordinal: 1 } },
            { a: A, b: C, type: TYPE, archived: true },
          ],
        }) + "\n",
        "utf-8",
      );

      const report = migrateRelationshipsToShards(root);
      expect(report.live).toBe(1);
      expect(report.archived).toBe(1);
      expect(existsSync(resolve(root, "data", "relationships.json"))).toBe(false);

      const store = new ContentStore(root);
      expect(store.readRelationshipsFile().relationships).toHaveLength(1);
      expect(store.readArchivedRelationships()).toHaveLength(1);
      const livePath = relationshipFilePath(root, A, B, TYPE, false);
      const raw = JSON.parse(readFileSync(livePath, "utf-8")) as Record<string, unknown>;
      expect(raw.archived).toBeUndefined();
      expect(raw.properties).toEqual({ ordinal: 1 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
