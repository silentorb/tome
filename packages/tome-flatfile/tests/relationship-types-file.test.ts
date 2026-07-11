import { describe, expect, test } from "bun:test";
import {
  emptyRelationshipTypesFile,
  parseRelationshipTypesFile,
  serializeRelationshipTypesFile,
} from "../src/content/relationship-types-file";

describe("relationship-types-file traits", () => {
  test("parses flag trait string", () => {
    const file = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        types: {
          member_of: {
            perspectives: ["members", "member_of"],
            traits: ["set"],
          },
        },
      }),
    );
    expect(file.types.member_of?.traits).toEqual(["set"]);
  });

  test("parses configured trait object with key", () => {
    const file = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        types: {
          member_of: {
            perspectives: ["members", "member_of"],
            traits: [{ key: "set", parentIndex: 0, childIndex: 1 }],
          },
        },
      }),
    );
    expect(file.types.member_of?.traits).toEqual([{ key: "set", parentIndex: 0, childIndex: 1 }]);
  });

  test("parses multiple traits", () => {
    const file = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        types: {
          ordered_member_of: {
            perspectives: ["ordered_members", "ordered_member_of"],
            traits: ["set", "ordered"],
          },
        },
      }),
    );
    expect(file.types.ordered_member_of?.traits).toEqual(["set", "ordered"]);
  });

  test("round-trips traits through serialize", () => {
    const file = emptyRelationshipTypesFile();
    file.types.member_of = {
      perspectives: ["members", "member_of"],
      traits: ["set"],
      perspectiveLabels: {
        member_of: { title: "Membership", linkAdd: "Link type table" },
      },
    };
    const roundTrip = parseRelationshipTypesFile(serializeRelationshipTypesFile(file));
    expect(roundTrip.types.member_of).toEqual(file.types.member_of);
  });

  test("rejects duplicate trait names", () => {
    expect(() =>
      parseRelationshipTypesFile(
        JSON.stringify({
          version: 1,
          types: {
            member_of: { perspectives: ["members", "member_of"], traits: ["set", "set"] },
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
          types: {
            member_of: {
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
      parseRelationshipTypesFile(
        JSON.stringify({
          version: 1,
          types: { member_of: { perspectives: ["members", "member_of"], traits: { set: true } } },
        }),
      ),
    ).toThrow(/must be an array/);
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

  test("parses perspectiveLabels linkExisting", () => {
    const file = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        types: {
          scenes_part: {
            perspectives: ["scenes", "part"],
            perspectiveLabels: {
              part: { title: "Part", linkExisting: false },
            },
          },
        },
      }),
    );
    expect(file.types.scenes_part?.perspectiveLabels?.part).toEqual({
      title: "Part",
      linkExisting: false,
    });
  });

  test("rejects non-boolean perspectiveLabels linkExisting", () => {
    expect(() =>
      parseRelationshipTypesFile(
        JSON.stringify({
          version: 1,
          types: {
            scenes_part: {
              perspectives: ["scenes", "part"],
              perspectiveLabels: { part: { title: "Part", linkExisting: "no" } },
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
        types: {
          parents_children: {
            perspectives: ["children", "parents"],
            linkExisting: false,
          },
        },
      }),
    );
    expect(file.types.parents_children?.linkExisting).toBe(false);
  });

  test("round-trips composite and perspective linkExisting through serialize", () => {
    const file = emptyRelationshipTypesFile();
    file.types.parents_children = {
      perspectives: ["children", "parents"],
      linkExisting: false,
      perspectiveLabels: {
        parents: { title: "Parents", linkExisting: true },
      },
    };
    const roundTrip = parseRelationshipTypesFile(serializeRelationshipTypesFile(file));
    expect(roundTrip.types.parents_children).toEqual(file.types.parents_children);
  });

  test("rejects non-boolean composite linkExisting", () => {
    expect(() =>
      parseRelationshipTypesFile(
        JSON.stringify({
          version: 1,
          types: {
            parents_children: {
              perspectives: ["children", "parents"],
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
        types: {
          inspirations_features: {
            perspectives: ["features", "inspirations"],
            endpoints: {
              0: { typeId: featuresTypeId },
              1: { typeId: inspirationsTypeId },
            },
          },
        },
      }),
    );
    expect(file.types.inspirations_features?.endpoints).toEqual({
      0: { typeId: featuresTypeId },
      1: { typeId: inspirationsTypeId },
    });
  });

  test("round-trips endpoints through serialize", () => {
    const file = emptyRelationshipTypesFile();
    file.types.inspirations_features = {
      perspectives: ["features", "inspirations"],
      endpoints: {
        0: { typeId: featuresTypeId },
        1: { typeId: inspirationsTypeId },
      },
    };
    const roundTrip = parseRelationshipTypesFile(serializeRelationshipTypesFile(file));
    expect(roundTrip.types.inspirations_features?.endpoints).toEqual(
      file.types.inspirations_features.endpoints,
    );
  });

  test("rejects endpoint with invalid typeId", () => {
    expect(() =>
      parseRelationshipTypesFile(
        JSON.stringify({
          version: 1,
          types: {
            bad: {
              perspectives: ["a", "b"],
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
