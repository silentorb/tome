import { describe, expect, test } from "bun:test";
import {
  canonicalNodeMarkdownHref,
  canonicalizeMarkdownBodyLinks,
  expandMarkdownBodyLinks,
  findMarkdownLinksToTarget,
  resolveMarkdownHrefTarget,
} from "../src/markdown-links";

const TARGET = "0123456789abcdef0123456789abcdef";

describe("resolveMarkdownHrefTarget", () => {
  test("resolves marloth scheme links", () => {
    expect(resolveMarkdownHrefTarget(`marloth:${TARGET}`)).toBe(TARGET);
  });

  test("resolves tome scheme links", () => {
    expect(resolveMarkdownHrefTarget(`tome:${TARGET}`)).toBe(TARGET);
  });

  test("resolves marloth node URIs", () => {
    expect(resolveMarkdownHrefTarget(`marloth://node/${TARGET}`)).toBe(TARGET);
  });

  test("resolves tome node URIs", () => {
    expect(resolveMarkdownHrefTarget(`tome://node/${TARGET}`)).toBe(TARGET);
  });

  test("resolves relative sibling md paths", () => {
    expect(resolveMarkdownHrefTarget(`./${TARGET}.md`)).toBe(TARGET);
  });

  test("resolves wiki-style node links", () => {
    expect(resolveMarkdownHrefTarget(`[[${TARGET}]]`)).toBe(TARGET);
  });

  test("resolves query-only node and record params", () => {
    expect(resolveMarkdownHrefTarget(`?node=${TARGET}`)).toBe(TARGET);
    expect(resolveMarkdownHrefTarget(`?record=${TARGET}`)).toBe(TARGET);
    expect(resolveMarkdownHrefTarget(`?dynnode=${TARGET}`)).toBe(TARGET);
  });

  test("resolves absolute editor URLs with node or record param", () => {
    expect(resolveMarkdownHrefTarget(`http://127.0.0.1:5173/?node=${TARGET}`)).toBe(TARGET);
    expect(resolveMarkdownHrefTarget(`https://editor.example/?record=${TARGET}`)).toBe(TARGET);
  });

  test("resolves export-style md paths", () => {
    expect(resolveMarkdownHrefTarget(`Some Page ${TARGET}.md`)).toBe(TARGET);
    expect(resolveMarkdownHrefTarget(encodeURIComponent(`Some Page ${TARGET}.md`))).toBe(TARGET);
  });

  test("ignores external and fragment-only hrefs", () => {
    expect(resolveMarkdownHrefTarget("https://example.com")).toBeNull();
    expect(resolveMarkdownHrefTarget("#section")).toBeNull();
    expect(resolveMarkdownHrefTarget("mailto:a@b.com")).toBeNull();
  });
});

describe("canonicalNodeMarkdownHref", () => {
  test("returns lowercase relative path", () => {
    expect(canonicalNodeMarkdownHref("ABCDEF0123456789ABCDEF0123456789")).toBe(
      "./abcdef0123456789abcdef0123456789.md",
    );
  });
});

describe("expandMarkdownBodyLinks", () => {
  test("rewrites storage paths to display hrefs", () => {
    const body = `[A](./${TARGET}.md) [B](marloth:${TARGET})`;
    const out = expandMarkdownBodyLinks(body, (id) => `?node=${id}`);
    expect(out).toBe(`[A](?node=${TARGET}) [B](?node=${TARGET})`);
  });

  test("leaves external links unchanged", () => {
    const body = "[Example](https://example.com)";
    expect(expandMarkdownBodyLinks(body, (id) => `?node=${id}`)).toBe(body);
  });
});

describe("canonicalizeMarkdownBodyLinks", () => {
  test("rewrites marloth and absolute editor links to relative paths", () => {
    const body = [
      `[A](marloth:${TARGET})`,
      `[B](http://127.0.0.1:5173/?node=${TARGET})`,
      `[C](./${TARGET}.md)`,
      `[D](marloth://node/${TARGET})`,
    ].join(" ");
    const out = canonicalizeMarkdownBodyLinks(body);
    const canonical = `./${TARGET}.md`;
    expect(out).toBe(`[A](${canonical}) [B](${canonical}) [C](${canonical}) [D](${canonical})`);
  });

  test("round-trips display hrefs from expand", () => {
    const storage = `[Target](./${TARGET}.md)`;
    const display = expandMarkdownBodyLinks(storage, (id) => `?node=${id}`);
    expect(canonicalizeMarkdownBodyLinks(display)).toBe(storage);
  });

  test("leaves external links unchanged", () => {
    const body = "[Example](https://example.com)";
    expect(canonicalizeMarkdownBodyLinks(body)).toBe(body);
  });
});

describe("findMarkdownLinksToTarget", () => {
  test("finds marloth markdown links", () => {
    const body = `# Page\n\nSee [Target title](marloth:${TARGET}) for details.`;
    expect(findMarkdownLinksToTarget(body, TARGET)).toEqual([{ linkText: "Target title" }]);
  });

  test("finds relative sibling markdown links", () => {
    const body = `See [Target](./${TARGET}.md).`;
    expect(findMarkdownLinksToTarget(body, TARGET)).toEqual([{ linkText: "Target" }]);
  });

  test("finds export-style markdown links", () => {
    const body = `Related: [Target](Target%20${TARGET}.md)`;
    expect(findMarkdownLinksToTarget(body, TARGET)).toEqual([{ linkText: "Target" }]);
  });

  test("finds inline notion paren links in prose", () => {
    const body = `See Target (${TARGET}.md) for more.`;
    const matches = findMarkdownLinksToTarget(body, TARGET);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.linkText).toBe("See Target");
  });

  test("returns empty when no match", () => {
    const body = `[Other](marloth:fedcba9876543210fedcba9876543210)`;
    expect(findMarkdownLinksToTarget(body, TARGET)).toEqual([]);
  });
});
