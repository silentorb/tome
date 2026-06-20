import { describe, expect, test } from "bun:test";
import type { Node } from "../../src/graph";
import {
  relationshipFromEntry,
  entryFromRelationship,
  parseRelationshipsFile,
  serializeRelationshipsFile,
} from "../../src/content/relationships-file";
import {
  emptyDynamicFieldsFile,
  fieldRecordFromEntry,
  parseDynamicFieldsFile,
  serializeDynamicFieldsFile,
} from "../../src/content/dynamic-fields-file";
import { bodyFromNode, nodeFromFile, parseNodeFile, serializeNodeFile } from "../../src/content/node-file";

describe("node-file", () => {
  const id = "0123456789abcdef0123456789abcdef";

  test("round-trips frontmatter and body", () => {
    const node: Node = {
      id,
      properties: {
        title: "Test Page",
        alias: "TP",
        notion_id: id,
      },
    };
    const body = "# Hello\n\nParagraph.";
    const raw = serializeNodeFile(node, body);
    const parsed = parseNodeFile(id, raw);
    expect(parsed.properties.title).toBe("Test Page");
    expect(parsed.body.trimEnd()).toBe(body.trimEnd());

    const roundTrip = nodeFromFile(id, serializeNodeFile(
      { id, properties: parsed.properties },
      parsed.body,
    ));
    expect(roundTrip.properties.title).toBe("Test Page");
    expect(bodyFromNode(roundTrip).trimEnd()).toBe(body.trimEnd());
  });
});

describe("relationships-file", () => {
  test("round-trips relationships", () => {
    const raw = JSON.stringify({
      version: 1,
      relationships: [
        {
          source: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          target: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          label: "scenes",
          properties: { ordinal: 1 },
        },
      ],
    });
    const parsed = parseRelationshipsFile(raw);
    expect(parsed.relationships).toHaveLength(1);
    const conn = relationshipFromEntry(parsed.relationships[0]!);
    expect(conn.id).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:scenes:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(entryFromRelationship(conn).type).toBe("scenes");
  });
});

describe("dynamic-fields-file", () => {
  test("round-trips empty config", () => {
    const raw = serializeDynamicFieldsFile(emptyDynamicFieldsFile());
    const parsed = parseDynamicFieldsFile(raw);
    expect(parsed.fields).toEqual([]);
    expect(parsed.columnSets).toEqual([]);
  });

  test("maps field entry to record", () => {
    const file = {
      version: 1,
      fields: [
        {
          id: "test-field",
          databaseId: "dddddddddddddddddddddddddddddddd",
          columnKey: "count",
          columnName: "Count",
          columnType: "number",
          resolverId: "test.resolver",
          docsPath: "docs/dynamic-fields/test.md",
          enabled: true,
          params: { foo: "bar" },
          viewNames: ["All"],
        },
      ],
      columnSets: [],
    };
    const record = fieldRecordFromEntry(parseDynamicFieldsFile(serializeDynamicFieldsFile(file)).fields[0]!);
    expect(record.resolverId).toBe("test.resolver");
    expect(record.params.foo).toBe("bar");
  });
});
