import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const COMPONENT_DIR = import.meta.dir;

describe("node page markdown editor layout CSS", () => {
  const nodePageCss = readFileSync(join(COMPONENT_DIR, "../../../src/webview/components/node-page-view.css"), "utf8");
  const editorCss = readFileSync(join(COMPONENT_DIR, "../../../src/webview/components/editor.css"), "utf8");

  test("does not inherit the standalone editor min-height on node pages", () => {
    expect(editorCss).toMatch(/\.tome-editor-body[\s\S]*min-height:\s*60vh/);
    expect(nodePageCss).toMatch(
      /\.tome-record-page \.tome-editor-body[\s\S]*min-height:\s*0/,
    );
    expect(nodePageCss).not.toMatch(
      /\.tome-record-page \.tome-editor-body\.is-empty[\s\S]*min-height:\s*0/,
    );
  });

  test("uses stable ProseMirror top padding on node pages", () => {
    expect(nodePageCss).toMatch(
      /\.tome-record-page \.tome-editor-body \.milkdown \.ProseMirror[\s\S]*padding:\s*14px\s+0\s+0/,
    );
    expect(nodePageCss).not.toMatch(
      /\.tome-record-page \.tome-editor-body \.milkdown \.ProseMirror\s+p[\s\S]*padding-top:\s*14px/,
    );
  });

  test("keeps the virtual cursor widget out of document flow", () => {
    expect(editorCss).toMatch(
      /\.tome-editor-body \.milkdown \.ProseMirror \.ProseMirror-widget:has\(> \.prosemirror-virtual-cursor\)[\s\S]*height:\s*0/,
    );
  });
});
