import { describe, expect, test } from "bun:test";
import {
  emptyExtensionsFile,
  parseExtensionsFile,
  resolveExtensionsManifest,
} from "../src/extensions";

describe("extensions.json", () => {
  test("missing file defaults to empty", () => {
    const file = emptyExtensionsFile();
    expect(file.extensions).toEqual([]);
    expect(file.components).toEqual([]);
  });

  test("resolve manifest filters disabled entries", () => {
    const file = parseExtensionsFile(
      JSON.stringify({
        extensions: [
          { id: "ext-a", enabled: true, htmlModule: "./html.ts" },
          { id: "ext-b", enabled: false },
        ],
        components: [
          {
            id: "a.block",
            extensionId: "ext-a",
            kind: "page-block",
            implementationId: "a",
            label: "A",
            enabled: true,
          },
          {
            id: "b.block",
            extensionId: "ext-b",
            kind: "page-block",
            implementationId: "b",
            label: "B",
            enabled: true,
          },
        ],
      }),
    );
    const manifest = resolveExtensionsManifest(file);
    expect(manifest.components.map((c) => c.id)).toEqual(["a.block"]);
  });
});
