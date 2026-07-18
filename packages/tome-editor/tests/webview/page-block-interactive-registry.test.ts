import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import {
  formatPageBlockEmbedComment,
  parsePageBlockPayload,
} from "tome-interfaces/page-block";
import {
  getInteractivePageBlockRegistration,
  getPublicExtensionComponent,
  loadEditorBundles,
  resetPageBlockRegistryForTests,
} from "../../src/webview/extensions/page-block-registry";

describe("page-block interactive registry", () => {
  test("embed comment round-trips block data for persistence", () => {
    const comment = formatPageBlockEmbedComment({
      componentId: "tome-query.block",
      data: { version: 1, reactFlow: { nodes: [], edges: [] } },
    });
    const match = /^<!-- tome-page-block (\{[\s\S]*\}) -->$/.exec(comment.trim());
    expect(match).toBeTruthy();
    const payload = parsePageBlockPayload(match![1]!);
    expect(payload?.componentId).toBe("tome-query.block");
    expect(payload?.data).toEqual({ version: 1, reactFlow: { nodes: [], edges: [] } });
  });

  test("loadEditorBundles records public components and interactive lookup", async () => {
    resetPageBlockRegistryForTests();

    const dir = join(tmpdir(), `tome-page-block-registry-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const bundlePath = join(dir, "editor.mjs");
    writeFileSync(
      bundlePath,
      `
      export function register(host) {
        host.registerPageBlock({
          implementationId: "interactive-demo",
          interactive: true,
          Component() { return null; },
        });
      }
      `,
      "utf8",
    );

    await loadEditorBundles({
      components: [
        {
          id: "demo.block",
          extensionId: "demo",
          implementationId: "interactive-demo",
          label: "Demo",
          interactive: true,
        },
        {
          id: "static.block",
          extensionId: "demo",
          implementationId: "interactive-demo",
          label: "Static",
        },
      ],
      editorBundles: [{ extensionId: "demo", url: pathToFileURL(bundlePath).href }],
    });

    expect(getPublicExtensionComponent("demo.block")?.interactive).toBe(true);
    expect(getInteractivePageBlockRegistration("demo.block")?.implementationId).toBe(
      "interactive-demo",
    );
    expect(getInteractivePageBlockRegistration("static.block")).toBeUndefined();

    resetPageBlockRegistryForTests();
  });
});
