import { describe, expect, test } from "bun:test";
import { emptyAssociationsFile } from "tome-flatfile";
import {
  formatAssociationLabel,
  perspectiveDisplayLabel,
  perspectiveLinkAddLabel,
} from "../src/association-label";

describe("association-label", () => {
  test("formatAssociationLabel title-cases underscore slugs", () => {
    expect(formatAssociationLabel("member_of")).toBe("Member Of");
  });

  test("perspectiveDisplayLabel uses configured title", () => {
    const registry = emptyAssociationsFile();
    registry.associations.member_of = {
      perspectives: ["member_of", "members"],
      perspectiveLabels: { member_of: "Membership" },
    };
    expect(perspectiveDisplayLabel(registry, "member_of")).toBe("Membership");
  });

  test("perspectiveDisplayLabel falls back when unconfigured", () => {
    expect(perspectiveDisplayLabel(emptyAssociationsFile(), "features")).toBe("Features");
  });

  test("perspectiveLinkAddLabel uses configured linkAdd", () => {
    const registry = emptyAssociationsFile();
    registry.associations.member_of = {
      perspectives: ["member_of", "members"],
      perspectiveLabels: {
        member_of: { title: "Membership", linkAdd: "Link type table" },
      },
    };
    expect(perspectiveLinkAddLabel(registry, "member_of", "Membership")).toBe("Link type table");
  });

  test("perspectiveLinkAddLabel falls back to singularized section title", () => {
    expect(perspectiveLinkAddLabel(emptyAssociationsFile(), "features", "Features")).toBe(
      "Link Feature",
    );
  });
});
