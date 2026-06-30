import { describe, expect, test } from "bun:test";
import { emptyRelationshipTypesFile } from "../src/content/relationship-types-file";
import {
  formatRelationshipTypeLabel,
  perspectiveDisplayLabel,
  perspectiveLinkAddLabel,
} from "../src/relationship-type-label";

describe("relationship-type-label", () => {
  test("formatRelationshipTypeLabel title-cases underscore slugs", () => {
    expect(formatRelationshipTypeLabel("member_of")).toBe("Member Of");
  });

  test("perspectiveDisplayLabel uses configured title", () => {
    const registry = emptyRelationshipTypesFile();
    registry.types.member_of = {
      bidirectional: true,
      perspectives: ["member_of", "members"],
      perspectiveLabels: { member_of: "Membership" },
    };
    expect(perspectiveDisplayLabel(registry, "member_of")).toBe("Membership");
  });

  test("perspectiveDisplayLabel falls back when unconfigured", () => {
    expect(perspectiveDisplayLabel(emptyRelationshipTypesFile(), "features")).toBe("Features");
  });

  test("perspectiveLinkAddLabel uses configured linkAdd", () => {
    const registry = emptyRelationshipTypesFile();
    registry.types.member_of = {
      bidirectional: true,
      perspectives: ["member_of", "members"],
      perspectiveLabels: {
        member_of: { title: "Membership", linkAdd: "Link type table" },
      },
    };
    expect(perspectiveLinkAddLabel(registry, "member_of", "Membership")).toBe("Link type table");
  });

  test("perspectiveLinkAddLabel falls back to singularized section title", () => {
    expect(perspectiveLinkAddLabel(emptyRelationshipTypesFile(), "features", "Features")).toBe(
      "Link Feature",
    );
  });
});
