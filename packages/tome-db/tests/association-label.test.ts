import { describe, expect, test } from "bun:test";
import { emptyAssociationsFile, projectionTypeForEndpoint } from "tome-flatfile";
import {
  formatAssociationLabel,
  perspectiveDisplayLabel,
  perspectiveLinkAddLabel,
} from "../src/association-label";

const MEMBER_OF = "000000000000000000000000A1";

describe("association-label", () => {
  test("formatAssociationLabel title-cases underscore slugs", () => {
    expect(formatAssociationLabel("member_of")).toBe("Member Of");
  });

  test("perspectiveDisplayLabel uses configured title for projection type", () => {
    const registry = emptyAssociationsFile();
    registry.associations[MEMBER_OF] = {
      perspectives: [{ title: "Membership", linkAdd: "Link type table" }, "Members"],
    };
    expect(
      perspectiveDisplayLabel(registry, projectionTypeForEndpoint(MEMBER_OF, 0)),
    ).toBe("Membership");
  });

  test("perspectiveDisplayLabel falls back when unconfigured", () => {
    expect(perspectiveDisplayLabel(emptyAssociationsFile(), "features")).toBe("Features");
  });

  test("perspectiveLinkAddLabel uses configured linkAdd", () => {
    const registry = emptyAssociationsFile();
    registry.associations[MEMBER_OF] = {
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
    expect(perspectiveLinkAddLabel(emptyAssociationsFile(), "features", "Features")).toBe(
      "Link Feature",
    );
  });
});
