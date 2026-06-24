import { describe, expect, test } from "bun:test";
import { decorateDynamicLinkHtml } from "../src/lib/dynamic-link-html";
import { buildNodeUrlIndex, createNodeUrlResolver } from "../src/lib/node-urls";

const TARGET = "aabbccdd112233445566778899aabbcc";

describe("decorateDynamicLinkHtml", () => {
  test("prefixes icon on dynamic node links only", () => {
    const html = `<p>See <a href="/${TARGET}/">Target</a> and <a href="/other/">Other</a>.</p>`;
    const out = decorateDynamicLinkHtml(html, new Set([TARGET]));
    expect(out).toContain("tome-dynamic-node-link-wrap");
    expect(out).toContain("tome-node-link-icon");
    expect(out).toContain(`href="/${TARGET}/"`);
    expect(out).not.toContain('href="/other/" class="tome-dynamic-node-link"');
  });

  test("decorates dynamic links that use alias paths", () => {
    const nodes = [{ id: TARGET, urlAlias: "design/twold" }];
    const { pathById, aliasToId } = buildNodeUrlIndex(nodes);
    const urls = createNodeUrlResolver({ pathById, aliasToId, base: "/" });
    const html = `<p>See <a href="/design/twold/">Target</a>.</p>`;
    const out = decorateDynamicLinkHtml(html, new Set([TARGET]), urls);
    expect(out).toContain("tome-dynamic-node-link-wrap");
    expect(out).toContain('href="/design/twold/"');
  });
});
