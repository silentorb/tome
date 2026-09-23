import { describe, expect, test } from "bun:test";
import { decorateCalloutHtml } from "../src/lib/callout-html";

describe("decorateCalloutHtml", () => {
  test("structures emoji-lead blockquotes as icon + body", () => {
    const html = "<blockquote><p>💡 Important note</p></blockquote>";
    expect(decorateCalloutHtml(html)).toBe(
      '<blockquote class="tome-callout" data-emoji="💡">' +
        '<span class="tome-callout-icon" aria-hidden="true">💡</span>' +
        '<div class="tome-callout-body"><p>Important note</p></div>' +
        "</blockquote>",
    );
  });

  test("leaves plain quotes unchanged", () => {
    const html = "<blockquote><p>Someone said this.</p></blockquote>";
    expect(decorateCalloutHtml(html)).toBe(html);
  });

  test("tags nested callout blockquotes independently", () => {
    const html =
      "<blockquote><p>💡 Outer</p><blockquote><p>💡 Inner</p></blockquote></blockquote>";
    expect(decorateCalloutHtml(html)).toBe(
      '<blockquote class="tome-callout" data-emoji="💡">' +
        '<span class="tome-callout-icon" aria-hidden="true">💡</span>' +
        '<div class="tome-callout-body">' +
        "<p>Outer</p>" +
        '<blockquote class="tome-callout" data-emoji="💡">' +
        '<span class="tome-callout-icon" aria-hidden="true">💡</span>' +
        '<div class="tome-callout-body"><p>Inner</p></div>' +
        "</blockquote>" +
        "</div>" +
        "</blockquote>",
    );
  });
});
