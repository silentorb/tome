import { describe, expect, test } from "bun:test";
import type { Node } from "tome-graph-interfaces";
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
  const id = "00000000000000000000000001";

  test("round-trips frontmatter and body", () => {
    const node: Node = {
      id,
      properties: {
        title: "Test Page",
        alias: "TP",
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
  const SCENES_PRODUCT = "000000000000000000000000A3";

  test("round-trips relationships preserving tuple order", () => {
    const raw = JSON.stringify({
      version: 3,
      relationships: [
        {
          a: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
          b: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
          type: SCENES_PRODUCT,
          properties: { ordinal: 1 },
        },
      ],
    });
    const parsed = parseRelationshipsFile(raw);
    expect(parsed.relationships).toHaveLength(1);
    const conn = relationshipFromEntry(parsed.relationships[0]!);
    // Directed view follows authored order: index 0 -> source, index 1 -> target.
    expect(conn.id).toBe(
      `AAAAAAAAAAAAAAAAAAAAAAAAAA:${SCENES_PRODUCT}:BBBBBBBBBBBBBBBBBBBBBBBBBB`,
    );
    expect(conn.sourceNodeId).toBe("AAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(conn.targetNodeId).toBe("BBBBBBBBBBBBBBBBBBBBBBBBBB");
    const entry = entryFromRelationship(conn);
    expect(entry.type).toBe(SCENES_PRODUCT);
    expect(entry.a).toBe("AAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(entry.b).toBe("BBBBBBBBBBBBBBBBBBBBBBBBBB");
  });

  test("rejects slug relationship types", () => {
    expect(() =>
      parseRelationshipsFile(
        JSON.stringify({
          version: 3,
          relationships: [
            {
              a: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
              b: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
              type: "scenes_product",
            },
          ],
        }),
      ),
    ).toThrow(/must be a ULID/);
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
          databaseId: "DDDDDDDDDDDDDDDDDDDDDDDDDD",
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
