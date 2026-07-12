import { describe, expect, test } from "bun:test";
import {
  AmbiguousAssociationError,
  emptyAssociationsFile,
  parseAssociationsFile,
  resolveAssociationId,
  serializeAssociationsFile,
  UnknownPerspectiveError,
} from "../src/content/associations-file";

/** Stable ULID association ids for inline fixtures (match tome-db test helpers). */
const MEMBER_OF = "000000000000000000000000A1";
const ORDERED_MEMBER_OF = "000000000000000000000000A2";
const SCENES_PART = "000000000000000000000000A4";
const PARENTS_CHILDREN = "000000000000000000000000B1";
const INSPIRATIONS_FEATURES = "000000000000000000000000B2";
const INCLUDES = "000000000000000000000000B3";
const CHILDREN_CHILDREN = "000000000000000000000000B4";

describe("associations-file traits", () => {
  test("parses flag trait string", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [MEMBER_OF]: {
            perspectives: ["members", "member_of"],
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
            perspectives: ["members", "member_of"],
            traits: [{ key: "set", parentIndex: 0, childIndex: 1 }],
          },
        },
      }),
    );
    expect(file.associations[MEMBER_OF]?.traits).toEqual([{ key: "set", parentIndex: 0, childIndex: 1 }]);
  });

  test("parses multiple traits", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [ORDERED_MEMBER_OF]: {
            perspectives: ["ordered_members", "ordered_member_of"],
            traits: ["set", "ordered"],
          },
        },
      }),
    );
    expect(file.associations[ORDERED_MEMBER_OF]?.traits).toEqual(["set", "ordered"]);
  });

  test("round-trips traits through serialize", () => {
    const file = emptyAssociationsFile();
    file.associations[MEMBER_OF] = {
      perspectives: ["members", "member_of"],
      traits: ["set"],
      perspectiveLabels: {
        member_of: { title: "Membership", linkAdd: "Link type table" },
      },
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
            [MEMBER_OF]: { perspectives: ["members", "member_of"], traits: ["set", "set"] },
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
              perspectives: ["members", "member_of"],
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
            [MEMBER_OF]: { perspectives: ["members", "member_of"], traits: { set: true } },
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
            member_of: { perspectives: ["members", "member_of"], traits: ["set"] },
          },
        }),
      ),
    ).toThrow(/must be a ULID/);
  });
});

describe("associations-file perspectiveLabels", () => {
  test("parses string shorthand perspectiveLabels", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [MEMBER_OF]: {
            perspectives: ["members", "member_of"],
            perspectiveLabels: { member_of: "Membership" },
          },
        },
      }),
    );
    expect(file.associations[MEMBER_OF]?.perspectiveLabels).toEqual({
      member_of: "Membership",
    });
  });

  test("parses object perspectiveLabels with title and linkAdd", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [MEMBER_OF]: {
            perspectives: ["members", "member_of"],
            perspectiveLabels: {
              member_of: { title: "Membership", linkAdd: "Link type table" },
            },
          },
        },
      }),
    );
    expect(file.associations[MEMBER_OF]?.perspectiveLabels?.member_of).toEqual({
      title: "Membership",
      linkAdd: "Link type table",
    });
  });

  test("round-trips perspectiveLabels through serialize", () => {
    const file = emptyAssociationsFile();
    file.associations[MEMBER_OF] = {
      perspectives: ["members", "member_of"],
      perspectiveLabels: {
        member_of: { title: "Membership", linkAdd: "Link type table" },
      },
    };
    const roundTrip = parseAssociationsFile(serializeAssociationsFile(file));
    expect(roundTrip.associations[MEMBER_OF]).toEqual(file.associations[MEMBER_OF]);
  });

  test("parses perspectiveLabels linkExisting", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [SCENES_PART]: {
            perspectives: ["scenes", "part"],
            perspectiveLabels: {
              part: { title: "Part", linkExisting: false },
            },
          },
        },
      }),
    );
    expect(file.associations[SCENES_PART]?.perspectiveLabels?.part).toEqual({
      title: "Part",
      linkExisting: false,
    });
  });

  test("rejects non-boolean perspectiveLabels linkExisting", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: {
            [SCENES_PART]: {
              perspectives: ["scenes", "part"],
              perspectiveLabels: { part: { title: "Part", linkExisting: "no" } },
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
            perspectives: ["children", "parents"],
            linkExisting: false,
          },
        },
      }),
    );
    expect(file.associations[PARENTS_CHILDREN]?.linkExisting).toBe(false);
  });

  test("round-trips composite and perspective linkExisting through serialize", () => {
    const file = emptyAssociationsFile();
    file.associations[PARENTS_CHILDREN] = {
      perspectives: ["children", "parents"],
      linkExisting: false,
      perspectiveLabels: {
        parents: { title: "Parents", linkExisting: true },
      },
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
              perspectives: ["children", "parents"],
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
            perspectives: ["features", "inspirations"],
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
      perspectives: ["features", "inspirations"],
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
              perspectives: ["a", "b"],
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
    file.associations[INCLUDES] = { perspectives: ["includes", "includes"] };
    const serialized = serializeAssociationsFile(file);
    expect(serialized).not.toContain("bidirectional");
  });

  test("a legacy bidirectional key on input is ignored", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [INCLUDES]: { bidirectional: false, perspectives: ["includes", "includes"] },
        },
      }),
    );
    expect(file.associations[INCLUDES]).toEqual({ perspectives: ["includes", "includes"] });
    expect("bidirectional" in (file.associations[INCLUDES] ?? {})).toBe(false);
  });

  test("rejects a type with fewer than two perspectives", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: { [SCENES_PART]: { perspectives: ["scenes"] } },
        }),
      ),
    ).toThrow(/exactly two perspectives/);
  });

  test("rejects a type with more than two perspectives", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: { [PARENTS_CHILDREN]: { perspectives: ["a", "b", "c"] } },
        }),
      ),
    ).toThrow(/exactly two perspectives/);
  });
});

describe("resolveAssociationId fail-closed", () => {
  test("returns the sole association for a unique perspective", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [MEMBER_OF]: { perspectives: ["members", "member_of"], traits: ["set"] },
        },
      }),
    );
    expect(resolveAssociationId(file, "member_of")).toBe(MEMBER_OF);
    expect(resolveAssociationId(file, "members")).toBe(MEMBER_OF);
  });

  test("throws UnknownPerspectiveError when no association matches", () => {
    const file = emptyAssociationsFile();
    expect(() => resolveAssociationId(file, "member_of")).toThrow(UnknownPerspectiveError);
  });

  test("throws AmbiguousAssociationError when multiple associations share a perspective", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [PARENTS_CHILDREN]: { perspectives: ["children", "parents"] },
          [CHILDREN_CHILDREN]: { perspectives: ["children", "children"] },
        },
      }),
    );
    expect(() => resolveAssociationId(file, "children")).toThrow(AmbiguousAssociationError);
  });

  test("disambiguates with otherLocalType when the pair is unique", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          [PARENTS_CHILDREN]: { perspectives: ["children", "parents"] },
          [CHILDREN_CHILDREN]: { perspectives: ["children", "children"] },
        },
      }),
    );
    expect(resolveAssociationId(file, "children", "parents")).toBe(PARENTS_CHILDREN);
    expect(resolveAssociationId(file, "children", "children")).toBe(CHILDREN_CHILDREN);
  });
});
