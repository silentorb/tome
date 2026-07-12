import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { GraphDatabase } from "../src/graph";

const FEATURES_ASSOC = "000000000000000000000000B2";

describe("listDistinctRelationshipTypes", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-types-"));
  const db = new GraphDatabase(join(tempDir, "types.sqlite"));
  const nodeA = "0000000000000000000000001C";
  const nodeB = "0000000000000000000000001W";
  const nodeC = "00000000000000000000000028";

  db.upsertNode(nodeA, { title: "A" });
  db.upsertNode(nodeB, { title: "B" });
  db.upsertNode(nodeC, { title: "C" });
  db.upsertRelationship(nodeA, nodeB, `${FEATURES_ASSOC}:0`);
  db.upsertRelationship(nodeA, nodeC, `${FEATURES_ASSOC}:1`);
  db.upsertRelationship(nodeB, nodeC, `${FEATURES_ASSOC}:0`);

  test("returns sorted unique projection types", () => {
    const types = db.listDistinctRelationshipTypes();
    expect(types).toEqual([`${FEATURES_ASSOC}:0`, `${FEATURES_ASSOC}:1`]);
  });

  afterAll(() => {
    db.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
});
