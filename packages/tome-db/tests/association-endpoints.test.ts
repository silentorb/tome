import { describe, expect, test } from "bun:test";
import {
  emptyAssociationsFile,
  projectionTypeForEndpoint,
  registerTypeDefinition,
} from "tome-flatfile";
import { relationSectionSupportsLinkExisting } from "../src/association-endpoints";

const FEATURES = "000000000000000000000000B2";
const PARENTS_CHILDREN = "000000000000000000000000B1";
const CHILDREN_CHILDREN = "000000000000000000000000B4";

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
  test("defaults to true for a registered projection type", () => {
    const registry = registryWithTypes({
      [FEATURES]: {
        perspectives: ["Features", "Inspirations"],
      },
    });
    expect(
      relationSectionSupportsLinkExisting(registry, projectionTypeForEndpoint(FEATURES, 0)),
    ).toBe(true);
    expect(
      relationSectionSupportsLinkExisting(
        registry,
        projectionTypeForEndpoint(FEATURES, 0),
        FEATURES,
      ),
    ).toBe(true);
  });

  test("returns false for an unregistered association", () => {
    const registry = emptyAssociationsFile();
    expect(relationSectionSupportsLinkExisting(registry, "unknown")).toBe(false);
  });

  test("honors composite-level linkExisting false", () => {
    const registry = registryWithTypes({
      [PARENTS_CHILDREN]: {
        perspectives: ["Children", "Parents"],
        linkExisting: false,
      },
    });
    expect(
      relationSectionSupportsLinkExisting(
        registry,
        projectionTypeForEndpoint(PARENTS_CHILDREN, 0),
        PARENTS_CHILDREN,
      ),
    ).toBe(false);
    expect(
      relationSectionSupportsLinkExisting(
        registry,
        projectionTypeForEndpoint(PARENTS_CHILDREN, 1),
        PARENTS_CHILDREN,
      ),
    ).toBe(false);
  });

  test("honors per-endpoint linkExisting override over composite default", () => {
    const registry = registryWithTypes({
      [PARENTS_CHILDREN]: {
        perspectives: ["Children", { title: "Parents", linkExisting: true }],
        linkExisting: false,
      },
    });
    expect(
      relationSectionSupportsLinkExisting(
        registry,
        projectionTypeForEndpoint(PARENTS_CHILDREN, 0),
        PARENTS_CHILDREN,
      ),
    ).toBe(false);
    expect(
      relationSectionSupportsLinkExisting(
        registry,
        projectionTypeForEndpoint(PARENTS_CHILDREN, 1),
        PARENTS_CHILDREN,
      ),
    ).toBe(true);
  });

  test("disambiguates via association id", () => {
    const registry = registryWithTypes({
      [PARENTS_CHILDREN]: {
        perspectives: ["Children", "Parents"],
        linkExisting: false,
      },
      [CHILDREN_CHILDREN]: {
        perspectives: ["Children", "Children"],
      },
    });
    expect(
      relationSectionSupportsLinkExisting(
        registry,
        projectionTypeForEndpoint(PARENTS_CHILDREN, 0),
        PARENTS_CHILDREN,
      ),
    ).toBe(false);
    expect(
      relationSectionSupportsLinkExisting(
        registry,
        projectionTypeForEndpoint(CHILDREN_CHILDREN, 0),
        CHILDREN_CHILDREN,
      ),
    ).toBe(true);
  });
});
