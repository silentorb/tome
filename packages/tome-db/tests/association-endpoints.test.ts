import { describe, expect, test } from "bun:test";
import {
  emptyAssociationsFile,
  registerTypeDefinition,
} from "tome-flatfile";
import { relationSectionSupportsLinkExisting } from "../src/association-endpoints";

function registryWithTypes(
  types: Parameters<typeof registerTypeDefinition>[2] extends infer D
    ? Record<string, D>
    : never,
) {
  const file = emptyAssociationsFile();
  for (const [composite, def] of Object.entries(types)) {
    registerTypeDefinition(file, composite, def);
  }
  return file;
}

describe("relationSectionSupportsLinkExisting", () => {
  test("defaults to true for a registered perspective", () => {
    const registry = registryWithTypes({
      inspirations_features: {
        perspectives: ["features", "inspirations"],
      },
    });
    expect(relationSectionSupportsLinkExisting(registry, "features")).toBe(true);
    expect(
      relationSectionSupportsLinkExisting(registry, "features", "inspirations_features"),
    ).toBe(true);
  });

  test("returns false for an unregistered perspective", () => {
    const registry = emptyAssociationsFile();
    expect(relationSectionSupportsLinkExisting(registry, "unknown")).toBe(false);
  });

  test("honors composite-level linkExisting false", () => {
    const registry = registryWithTypes({
      parents_children: {
        perspectives: ["children", "parents"],
        linkExisting: false,
      },
    });
    expect(
      relationSectionSupportsLinkExisting(registry, "children", "parents_children"),
    ).toBe(false);
    expect(
      relationSectionSupportsLinkExisting(registry, "parents", "parents_children"),
    ).toBe(false);
  });

  test("honors per-perspective linkExisting override over composite default", () => {
    const registry = registryWithTypes({
      parents_children: {
        perspectives: ["children", "parents"],
        linkExisting: false,
        perspectiveLabels: {
          parents: { title: "Parents", linkExisting: true },
        },
      },
    });
    expect(
      relationSectionSupportsLinkExisting(registry, "children", "parents_children"),
    ).toBe(false);
    expect(
      relationSectionSupportsLinkExisting(registry, "parents", "parents_children"),
    ).toBe(true);
  });

  test("disambiguates children across composites via compositeType", () => {
    const registry = registryWithTypes({
      parents_children: {
        perspectives: ["children", "parents"],
        linkExisting: false,
      },
      children_children: {
        perspectives: ["children", "children"],
      },
    });
    expect(
      relationSectionSupportsLinkExisting(registry, "children", "parents_children"),
    ).toBe(false);
    expect(
      relationSectionSupportsLinkExisting(registry, "children", "children_children"),
    ).toBe(true);
  });

  test("falls back to first registry match when compositeType is omitted", () => {
    const registry = registryWithTypes({
      parents_children: {
        perspectives: ["children", "parents"],
        linkExisting: false,
      },
      children_children: {
        perspectives: ["children", "children"],
      },
    });
    expect(relationSectionSupportsLinkExisting(registry, "children")).toBe(false);
  });
});
