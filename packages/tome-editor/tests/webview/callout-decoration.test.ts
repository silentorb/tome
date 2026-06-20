import { describe, expect, test } from "bun:test";
import { hasLeadingCalloutEmoji, extractPageIconFromMarkdown, isEmojiOnlyLine } from "../../src/webview/callout-decoration";

describe("callout-decoration", () => {
  test("hasLeadingCalloutEmoji detects inline callout text", () => {
    expect(hasLeadingCalloutEmoji("💡 There could be two Manors…")).toBe(true);
    expect(hasLeadingCalloutEmoji("⚠️ Watch out")).toBe(true);
    expect(hasLeadingCalloutEmoji("Plain quote text")).toBe(false);
  });

  test("isEmojiOnlyLine detects icon-only lines", () => {
    expect(isEmojiOnlyLine("💡")).toBe(true);
    expect(isEmojiOnlyLine("💡 There could be two Manors…")).toBe(false);
  });

  test("extractPageIconFromMarkdown reads emoji-only and callout icons", () => {
    expect(extractPageIconFromMarkdown("💡\n\n# Title")).toBe("💡");
    expect(extractPageIconFromMarkdown("> ⚠️ Watch out\n\nBody")).toBe("⚠️");
    expect(extractPageIconFromMarkdown("# Title only\n\nBody")).toBe(null);
  });
});
