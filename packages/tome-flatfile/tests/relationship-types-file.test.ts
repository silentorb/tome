import { describe, expect, test } from "bun:test";
import {
  UnknownRelationshipTypeError,
  emptyRelationshipTypesFile,
  parseRelationshipTypesFile,
  parseProjectionType,
  projectionTypeForEndpoint,
  oppositeProjectionType,
  onlyActiveHostProjectionType,
  requireRelationshipTypeId,
  serializeRelationshipTypesFile,
} from "../src/content/relationship-types-file";

/** Stable ULID association ids for inline fixtures (match tome-db test helpers). */
const MEMBER_OF = "000000000000000000000000A1";
const ORDERED_MEMBER_OF = "000000000000000000000000A2";
const SCENES_PART = "000000000000000000000000A4";
const PARENTS_CHILDREN = "000000000000000000000000B1";
const INSPIRATIONS_FEATURES = "000000000000000000000000B2";
const INCLUDES = "000000000000000000000000B3";

describe("relationship-types-file traits", () => {
  test("parses flag trait string", () => {
    const file = parseRelationshipTypesFile(
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
    expect(file.relationshipTypes[MEMBER_OF]?.traits).toEqual(["set"]);
  });

  test("parses configured trait object with key", () => {
    const file = parseRelationshipTypesFile(
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
    expect(file.relationshipTypes[MEMBER_OF]?.traits).toEqual([
      { key: "set", parentIndex: 0, childIndex: 1 },
    ]);
  });

  test("parses multiple traits", () => {
    const file = parseRelationshipTypesFile(
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
    expect(file.relationshipTypes[ORDERED_MEMBER_OF]?.traits).toEqual(["set", "ordered"]);
  });

  test("round-trips traits and object role labels through serialize as roles+roleIds", () => {
    const file = emptyRelationshipTypesFile();
    file.relationshipTypes[MEMBER_OF] = {
      perspectives: [
        "Members",
        { title: "Membership", linkAdd: "Link type table" },
      ],
      roleIds: ["000000000000000000000000R1", "000000000000000000000000R2"],
      traits: ["set"],
    };
    const serialized = serializeRelationshipTypesFile(file);
    const onDisk = JSON.parse(serialized) as {
      associations?: Record<string, { roles?: unknown; perspectives?: unknown; roleIds?: string[] }>;
      relationshipTypes?: unknown;
    };
    expect(onDisk.associations).toBeDefined();
    expect(onDisk.relationshipTypes).toBeUndefined();
    expect(onDisk.associations?.[MEMBER_OF]?.roles).toEqual([
      "Members",
      { title: "Membership", linkAdd: "Link type table" },
    ]);
    expect(onDisk.associations?.[MEMBER_OF]?.perspectives).toBeUndefined();
    expect(onDisk.associations?.[MEMBER_OF]?.roleIds).toEqual([
      "000000000000000000000000R1",
      "000000000000000000000000R2",
    ]);
    const roundTrip = parseRelationshipTypesFile(serialized);
    expect(roundTrip.relationshipTypes[MEMBER_OF]).toEqual(file.relationshipTypes[MEMBER_OF]);
  });

  test("accepts legacy perspectives key and bridges missing roleIds", () => {
    const file = parseRelationshipTypesFile(
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
    expect(file.relationshipTypes[MEMBER_OF]?.perspectives).toEqual(["Members", "Membership"]);
    expect(file.relationshipTypes[MEMBER_OF]?.roleIds?.[0]).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(file.relationshipTypes[MEMBER_OF]?.roleIds?.[1]).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(file.relationshipTypes[MEMBER_OF]?.roleIds?.[0]).not.toBe(
      file.relationshipTypes[MEMBER_OF]?.roleIds?.[1],
    );
  });

  test("prefers roles over perspectives when both present", () => {
    const file = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        associations: {
          [MEMBER_OF]: {
            roles: ["RoleA", "RoleB"],
            perspectives: ["OldA", "OldB"],
            roleIds: ["000000000000000000000000R1", "000000000000000000000000R2"],
          },
        },
      }),
    );
    expect(file.relationshipTypes[MEMBER_OF]?.perspectives).toEqual(["RoleA", "RoleB"]);
    expect(file.relationshipTypes[MEMBER_OF]?.roleIds).toEqual([
      "000000000000000000000000R1",
      "000000000000000000000000R2",
    ]);
  });

  test("rejects duplicate trait names", () => {
    expect(() =>
      parseRelationshipTypesFile(
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
      parseRelationshipTypesFile(
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
      parseRelationshipTypesFile(
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
      parseRelationshipTypesFile(
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
      parseRelationshipTypesFile(
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

describe("relationship-types-file perspective label configs", () => {
  test("parses object perspective with title and linkAdd", () => {
    const file = parseRelationshipTypesFile(
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
    expect(file.relationshipTypes[MEMBER_OF]?.perspectives[1]).toEqual({
      title: "Membership",
      linkAdd: "Link type table",
    });
  });

  test("parses perspective linkExisting", () => {
    const file = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        associations: {
          [SCENES_PART]: {
            perspectives: ["Scenes", { title: "Part", linkExisting: false }],
          },
        },
      }),
    );
    expect(file.relationshipTypes[SCENES_PART]?.perspectives[1]).toEqual({
      title: "Part",
      linkExisting: false,
    });
  });

  test("rejects non-boolean perspective linkExisting", () => {
    expect(() =>
      parseRelationshipTypesFile(
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

describe("relationship-types-file linkExisting", () => {
  test("parses composite-level linkExisting", () => {
    const file = parseRelationshipTypesFile(
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
    expect(file.relationshipTypes[PARENTS_CHILDREN]?.linkExisting).toBe(false);
  });

  test("round-trips composite and per-endpoint linkExisting through serialize", () => {
    const file = emptyRelationshipTypesFile();
    file.relationshipTypes[PARENTS_CHILDREN] = {
      perspectives: ["Children", { title: "Parents", linkExisting: true }],
      roleIds: ["000000000000000000000000C0", "000000000000000000000000C1"],
      linkExisting: false,
    };
    const roundTrip = parseRelationshipTypesFile(serializeRelationshipTypesFile(file));
    expect(roundTrip.relationshipTypes[PARENTS_CHILDREN]).toEqual(file.relationshipTypes[PARENTS_CHILDREN]);
  });

  test("rejects non-boolean composite linkExisting", () => {
    expect(() =>
      parseRelationshipTypesFile(
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

describe("relationship-types-file endpoints", () => {
  const featuresTypeId = "0000000000000000000000002P";
  const inspirationsTypeId = "0000000000000000000000000K";

  test("parses endpoint type constraints", () => {
    const file = parseRelationshipTypesFile(
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
    expect(file.relationshipTypes[INSPIRATIONS_FEATURES]?.endpoints).toEqual({
      0: { typeId: featuresTypeId },
      1: { typeId: inspirationsTypeId },
    });
  });

  test("round-trips endpoints through serialize", () => {
    const file = emptyRelationshipTypesFile();
    file.relationshipTypes[INSPIRATIONS_FEATURES] = {
      perspectives: ["Features", "Inspirations"],
      endpoints: {
        0: { typeId: featuresTypeId },
        1: { typeId: inspirationsTypeId },
      },
    };
    const roundTrip = parseRelationshipTypesFile(serializeRelationshipTypesFile(file));
    expect(roundTrip.relationshipTypes[INSPIRATIONS_FEATURES]?.endpoints).toEqual(
      file.relationshipTypes[INSPIRATIONS_FEATURES].endpoints,
    );
  });

  test("rejects endpoint with invalid typeId", () => {
    expect(() =>
      parseRelationshipTypesFile(
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

describe("relationship-types-file bidirectional field removal", () => {
  test("serialization never emits a bidirectional field", () => {
    const file = emptyRelationshipTypesFile();
    file.relationshipTypes[INCLUDES] = { perspectives: ["Includes", "Includes"] };
    const serialized = serializeRelationshipTypesFile(file);
    expect(serialized).not.toContain("bidirectional");
  });

  test("a legacy bidirectional key on input is ignored", () => {
    const file = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        associations: {
          [INCLUDES]: { bidirectional: false, perspectives: ["Includes", "Includes"] },
        },
      }),
    );
    expect(file.relationshipTypes[INCLUDES]?.perspectives).toEqual(["Includes", "Includes"]);
    expect(file.relationshipTypes[INCLUDES]?.roleIds).toHaveLength(2);
    expect("bidirectional" in (file.relationshipTypes[INCLUDES] ?? {})).toBe(false);
  });

  test("rejects a type with fewer than two role labels", () => {
    expect(() =>
      parseRelationshipTypesFile(
        JSON.stringify({
          version: 1,
          associations: { [SCENES_PART]: { perspectives: ["Scenes"] } },
        }),
      ),
    ).toThrow(/exactly two perspectives/);
  });

  test("rejects a type with more than two role labels", () => {
    expect(() =>
      parseRelationshipTypesFile(
        JSON.stringify({
          version: 1,
          associations: { [PARENTS_CHILDREN]: { perspectives: ["A", "B", "C"] } },
        }),
      ),
    ).toThrow(/exactly two perspectives/);
  });
});

describe("projection types and requireRelationshipTypeId", () => {
  test("projectionTypeForEndpoint encodes relationship type ULID and endpoint index", () => {
    expect(projectionTypeForEndpoint(MEMBER_OF, 0)).toBe(`${MEMBER_OF}:0`);
    expect(projectionTypeForEndpoint(MEMBER_OF, 1)).toBe(`${MEMBER_OF}:1`);
    expect(parseProjectionType(`${MEMBER_OF}:1`)).toEqual({
      relationshipTypeId: MEMBER_OF,
      endpointIndex: 1,
    });
  });

  test("oppositeProjectionType and onlyActiveHostProjectionType flip endpoints", () => {
    const members = projectionTypeForEndpoint(MEMBER_OF, 0);
    const membership = projectionTypeForEndpoint(MEMBER_OF, 1);
    expect(oppositeProjectionType(membership)).toBe(members);
    expect(oppositeProjectionType(members)).toBe(membership);
    expect(onlyActiveHostProjectionType(membership, "target")).toBe(members);
    expect(onlyActiveHostProjectionType(members, "source")).toBe(members);
  });

  test("requireRelationshipTypeId returns registered ids", () => {
    const file = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        associations: {
          [MEMBER_OF]: { perspectives: ["Members", "Membership"], traits: ["set"] },
        },
      }),
    );
    expect(requireRelationshipTypeId(file, MEMBER_OF)).toBe(MEMBER_OF);
  });

  test("requireRelationshipTypeId throws UnknownRelationshipTypeError", () => {
    const file = emptyRelationshipTypesFile();
    expect(() => requireRelationshipTypeId(file, MEMBER_OF)).toThrow(UnknownRelationshipTypeError);
  });
});
