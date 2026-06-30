import { describe, expect, test } from "bun:test";
import {
  emptyRelationshipTypesFile,
  parseRelationshipTypesFile,
  serializeRelationshipTypesFile,
} from "../src/content/relationship-types-file";

describe("relationship-types-file perspectiveLabels", () => {
  test("parses string shorthand perspectiveLabels", () => {
    const file = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        types: {
          member_of: {
            perspectives: ["member_of", "members"],
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
            perspectives: ["member_of", "members"],
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
      bidirectional: true,
      perspectives: ["member_of", "members"],
      perspectiveLabels: {
        member_of: { title: "Membership", linkAdd: "Link type table" },
      },
    };
    const roundTrip = parseRelationshipTypesFile(serializeRelationshipTypesFile(file));
    expect(roundTrip.types.member_of).toEqual(file.types.member_of);
  });
});
