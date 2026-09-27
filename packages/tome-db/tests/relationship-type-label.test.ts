import { describe, expect, test } from "bun:test";
import { emptyRelationshipTypesFile, projectionTypeForEndpoint } from "tome-flatfile";
import {
  formatRelationshipTypeLabel,
  labeledRelationshipTypes,
  perspectiveDisplayLabel,
  perspectiveLinkAddLabel,
} from "../src/relationship-type-label";

const MEMBER_OF = "000000000000000000000000A1";

describe("relationship-type-label", () => {
  test("formatRelationshipTypeLabel title-cases underscore slugs", () => {
    expect(formatRelationshipTypeLabel("member_of")).toBe("Member Of");
  });

  test("perspectiveDisplayLabel uses configured title for projection type", () => {
    const registry = emptyRelationshipTypesFile();
    registry.relationshipTypes[MEMBER_OF] = {
      perspectives: [{ title: "Membership", linkAdd: "Link type table" }, "Members"],
    };
    expect(
      perspectiveDisplayLabel(registry, projectionTypeForEndpoint(MEMBER_OF, 0)),
    ).toBe("Membership");
  });

  test("labeledRelationshipTypes maps projection types to perspective titles", () => {
    const registry = emptyRelationshipTypesFile();
    registry.relationshipTypes[MEMBER_OF] = {
      perspectives: [{ title: "Membership", linkAdd: "Link type table" }, "Members"],
    };
    expect(
      labeledRelationshipTypes(registry, [
        projectionTypeForEndpoint(MEMBER_OF, 0),
        projectionTypeForEndpoint(MEMBER_OF, 1),
      ]),
    ).toEqual([
      { type: projectionTypeForEndpoint(MEMBER_OF, 0), label: "Membership" },
      { type: projectionTypeForEndpoint(MEMBER_OF, 1), label: "Members" },
    ]);
  });

  test("perspectiveDisplayLabel falls back when unconfigured", () => {
    expect(perspectiveDisplayLabel(emptyRelationshipTypesFile(), "features")).toBe("Features");
  });

  test("perspectiveLinkAddLabel uses configured linkAdd", () => {
    const registry = emptyRelationshipTypesFile();
    registry.relationshipTypes[MEMBER_OF] = {
      perspectives: [{ title: "Membership", linkAdd: "Link type table" }, "Members"],
    };
    expect(
      perspectiveLinkAddLabel(
        registry,
        projectionTypeForEndpoint(MEMBER_OF, 0),
        "Membership",
      ),
    ).toBe("Link type table");
  });

  test("perspectiveLinkAddLabel falls back to singularized section title", () => {
    expect(perspectiveLinkAddLabel(emptyRelationshipTypesFile(), "features", "Features")).toBe(
      "Link Feature",
    );
  });
});
