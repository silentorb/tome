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
          dependsAssociation: "01KXBNPNJDENZ9BXN5BYZ7JKPD",
          defaultDuration: 1,
          trackProperty: "layer",
          durationQuery: null,
          parallelQuery: null,
        },
      },
    });
    const file = parseSequencingFile(raw);
    expect(file.tables["01KWN86X6MFZQAJ1V36T9592A9"]?.dependsAssociation).toBe(
      "01KXBNPNJDENZ9BXN5BYZ7JKPD",
    );
  });
});
