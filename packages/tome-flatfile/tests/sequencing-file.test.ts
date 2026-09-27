import { describe, expect, test } from "bun:test";
import {
  emptySequencingFile,
  parseSequencingFile,
  serializeSequencingFile,
} from "../src/sequencing/sequencing-file";

describe("sequencing.json", () => {
  test("round-trips empty file", () => {
    const empty = emptySequencingFile();
    const parsed = parseSequencingFile(serializeSequencingFile(empty));
    expect(parsed).toEqual(empty);
  });

  test("parses table config", () => {
    const raw = serializeSequencingFile({
      version: 1,
      tables: {
        "01KWN86X6MFZQAJ1V36T9592A9": {
          dependsRelationshipType: "01KXBNPNJDENZ9BXN5BYZ7JKPD",
          defaultDuration: 1,
          durationQuery: null,
          parallelQuery: null,
        },
      },
    });
    const file = parseSequencingFile(raw);
    expect(file.tables["01KWN86X6MFZQAJ1V36T9592A9"]?.dependsRelationshipType).toBe(
      "01KXBNPNJDENZ9BXN5BYZ7JKPD",
    );
  });

  test("accepts legacy dependsAssociation / containmentAssociation keys", () => {
    const raw = JSON.stringify({
      version: 1,
      tables: {
        "01KWN86X6MFZQAJ1V36T9592A9": {
          dependsAssociation: "01KXBNPNJDENZ9BXN5BYZ7JKPD",
          containmentAssociation: null,
          defaultDuration: 1,
        },
      },
    });
    const file = parseSequencingFile(raw);
    const table = file.tables["01KWN86X6MFZQAJ1V36T9592A9"];
    expect(table?.dependsRelationshipType).toBe("01KXBNPNJDENZ9BXN5BYZ7JKPD");
    expect(table?.containmentRelationshipType).toBeNull();
    const serialized = JSON.parse(serializeSequencingFile(file)) as {
      tables: Record<string, Record<string, unknown>>;
    };
    expect(serialized.tables["01KWN86X6MFZQAJ1V36T9592A9"]?.dependsRelationshipType).toBe(
      "01KXBNPNJDENZ9BXN5BYZ7JKPD",
    );
    expect(serialized.tables["01KWN86X6MFZQAJ1V36T9592A9"]?.dependsAssociation).toBeUndefined();
  });
});
