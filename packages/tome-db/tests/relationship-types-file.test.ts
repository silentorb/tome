import { describe, expect, test } from "bun:test";
import {
  emptyRelationshipTypesFile,
  parseRelationshipTypesFile,
  serializeRelationshipTypesFile,
} from "../src/content/relationship-types-file";

describe("relationship-types-file traits", () => {
  test("parses flag trait", () => {
    const file = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        types: {
          member_of: {
            perspectives: ["members", "member_of"],
            traits: { set: true },
          },
        },
      }),
    );
    expect(file.types.member_of?.traits).toEqual({ set: true });
  });

  test("parses configured trait", () => {
    const file = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        types: {
          member_of: {
            perspectives: ["members", "member_of"],
            traits: { set: { parentIndex: 0, childIndex: 1 } },
          },
        },
      }),
    );
    expect(file.types.member_of?.traits?.set).toEqual({ parentIndex: 0, childIndex: 1 });
  });

  test("round-trips traits through serialize", () => {
    const file = emptyRelationshipTypesFile();
    file.types.member_of = {
      perspectives: ["members", "member_of"],
      traits: { set: true },
      perspectiveLabels: {
        member_of: { title: "Membership", linkAdd: "Link type table" },
      },
    };
    const roundTrip = parseRelationshipTypesFile(serializeRelationshipTypesFile(file));
    expect(roundTrip.types.member_of).toEqual(file.types.member_of);
  });

  test("rejects invalid trait values", () => {
    expect(() =>
      parseRelationshipTypesFile(
        JSON.stringify({
          version: 1,
          types: { member_of: { perspectives: ["members", "member_of"], traits: { set: "yes" } } },
        }),
      ),
    ).toThrow(/must be true or a plain object/);
  });
});

describe("relationship-types-file perspectiveLabels", () => {
  test("parses string shorthand perspectiveLabels", () => {
    const file = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        types: {
          member_of: {
            perspectives: ["members", "member_of"],
            perspectiveLabels: { member_of: "Membership" },
          },
        },
      }),
    );
    expect(file.types.member_of?.perspectiveLabels).toEqual({
      member_of: "Membership",
    });
  });

  test("parses object perspectiveLabels with title and linkAdd", () => {
    const file = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        types: {
          member_of: {
            perspectives: ["members", "member_of"],
            perspectiveLabels: {
              member_of: { title: "Membership", linkAdd: "Link type table" },
            },
          },
        },
      }),
    );
    expect(file.types.member_of?.perspectiveLabels?.member_of).toEqual({
      title: "Membership",
      linkAdd: "Link type table",
    });
  });

  test("round-trips perspectiveLabels through serialize", () => {
    const file = emptyRelationshipTypesFile();
    file.types.member_of = {
      perspectives: ["members", "member_of"],
      perspectiveLabels: {
        member_of: { title: "Membership", linkAdd: "Link type table" },
      },
    };
    const roundTrip = parseRelationshipTypesFile(serializeRelationshipTypesFile(file));
    expect(roundTrip.types.member_of).toEqual(file.types.member_of);
  });
});

describe("relationship-types-file bidirectional field removal", () => {
  test("serialization never emits a bidirectional field", () => {
    const file = emptyRelationshipTypesFile();
    file.types.includes = { perspectives: ["includes", "includes"] };
    const serialized = serializeRelationshipTypesFile(file);
    expect(serialized).not.toContain("bidirectional");
  });

  test("a legacy bidirectional key on input is ignored", () => {
    const file = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        types: {
          includes: { bidirectional: false, perspectives: ["includes", "includes"] },
        },
      }),
    );
    expect(file.types.includes).toEqual({ perspectives: ["includes", "includes"] });
    expect("bidirectional" in (file.types.includes ?? {})).toBe(false);
  });

  test("rejects a type with fewer than two perspectives", () => {
    expect(() =>
      parseRelationshipTypesFile(
        JSON.stringify({
          version: 1,
          types: { scenes: { perspectives: ["scenes"] } },
        }),
      ),
    ).toThrow(/exactly two perspectives/);
  });

  test("rejects a type with more than two perspectives", () => {
    expect(() =>
      parseRelationshipTypesFile(
        JSON.stringify({
          version: 1,
          types: { trio: { perspectives: ["a", "b", "c"] } },
        }),
      ),
    ).toThrow(/exactly two perspectives/);
  });
});
