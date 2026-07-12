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
      "000000000000000000000000B2": {
        perspectives: ["features", "inspirations"],
      },
    });
    expect(relationSectionSupportsLinkExisting(registry, "features")).toBe(true);
    expect(
      relationSectionSupportsLinkExisting(registry, "features", "000000000000000000000000B2"),
    ).toBe(true);
  });

  test("returns false for an unregistered perspective", () => {
    const registry = emptyAssociationsFile();
    expect(relationSectionSupportsLinkExisting(registry, "unknown")).toBe(false);
  });

  test("honors composite-level linkExisting false", () => {
    const registry = registryWithTypes({
      "000000000000000000000000B1": {
        perspectives: ["children", "parents"],
        linkExisting: false,
      },
    });
    expect(
      relationSectionSupportsLinkExisting(registry, "children", "000000000000000000000000B1"),
    ).toBe(false);
    expect(
      relationSectionSupportsLinkExisting(registry, "parents", "000000000000000000000000B1"),
    ).toBe(false);
  });

  test("honors per-perspective linkExisting override over composite default", () => {
    const registry = registryWithTypes({
      "000000000000000000000000B1": {
        perspectives: ["children", "parents"],
        linkExisting: false,
        perspectiveLabels: {
          parents: { title: "Parents", linkExisting: true },
        },
      },
    });
    expect(
      relationSectionSupportsLinkExisting(registry, "children", "000000000000000000000000B1"),
    ).toBe(false);
    expect(
      relationSectionSupportsLinkExisting(registry, "parents", "000000000000000000000000B1"),
    ).toBe(true);
  });

  test("disambiguates children across composites via compositeType", () => {
    const registry = registryWithTypes({
      "000000000000000000000000B1": {
        perspectives: ["children", "parents"],
        linkExisting: false,
      },
      "000000000000000000000000B4": {
        perspectives: ["children", "children"],
      },
    });
    expect(
      relationSectionSupportsLinkExisting(registry, "children", "000000000000000000000000B1"),
    ).toBe(false);
    expect(
      relationSectionSupportsLinkExisting(registry, "children", "000000000000000000000000B4"),
    ).toBe(true);
  });

  test("falls back to first registry match when compositeType is omitted", () => {
    const registry = registryWithTypes({
      "000000000000000000000000B1": {
        perspectives: ["children", "parents"],
        linkExisting: false,
      },
      "000000000000000000000000B4": {
        perspectives: ["children", "children"],
      },
    });
    expect(relationSectionSupportsLinkExisting(registry, "children")).toBe(false);
  });
});
