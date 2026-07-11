import { describe, expect, test } from "bun:test";
import {
  emptyAssociationsFile,
  parseAssociationsFile,
  serializeAssociationsFile,
} from "../src/content/associations-file";

describe("associations-file traits", () => {
  test("parses flag trait string", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          member_of: {
            perspectives: ["members", "member_of"],
            traits: ["set"],
          },
        },
      }),
    );
    expect(file.associations.member_of?.traits).toEqual(["set"]);
  });

  test("parses configured trait object with key", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          member_of: {
            perspectives: ["members", "member_of"],
            traits: [{ key: "set", parentIndex: 0, childIndex: 1 }],
          },
        },
      }),
    );
    expect(file.associations.member_of?.traits).toEqual([{ key: "set", parentIndex: 0, childIndex: 1 }]);
  });

  test("parses multiple traits", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          ordered_member_of: {
            perspectives: ["ordered_members", "ordered_member_of"],
            traits: ["set", "ordered"],
          },
        },
      }),
    );
    expect(file.associations.ordered_member_of?.traits).toEqual(["set", "ordered"]);
  });

  test("round-trips traits through serialize", () => {
    const file = emptyAssociationsFile();
    file.associations.member_of = {
      perspectives: ["members", "member_of"],
      traits: ["set"],
      perspectiveLabels: {
        member_of: { title: "Membership", linkAdd: "Link type table" },
      },
    };
    const roundTrip = parseAssociationsFile(serializeAssociationsFile(file));
    expect(roundTrip.associations.member_of).toEqual(file.associations.member_of);
  });

  test("rejects duplicate trait names", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: {
            member_of: { perspectives: ["members", "member_of"], traits: ["set", "set"] },
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
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: { member_of: { perspectives: ["members", "member_of"], traits: { set: true } } },
        }),
      ),
    ).toThrow(/must be an array/);
  });
});

describe("associations-file perspectiveLabels", () => {
  test("parses string shorthand perspectiveLabels", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          member_of: {
            perspectives: ["members", "member_of"],
            perspectiveLabels: { member_of: "Membership" },
          },
        },
      }),
    );
    expect(file.associations.member_of?.perspectiveLabels).toEqual({
      member_of: "Membership",
    });
  });

  test("parses object perspectiveLabels with title and linkAdd", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          member_of: {
            perspectives: ["members", "member_of"],
            perspectiveLabels: {
              member_of: { title: "Membership", linkAdd: "Link type table" },
            },
          },
        },
      }),
    );
    expect(file.associations.member_of?.perspectiveLabels?.member_of).toEqual({
      title: "Membership",
      linkAdd: "Link type table",
    });
  });

  test("round-trips perspectiveLabels through serialize", () => {
    const file = emptyAssociationsFile();
    file.associations.member_of = {
      perspectives: ["members", "member_of"],
      perspectiveLabels: {
        member_of: { title: "Membership", linkAdd: "Link type table" },
      },
    };
    const roundTrip = parseAssociationsFile(serializeAssociationsFile(file));
    expect(roundTrip.associations.member_of).toEqual(file.associations.member_of);
  });

  test("parses perspectiveLabels linkExisting", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          scenes_part: {
            perspectives: ["scenes", "part"],
            perspectiveLabels: {
              part: { title: "Part", linkExisting: false },
            },
          },
        },
      }),
    );
    expect(file.associations.scenes_part?.perspectiveLabels?.part).toEqual({
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

describe("associations-file linkExisting", () => {
  test("parses composite-level linkExisting", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          parents_children: {
            perspectives: ["children", "parents"],
            linkExisting: false,
          },
        },
      }),
    );
    expect(file.associations.parents_children?.linkExisting).toBe(false);
  });

  test("round-trips composite and perspective linkExisting through serialize", () => {
    const file = emptyAssociationsFile();
    file.associations.parents_children = {
      perspectives: ["children", "parents"],
      linkExisting: false,
      perspectiveLabels: {
        parents: { title: "Parents", linkExisting: true },
      },
    };
    const roundTrip = parseAssociationsFile(serializeAssociationsFile(file));
    expect(roundTrip.associations.parents_children).toEqual(file.associations.parents_children);
  });

  test("rejects non-boolean composite linkExisting", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: {
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

describe("associations-file endpoints", () => {
  const featuresTypeId = "0000000000000000000000002P";
  const inspirationsTypeId = "0000000000000000000000000K";

  test("parses endpoint type constraints", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
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
    expect(file.associations.inspirations_features?.endpoints).toEqual({
      0: { typeId: featuresTypeId },
      1: { typeId: inspirationsTypeId },
    });
  });

  test("round-trips endpoints through serialize", () => {
    const file = emptyAssociationsFile();
    file.associations.inspirations_features = {
      perspectives: ["features", "inspirations"],
      endpoints: {
        0: { typeId: featuresTypeId },
        1: { typeId: inspirationsTypeId },
      },
    };
    const roundTrip = parseAssociationsFile(serializeAssociationsFile(file));
    expect(roundTrip.associations.inspirations_features?.endpoints).toEqual(
      file.associations.inspirations_features.endpoints,
    );
  });

  test("rejects endpoint with invalid typeId", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: {
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

describe("associations-file bidirectional field removal", () => {
  test("serialization never emits a bidirectional field", () => {
    const file = emptyAssociationsFile();
    file.associations.includes = { perspectives: ["includes", "includes"] };
    const serialized = serializeAssociationsFile(file);
    expect(serialized).not.toContain("bidirectional");
  });

  test("a legacy bidirectional key on input is ignored", () => {
    const file = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          includes: { bidirectional: false, perspectives: ["includes", "includes"] },
        },
      }),
    );
    expect(file.associations.includes).toEqual({ perspectives: ["includes", "includes"] });
    expect("bidirectional" in (file.associations.includes ?? {})).toBe(false);
  });

  test("rejects a type with fewer than two perspectives", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: { scenes: { perspectives: ["scenes"] } },
        }),
      ),
    ).toThrow(/exactly two perspectives/);
  });

  test("rejects a type with more than two perspectives", () => {
    expect(() =>
      parseAssociationsFile(
        JSON.stringify({
          version: 1,
          associations: { trio: { perspectives: ["a", "b", "c"] } },
        }),
      ),
    ).toThrow(/exactly two perspectives/);
  });
});
