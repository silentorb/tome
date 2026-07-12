import { describe, expect, test } from "bun:test";
import {
  UnknownAssociationError,
  emptyAssociationsFile,
  parseAssociationsFile,
  parseProjectionType,
  projectionTypeForEndpoint,
  requireAssociationId,
  serializeAssociationsFile,
} from "../src/content/associations-file";

/** Stable ULID association ids for inline fixtures (match tome-db test helpers). */
const MEMBER_OF = "000000000000000000000000A1";
const ORDERED_MEMBER_OF = "000000000000000000000000A2";
const SCENES_PART = "000000000000000000000000A4";
const PARENTS_CHILDREN = "000000000000000000000000B1";
const INSPIRATIONS_FEATURES = "000000000000000000000000B2";
const INCLUDES = "000000000000000000000000B3";

describe("associations-file traits", () => {
  test("parses flag trait string", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [MEMBER_OF]: {
            perspectives: ["Members", "Membership"],
            traits: ["set"],
          },
        },
      }),
    );
    expect(file.associations[MEMBER_OF]?.traits).toEqual(["set"]);
  });

  test("parses configured trait object with key", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [MEMBER_OF]: {
            perspectives: ["Members", "Membership"],
            traits: [{ key: "set", parentIndex: 0, childIndex: 1 }],
          },
        },
      }),
    );
    expect(file.associations[MEMBER_OF]?.traits).toEqual([
      { key: "set", parentIndex: 0, childIndex: 1 },
    ]);
  });

  test("parses multiple traits", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [ORDERED_MEMBER_OF]: {
            perspectives: ["Ordered members", "Ordered membership"],
            traits: ["set", "ordered"],
          },
        },
      }),
    );
    expect(file.associations[ORDERED_MEMBER_OF]?.traits).toEqual(["set", "ordered"]);
  });

  test("round-trips traits and object perspective labels through serialize", () => {
    const file = emptyAssociationsFile();
    file.associations[MEMBER_OF] = {
      perspectives: [
        "Members",
        { title: "Membership", linkAdd: "Link type table" },
      ],
      traits: ["set"],
    };
    const roundTrip = parseAssociationsFile(serializeAssociationsFile(file));
    expect(roundTrip.associations[MEMBER_OF]).toEqual(file.associations[MEMBER_OF]);
  });

  test("rejects duplicate trait names", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: {
            [MEMBER_OF]: {
              perspectives: ["Members", "Membership"],
              traits: ["set", "set"],
            },
          },
        }),
      ),
    ).toThrow(/duplicate trait/);
  });

  test("rejects object trait without key", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: {
            [MEMBER_OF]: {
              perspectives: ["Members", "Membership"],
              traits: [{ parentIndex: 0 }],
            },
          },
        }),
      ),
    ).toThrow(/key must be a non-empty string/);
  });

  test("rejects traits object map (legacy shape)", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: {
            [MEMBER_OF]: {
              perspectives: ["Members", "Membership"],
              traits: { set: true },
            },
          },
        }),
      ),
    ).toThrow(/must be an array/);
  });

  test("rejects slug association keys", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: {
            member_of: { perspectives: ["Members", "Membership"], traits: ["set"] },
          },
        }),
      ),
    ).toThrow(/must be a ULID/);
  });

  test("rejects legacy perspectiveLabels key", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: {
            [MEMBER_OF]: {
              perspectives: ["Members", "Membership"],
              perspectiveLabels: { member_of: "Membership" },
            },
          },
        }),
      ),
    ).toThrow(/perspectiveLabels is removed/);
  });
});

describe("associations-file perspective label configs", () => {
  test("parses object perspective with title and linkAdd", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [MEMBER_OF]: {
            perspectives: [
              "Members",
              { title: "Membership", linkAdd: "Link type table" },
            ],
          },
        },
      }),
    );
    expect(file.associations[MEMBER_OF]?.perspectives[1]).toEqual({
      title: "Membership",
      linkAdd: "Link type table",
    });
  });

  test("parses perspective linkExisting", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [SCENES_PART]: {
            perspectives: ["Scenes", { title: "Part", linkExisting: false }],
          },
        },
      }),
    );
    expect(file.associations[SCENES_PART]?.perspectives[1]).toEqual({
      title: "Part",
      linkExisting: false,
    });
  });

  test("rejects non-boolean perspective linkExisting", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: {
            [SCENES_PART]: {
              perspectives: ["Scenes", { title: "Part", linkExisting: "no" }],
            },
          },
        }),
      ),
    ).toThrow(/linkExisting must be a boolean/);
  });
});

describe("associations-file linkExisting", () => {
  test("parses composite-level linkExisting", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [PARENTS_CHILDREN]: {
            perspectives: ["Children", "Parents"],
            linkExisting: false,
          },
        },
      }),
    );
    expect(file.associations[PARENTS_CHILDREN]?.linkExisting).toBe(false);
  });

  test("round-trips composite and per-endpoint linkExisting through serialize", () => {
    const file = emptyAssociationsFile();
    file.associations[PARENTS_CHILDREN] = {
      perspectives: ["Children", { title: "Parents", linkExisting: true }],
      linkExisting: false,
    };
    const roundTrip = parseAssociationsFile(serializeAssociationsFile(file));
    expect(roundTrip.associations[PARENTS_CHILDREN]).toEqual(file.associations[PARENTS_CHILDREN]);
  });

  test("rejects non-boolean composite linkExisting", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: {
            [PARENTS_CHILDREN]: {
              perspectives: ["Children", "Parents"],
              linkExisting: 0,
            },
          },
        }),
      ),
    ).toThrow(/linkExisting must be a boolean/);
  });
});

describe("associations-file endpoints", () => {
  const featuresTypeId = "0000000000000000000000002P";
  const inspirationsTypeId = "0000000000000000000000000K";

  test("parses endpoint type constraints", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [INSPIRATIONS_FEATURES]: {
            perspectives: ["Features", "Inspirations"],
            endpoints: {
              0: { typeId: featuresTypeId },
              1: { typeId: inspirationsTypeId },
            },
          },
        },
      }),
    );
    expect(file.associations[INSPIRATIONS_FEATURES]?.endpoints).toEqual({
      0: { typeId: featuresTypeId },
      1: { typeId: inspirationsTypeId },
    });
  });

  test("round-trips endpoints through serialize", () => {
    const file = emptyAssociationsFile();
    file.associations[INSPIRATIONS_FEATURES] = {
      perspectives: ["Features", "Inspirations"],
      endpoints: {
        0: { typeId: featuresTypeId },
        1: { typeId: inspirationsTypeId },
      },
    };
    const roundTrip = parseAssociationsFile(serializeAssociationsFile(file));
    expect(roundTrip.associations[INSPIRATIONS_FEATURES]?.endpoints).toEqual(
      file.associations[INSPIRATIONS_FEATURES].endpoints,
    );
  });

  test("rejects endpoint with invalid typeId", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: {
            [PARENTS_CHILDREN]: {
              perspectives: ["A", "B"],
              endpoints: { 0: { typeId: "not-a-node-id" }, 1: { typeId: featuresTypeId } },
            },
          },
        }),
      ),
    ).toThrow(/valid node id/);
  });
});

describe("associations-file bidirectional field removal", () => {
  test("serialization never emits a bidirectional field", () => {
    const file = emptyAssociationsFile();
    file.associations[INCLUDES] = { perspectives: ["Includes", "Includes"] };
    const serialized = serializeAssociationsFile(file);
    expect(serialized).not.toContain("bidirectional");
  });

  test("a legacy bidirectional key on input is ignored", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [INCLUDES]: { bidirectional: false, perspectives: ["Includes", "Includes"] },
        },
      }),
    );
    expect(file.associations[INCLUDES]).toEqual({ perspectives: ["Includes", "Includes"] });
    expect("bidirectional" in (file.associations[INCLUDES] ?? {})).toBe(false);
  });

  test("rejects a type with fewer than two perspectives", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: { [SCENES_PART]: { perspectives: ["Scenes"] } },
        }),
      ),
    ).toThrow(/exactly two perspectives/);
  });

  test("rejects a type with more than two perspectives", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: { [PARENTS_CHILDREN]: { perspectives: ["A", "B", "C"] } },
        }),
      ),
    ).toThrow(/exactly two perspectives/);
  });
});

describe("projection types and requireAssociationId", () => {
  test("projectionTypeForEndpoint encodes association ULID and endpoint index", () => {
    expect(projectionTypeForEndpoint(MEMBER_OF, 0)).toBe(`${MEMBER_OF}:0`);
    expect(projectionTypeForEndpoint(MEMBER_OF, 1)).toBe(`${MEMBER_OF}:1`);
    expect(parseProjectionType(`${MEMBER_OF}:1`)).toEqual({
      associationId: MEMBER_OF,
      endpointIndex: 1,
    });
  });

  test("requireAssociationId returns registered ids", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [MEMBER_OF]: { perspectives: ["Members", "Membership"], traits: ["set"] },
        },
      }),
    );
    expect(requireAssociationId(file, MEMBER_OF)).toBe(MEMBER_OF);
  });

  test("requireAssociationId throws UnknownAssociationError", () => {
    const file = emptyAssociationsFile();
    expect(() => requireAssociationId(file, MEMBER_OF)).toThrow(UnknownAssociationError);
  });
});
