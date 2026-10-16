import { describe, expect, test } from "bun:test";
import {
  emptyExtensionsFile,
  parseExtensionsFile,
  resolveExtensionsManifest,
  resolvePageBlockRole,
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

  test("single authentication-provider binds on manifest", () => {
    const file = parseExtensionsFile(
      JSON.stringify({
        extensions: [
          {
            id: "tome-auth-oidc",
            enabled: true,
            authenticationModule: "tome-auth-oidc/authentication",
          },
        ],
        components: [
          {
            id: "tome-auth-oidc",
            extensionId: "tome-auth-oidc",
            kind: "authentication-provider",
            implementationId: "tome-auth-oidc",
            label: "OIDC",
            enabled: true,
            params: { issuer: "https://idp.example" },
          },
        ],
      }),
    );
    const manifest = resolveExtensionsManifest(file);
    expect(manifest.authenticationProvider?.id).toBe("tome-auth-oidc");
    expect(manifest.authenticationProvider?.params.issuer).toBe("https://idp.example");
    expect(manifest.authenticationProvider?.extension.authenticationModule).toBe(
      "tome-auth-oidc/authentication",
    );
  });

  test("multiple authentication-providers are rejected", () => {
    expect(() =>
      resolveExtensionsManifest(
        parseExtensionsFile(
          JSON.stringify({
            extensions: [
              { id: "a", enabled: true, authenticationModule: "a/auth" },
              { id: "b", enabled: true, authenticationModule: "b/auth" },
            ],
            components: [
              {
                id: "a",
                extensionId: "a",
                kind: "authentication-provider",
                implementationId: "a",
                label: "A",
                enabled: true,
              },
              {
                id: "b",
                extensionId: "b",
                kind: "authentication-provider",
                implementationId: "b",
                label: "B",
                enabled: true,
              },
            ],
          }),
        ),
      ),
    ).toThrow(/at most one authentication-provider/);
  });

  test("slashMenu is forbidden on authentication-provider", () => {
    expect(() =>
      parseExtensionsFile(
        JSON.stringify({
          extensions: [{ id: "a", enabled: true }],
          components: [
            {
              id: "a",
              extensionId: "a",
              kind: "authentication-provider",
              implementationId: "a",
              label: "A",
              enabled: true,
              slashMenu: { group: "x" },
            },
          ],
        }),
      ),
    ).toThrow(/slashMenu: not allowed/);
  });

  test("page-block roles default to [id] and resolvePageBlockRole picks first match", () => {
    const file = parseExtensionsFile(
      JSON.stringify({
        extensions: [
          { id: "tome-query", enabled: true, htmlModule: "tome-query/html" },
          { id: "alt-query", enabled: true, htmlModule: "alt/html" },
        ],
        components: [
          {
            id: "tome-query",
            extensionId: "tome-query",
            kind: "page-block",
            implementationId: "tome-query",
            label: "Query",
            enabled: true,
            roles: ["query"],
          },
          {
            id: "alt-query",
            extensionId: "alt-query",
            kind: "page-block",
            implementationId: "alt",
            label: "Alt",
            enabled: true,
            roles: ["query"],
          },
          {
            id: "spatial-graph",
            extensionId: "tome-query",
            kind: "page-block",
            implementationId: "spatial",
            label: "Spatial",
            enabled: true,
          },
        ],
      }),
    );
    const manifest = resolveExtensionsManifest(file);
    expect(manifest.components[0]?.roles).toEqual(["query"]);
    expect(manifest.components[2]?.roles).toEqual(["spatial-graph"]);
    expect(resolvePageBlockRole(manifest, "query")?.id).toBe("tome-query");
    expect(resolvePageBlockRole(manifest, "spatial-graph")?.id).toBe("spatial-graph");
    expect(resolvePageBlockRole(manifest, "missing")).toBeUndefined();
  });
});
