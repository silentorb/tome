import { describe, expect, test } from "bun:test";
import { decorateTaskHtml } from "../src/lib/task-html";

describe("decorateTaskHtml", () => {
  test("structures checkbox-lead blockquotes as checkbox + body", () => {
    const html = "<blockquote><p>[ ] Buy milk</p></blockquote>";
    expect(decorateTaskHtml(html)).toBe(
      '<blockquote class="tome-task" data-checked="false">' +
        '<span class="tome-task-checkbox" aria-hidden="true">☐</span>' +
        '<div class="tome-task-body"><p>Buy milk</p></div>' +
        "</blockquote>",
    );
  });

  test("marks checked tasks", () => {
    const html = "<blockquote><p>[x] Done</p></blockquote>";
    expect(decorateTaskHtml(html)).toBe(
      '<blockquote class="tome-task" data-checked="true">' +
        '<span class="tome-task-checkbox" aria-hidden="true">☑</span>' +
        '<div class="tome-task-body"><p>Done</p></div>' +
        "</blockquote>",
    );
  });

  test("leaves plain quotes unchanged", () => {
    const html = "<blockquote><p>Someone said this.</p></blockquote>";
    expect(decorateTaskHtml(html)).toBe(html);
  });

  test("leaves callout emoji quotes for callout decorator", () => {
    const html = "<blockquote><p>💡 Note</p></blockquote>";
    expect(decorateTaskHtml(html)).toBe(html);
  });
});
