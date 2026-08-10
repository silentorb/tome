import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { formatPageBlockEmbedComment } from "tome-interfaces/page-block";
import { pageBlockEmbed } from "../../src/webview/extensions/page-block-embed";
import {
  resetPageBlockRegistryForTests,
  setEditorBundleErrorForTests,
} from "../../src/webview/extensions/page-block-registry";
import type { PublicExtensionComponent } from "tome-graph-interfaces";

describe("interactive page-block load error", () => {
  test("shows explicit error instead of htmlModule snapshot when bundle missing", async () => {
    resetPageBlockRegistryForTests();

    const component: PublicExtensionComponent = {
      id: "tome-sequencing.block",
      extensionId: "tome-sequencing",
      implementationId: "tome-sequencing",
      label: "Timeline",
      interactive: true,
    };

    // Seed public component metadata the same way loadEditorBundles would.
    await import("../../src/webview/extensions/page-block-registry").then(async (mod) => {
      // loadEditorBundles with empty bundles still sets componentsById
      await mod.loadEditorBundles({
        components: [component],
        editorBundles: [],
      });
    });
    setEditorBundleErrorForTests(
      "tome-sequencing",
      "Failed to fetch dynamically imported module: /api/extensions/tome-sequencing/editor.js",
    );

    const embed =
      `${formatPageBlockEmbedComment({
        componentId: "tome-sequencing.block",
        data: { version: 1, reactFlow: { nodes: [], edges: [] } },
      })}\n` +
      '<figure class="tome-sequencing-block"><ul class="tome-sequencing-static-list">' +
      "<li>should not appear</li></ul></figure>";

    const root = document.createElement("div");
    document.body.appendChild(root);
    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, embed);
      })
      .use(commonmark)
      .use(gfm)
      .use(pageBlockEmbed)
      .create();

    expect(root.querySelector("[data-tome-interactive-error='1']")).toBeTruthy();
    expect(root.textContent).toContain("Timeline failed to load");
    expect(root.textContent).toContain("Failed to fetch dynamically imported module");
    expect(root.querySelector(".tome-sequencing-static-list")).toBeNull();
    expect(root.textContent).not.toContain("should not appear");

    await editor.destroy();
    resetPageBlockRegistryForTests();
  });
});
