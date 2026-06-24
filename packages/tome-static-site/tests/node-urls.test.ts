import { describe, expect, test } from "bun:test";
import {
  buildNodeUrlIndex,
  createNodeUrlResolver,
  normalizeUrlAlias,
  resolveStaticHrefTarget,
} from "../src/lib/node-urls";

const ID_A = "aabbccdd112233445566778899aabbcc";
const ID_B = "bbccddee2233445566778899aabbccdd";
const ID_C = "ccddeeff33445566778899aabbccddee";

describe("normalizeUrlAlias", () => {
  test("trims and strips slashes", () => {
    expect(normalizeUrlAlias("/design/twold/")).toBe("design/twold");
    expect(normalizeUrlAlias("  design/twold  ")).toBe("design/twold");
  });

  test("lowercases segments", () => {
    expect(normalizeUrlAlias("Design/TWOLD")).toBe("design/twold");
  });

  test("rejects invalid paths", () => {
    expect(normalizeUrlAlias("")).toBeNull();
    expect(normalizeUrlAlias("   ")).toBeNull();
    expect(normalizeUrlAlias("design/../twold")).toBeNull();
    expect(normalizeUrlAlias("_astro/foo")).toBeNull();
  });
});

describe("buildNodeUrlIndex", () => {
  test("uses lowercase id when url_alias is unset", () => {
    const nodes = [{ id: ID_A }];
    const index = buildNodeUrlIndex(nodes);
    expect(nodes[0]!.urlPath).toBe(ID_A);
    expect(index.pathById[ID_A]).toBe(ID_A);
    expect(index.aliasToId).toEqual({});
  });

  test("uses alias path when url_alias is set", () => {
    const nodes = [{ id: ID_A, urlAlias: "design/twold" }];
    const index = buildNodeUrlIndex(nodes);
    expect(nodes[0]!.urlPath).toBe("design/twold");
    expect(index.pathById[ID_A]).toBe("design/twold");
    expect(index.aliasToId["design/twold"]).toBe(ID_A);
  });

  test("throws on duplicate alias paths", () => {
    expect(() =>
      buildNodeUrlIndex([
        { id: ID_A, urlAlias: "design/twold" },
        { id: ID_B, urlAlias: "design/twold" },
      ]),
    ).toThrow(/Duplicate static URL path/);
  });

  test("throws when alias path collides with another node's id path", () => {
    expect(() =>
      buildNodeUrlIndex([
        { id: ID_A, urlAlias: ID_B },
        { id: ID_B },
      ]),
    ).toThrow(/Duplicate static URL path/);
  });
});

describe("createNodeUrlResolver", () => {
  test("pagePath uses alias when configured", () => {
    const nodes = [
      { id: ID_A, urlAlias: "design/twold" },
      { id: ID_B },
    ];
    const { pathById, aliasToId } = buildNodeUrlIndex(nodes);
    const urls = createNodeUrlResolver({ pathById, aliasToId, base: "/" });
    expect(urls.pagePath(ID_A)).toBe("/design/twold/");
    expect(urls.pagePath(ID_B)).toBe(`/${ID_B}/`);
  });

  test("tabPath uses alias prefix", () => {
    const nodes = [{ id: ID_A, urlAlias: "design/twold" }];
    const { pathById, aliasToId } = buildNodeUrlIndex(nodes);
    const urls = createNodeUrlResolver({ pathById, aliasToId, base: "/docs/" });
    expect(urls.tabPath(ID_A, "book-a")).toBe("/docs/design/twold/tabs/book-a/");
  });
});

describe("resolveStaticHrefTarget", () => {
  const aliasToId = { "design/twold": ID_A };

  test("resolves node id links", () => {
    expect(resolveStaticHrefTarget(`./${ID_A}.md`, "/", aliasToId)).toBe(ID_A);
  });

  test("resolves alias path links", () => {
    expect(resolveStaticHrefTarget("/design/twold/", "/", aliasToId)).toBe(ID_A);
    expect(resolveStaticHrefTarget("design/twold", "/", aliasToId)).toBe(ID_A);
  });

  test("resolves alias links with base prefix", () => {
    expect(resolveStaticHrefTarget("/docs/design/twold/", "/docs/", aliasToId)).toBe(ID_A);
  });

  test("returns null for unknown paths", () => {
    expect(resolveStaticHrefTarget("/unknown/", "/", aliasToId)).toBeNull();
    expect(resolveStaticHrefTarget("https://example.com", "/", aliasToId)).toBeNull();
  });
});

describe("integration: alias link rewriting pipeline", () => {
  test("mixed aliased and id-based nodes", async () => {
    const { prepareNodeMarkdown } = await import("../src/lib/markdown");
    const nodes = [
      { id: ID_A, urlAlias: "design/twold" },
      { id: ID_B },
      { id: ID_C, urlAlias: "characters/hero" },
    ];
    const { pathById, aliasToId } = buildNodeUrlIndex(nodes);
    const urls = createNodeUrlResolver({ pathById, aliasToId, base: "/" });

    const body = `# Page

See [[${ID_A}]] and [by alias](/characters/hero/) and [by id](tome:${ID_B}).
`;
    const result = prepareNodeMarkdown(body, "Page", urls, (id) => {
      if (id === ID_A) return "TWOLD";
      if (id === ID_B) return "Plain";
      if (id === ID_C) return "Hero";
      return "Untitled";
    });

    expect(result.markdown).toContain("[TWOLD](/design/twold/)");
    expect(result.markdown).toContain("[by alias](/characters/hero/)");
    expect(result.markdown).toContain(`[by id](/${ID_B}/)`);
    expect(result.markdown).not.toContain(ID_A);
  });
});
