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
    expect(manifest.search).toBeNull();
  });

  test("single enabled searcher binds both roles when search is omitted", () => {
    const file = parseExtensionsFile(
      JSON.stringify({
        extensions: [
          { id: "search-a", enabled: true, searcherModule: "pkg/search" },
        ],
        components: [
          {
            id: "search-a.searcher",
            extensionId: "search-a",
            kind: "searcher",
            implementationId: "search-a",
            label: "A",
            enabled: true,
          },
        ],
      }),
    );
    const manifest = resolveExtensionsManifest(file);
    expect(manifest.search).toEqual({
      title: "search-a.searcher",
      content: "search-a.searcher",
    });
  });

  test("multiple searchers require explicit search role map", () => {
    const raw = JSON.stringify({
      extensions: [
        { id: "like", enabled: true, searcherModule: "like/search" },
        { id: "fts", enabled: true, searcherModule: "fts/search" },
      ],
      components: [
        {
          id: "like.searcher",
          extensionId: "like",
          kind: "searcher",
          implementationId: "like",
          label: "LIKE",
          enabled: true,
        },
        {
          id: "fts.searcher",
          extensionId: "fts",
          kind: "searcher",
          implementationId: "fts",
          label: "FTS",
          enabled: true,
        },
      ],
    });
    expect(() => resolveExtensionsManifest(parseExtensionsFile(raw))).toThrow(
      /search is required/,
    );

    const withMap = parseExtensionsFile(
      JSON.stringify({
        ...JSON.parse(raw),
        search: {
          title: "like.searcher",
          content: "fts.searcher",
        },
      }),
    );
    expect(resolveExtensionsManifest(withMap).search).toEqual({
      title: "like.searcher",
      content: "fts.searcher",
    });
  });

  test("search role map rejects unknown component ids", () => {
    expect(() =>
      resolveExtensionsManifest(
        parseExtensionsFile(
          JSON.stringify({
            search: { title: "missing.searcher", content: "missing.searcher" },
            extensions: [],
            components: [],
          }),
        ),
      ),
    ).toThrow(/not an enabled searcher/);
  });
});
