import { describe, expect, test } from "bun:test";
import {
  canonicalNodeMarkdownHref,
  canonicalizeMarkdownBodyLinks,
  expandMarkdownBodyLinks,
  findMarkdownLinksToTarget,
  resolveMarkdownHrefTarget,
} from "../src/markdown-links";

const TARGET = "00000000000000000000000001";

describe("resolveMarkdownHrefTarget", () => {
  test("resolves tome scheme links", () => {
    expect(resolveMarkdownHrefTarget(`tome:${TARGET}`)).toBe(TARGET);
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

  test("ignores external and fragment-only hrefs", () => {
    expect(resolveMarkdownHrefTarget("https://example.com")).toBeNull();
    expect(resolveMarkdownHrefTarget("#section")).toBeNull();
    expect(resolveMarkdownHrefTarget("mailto:a@b.com")).toBeNull();
  });
});

describe("canonicalNodeMarkdownHref", () => {
  test("returns relative path with the id unchanged", () => {
    expect(canonicalNodeMarkdownHref("0123456789ABCDEFGHJKMNPQRS")).toBe(
      "./0123456789ABCDEFGHJKMNPQRS.md",
    );
  });
});

describe("expandMarkdownBodyLinks", () => {
  test("rewrites storage paths to display hrefs", () => {
    const body = `[A](./${TARGET}.md) [B](tome:${TARGET})`;
    const out = expandMarkdownBodyLinks(body, (id) => `?node=${id}`);
    expect(out).toBe(`[A](?node=${TARGET}) [B](?node=${TARGET})`);
  });

  test("leaves external links unchanged", () => {
    const body = "[Example](https://example.com)";
    expect(expandMarkdownBodyLinks(body, (id) => `?node=${id}`)).toBe(body);
  });
});

describe("canonicalizeMarkdownBodyLinks", () => {
  test("rewrites scheme and absolute editor links to relative paths", () => {
    const body = [
      `[A](tome:${TARGET})`,
      `[B](http://127.0.0.1:5173/?node=${TARGET})`,
      `[C](./${TARGET}.md)`,
      `[D](tome://node/${TARGET})`,
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
  test("finds tome scheme markdown links", () => {
    const body = `# Page\n\nSee [Target title](tome:${TARGET}) for details.`;
    expect(findMarkdownLinksToTarget(body, TARGET)).toEqual([{ linkText: "Target title" }]);
  });

  test("finds relative sibling markdown links", () => {
    const body = `See [Target](./${TARGET}.md).`;
    expect(findMarkdownLinksToTarget(body, TARGET)).toEqual([{ linkText: "Target" }]);
  });

  test("finds inline paren links in prose", () => {
    const body = `See Target (./${TARGET}.md) for more.`;
    const matches = findMarkdownLinksToTarget(body, TARGET);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.linkText).toBe("See Target");
  });

  test("returns empty when no match", () => {
    const body = `[Other](tome:00000000000000000000000036)`;
    expect(findMarkdownLinksToTarget(body, TARGET)).toEqual([]);
  });
});
