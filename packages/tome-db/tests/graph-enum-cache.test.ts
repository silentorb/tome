import { describe, expect, test, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  decodeEnumProperties,
  encodeEnumProperties,
  labelToEnumIndex,
} from "../src/enum-codec";
import { GraphDatabase } from "tome-sqlite";
import { loadWorkspaceSchema } from "tome-flatfile";
import { resolvePropertyEnum } from "tome-flatfile";

describe("GraphDatabase enum cache encoding", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-db-enum-cache-"));
  const dbPath = join(dir, "test.sqlite");

  test("stores enum indices in SQLite and returns labels via API", () => {
    const schema = loadWorkspaceSchema();
    const priorityEnum = resolvePropertyEnum("priority", schema);
    expect(priorityEnum).not.toBeNull();

    const db = new GraphDatabase(dbPath, {
      clean: true,
      propertyCodec: {
        encode: (properties) => encodeEnumProperties(properties, schema),
        decode: (properties) => decodeEnumProperties(properties, schema),
      },
    });
    const recordId = "AAAAAAAAAAAAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBBBBBB:is_a";

    db.upsertRelationshipRecord({
      id: recordId,
      nodeA: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
      nodeB: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
      compositeType: "000000000000000000000000A1",
      properties: { priority: "High", row_index: 4 },
    });

    const record = db.getRelationshipRecord(recordId);
    expect(record?.properties.priority).toBe("High");
    expect(record?.properties.row_index).toBe(4);

    const raw = db.queryAll<{ priority: number | null }>(
      "SELECT priority FROM relationship_records WHERE id = ?",
      recordId,
    )[0];
    const eav = db.queryAll<{ key: string; value: string }>(
      "SELECT key, value FROM relationship_record_properties WHERE record_id = ? ORDER BY key",
      recordId,
    );

    expect(raw?.priority).toBe(labelToEnumIndex(priorityEnum!, "High"));
    expect(eav).toEqual([{ key: "row_index", value: JSON.stringify(4) }]);

    db.close();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
});
