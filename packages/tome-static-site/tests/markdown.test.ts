import { describe, expect, test } from "bun:test";
import {
  nodePagePath,
  nodeTabPath,
  prepareNodeMarkdown,
  resolvePageTitleAndContent,
  rewriteMarkdownLinks,
  stripLeadingTitleHeading,
} from "../src/lib/markdown";
import { buildNodeUrlIndex, createNodeUrlResolver } from "../src/lib/node-urls";

const TARGET = "aabbccdd112233445566778899aabbcc";
const ALIASED = "bbccddee2233445566778899aabbccdd";

function urlsForNodes(
  nodes: { id: string; urlAlias?: string }[],
  base = "/",
) {
  const indexed = nodes.map((node) => ({ ...node }));
  const { pathById, aliasToId } = buildNodeUrlIndex(indexed);
  return createNodeUrlResolver({ pathById, aliasToId, base });
}

describe("resolvePageTitleAndContent", () => {
  test("strips duplicate leading title heading", () => {
    const result = resolvePageTitleAndContent("# My Page\n\nBody text.", "My Page");
    expect(result.title).toBe("My Page");
    expect(result.content).toBe("Body text.");
  });

  test("keeps non-matching leading heading", () => {
    const result = resolvePageTitleAndContent("# Other\n\nBody.", "My Page");
    expect(result.content).toBe("# Other\n\nBody.");
  });
});

describe("stripLeadingTitleHeading", () => {
  test("removes duplicate title only", () => {
    expect(stripLeadingTitleHeading("# Title\n\nx", "Title")).toBe("x");
    expect(stripLeadingTitleHeading("# Title\n\nx", "Other")).toBe("# Title\n\nx");
  });
});

describe("rewriteMarkdownLinks", () => {
  test("rewrites marloth links", () => {
    const urls = urlsForNodes([{ id: TARGET }]);
    const input = `See [Target](marloth:${TARGET}) here.`;
    const output = rewriteMarkdownLinks(input, urls);
    expect(output).toBe(`See [Target](/${TARGET}/) here.`);
  });

  test("rewrites relative sibling md paths", () => {
    const urls = urlsForNodes([{ id: TARGET }]);
    const input = `See [Target](./${TARGET}.md) here.`;
    const output = rewriteMarkdownLinks(input, urls);
    expect(output).toBe(`See [Target](/${TARGET}/) here.`);
  });

  test("rewrites legacy Notion export paths", () => {
    const urls = urlsForNodes([{ id: TARGET }]);
    const input = `[Page](../foo/${TARGET}.md)`;
    const output = rewriteMarkdownLinks(input, urls);
    expect(output).toBe(`[Page](/${TARGET}/)`);
  });

  test("applies base prefix for embedding", () => {
    const urls = urlsForNodes([{ id: TARGET }], "/design/");
    const input = `[Target](marloth:${TARGET})`;
    const output = rewriteMarkdownLinks(input, urls);
    expect(output).toBe(`[Target](/design/${TARGET}/)`);
  });

  test("rewrites to alias when target has url_alias", () => {
    const urls = urlsForNodes([
      { id: TARGET, urlAlias: "design/twold" },
      { id: ALIASED },
    ]);
    const input = `[Target](marloth:${TARGET})`;
    expect(rewriteMarkdownLinks(input, urls)).toBe(`[Target](/design/twold/)`);
  });

  test("resolves alias hrefs in markdown", () => {
    const urls = urlsForNodes([{ id: TARGET, urlAlias: "design/twold" }]);
    const input = `[TWOLD](/design/twold/)`;
    expect(rewriteMarkdownLinks(input, urls)).toBe(`[TWOLD](/design/twold/)`);
  });

  test("leaves external links unchanged", () => {
    const urls = urlsForNodes([{ id: TARGET }]);
    const input = "[Example](https://example.com)";
    expect(rewriteMarkdownLinks(input, urls)).toBe(input);
  });
});

describe("nodePagePath", () => {
  test("root base", () => {
    expect(nodePagePath(TARGET, "/")).toBe(`/${TARGET}/`);
  });

  test("embedded base", () => {
    expect(nodePagePath(TARGET, "/design/")).toBe(`/design/${TARGET}/`);
  });
});

describe("nodeTabPath", () => {
  test("root base", () => {
    expect(nodeTabPath(TARGET, "book-a", "/")).toBe(`/${TARGET}/tabs/book-a/`);
  });

  test("embedded base", () => {
    expect(nodeTabPath(TARGET, "book-a", "/design/")).toBe(
      `/design/${TARGET}/tabs/book-a/`,
    );
  });
});

describe("prepareNodeMarkdown", () => {
  test("deduplicates title and rewrites links", () => {
    const urls = urlsForNodes([{ id: TARGET }], "/docs/");
    const body = `# Page\n\nLink [x](marloth:${TARGET}).`;
    const result = prepareNodeMarkdown(body, "Page", urls);
    expect(result.markdown).toBe(`Link [x](/docs/${TARGET}/).`);
    expect(result.dynamicNodeIds.size).toBe(0);
  });

  test("expands dynamic links with titles", () => {
    const urls = urlsForNodes([{ id: TARGET }]);
    const body = `See [[${TARGET}]] here.`;
    const result = prepareNodeMarkdown(body, "Page", urls, (id) =>
      id === TARGET ? "Target Page" : "Untitled",
    );
    expect(result.markdown).toBe(`See [Target Page](/${TARGET}/) here.`);
    expect(result.dynamicNodeIds.has(TARGET)).toBe(true);
  });

  test("expands dynamic links to alias paths", () => {
    const urls = urlsForNodes([{ id: TARGET, urlAlias: "design/twold" }]);
    const body = `See [[${TARGET}]] here.`;
    const result = prepareNodeMarkdown(body, "Page", urls, () => "TWOLD");
    expect(result.markdown).toBe(`See [TWOLD](/design/twold/) here.`);
  });
});
