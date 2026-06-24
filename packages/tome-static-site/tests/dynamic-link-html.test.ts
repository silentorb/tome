import { describe, expect, test } from "bun:test";
import { decorateDynamicLinkHtml } from "../src/lib/dynamic-link-html";

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
});
