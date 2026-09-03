import { describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import {
  attachPageBlockEditorHtml,
  createExtensionGraphQueryServices,
  createExtensionExecuteImpServices,
  openContentGraph,
  storageBodyToDocument,
} from "tome-db";
import { formatPageBlockEmbedComment } from "tome-interfaces/page-block";
import { ExtensionServerRuntime } from "../../../tome-server/src/extensions/runtime";
import { documentToEditorMarkdown } from "../../src/webview/body-document-projection";
import { pageBlockEmbed } from "../../src/webview/extensions/page-block-embed";
import {
  registerInteractivePageBlockForTests,
  resetPageBlockRegistryForTests,
} from "../../src/webview/extensions/page-block-registry";

const arcsId = "01KWN86X6MFZQAJ1V36T9592A9";

function resolveMarlothCorpus(): { contentPath: string; sqlitePath: string } | null {
  const contentCandidates = [
    process.env.TOME_CONTENT_PATH,
    "/workspaces/silentorb-workbench/.mnt/marloth-story/content",
    "/workspaces/marloth-story/content",
  ].filter((p): p is string => Boolean(p));

  for (const contentPath of contentCandidates) {
    const resolvedContent = resolve(contentPath);
    const sqliteCandidates = [
      process.env.TOME_DB_PATH,
      resolve(resolvedContent, "../data/tome.sqlite"),
    ].filter((p): p is string => Boolean(p));

    for (const sqlitePath of sqliteCandidates) {
      const resolvedSqlite = resolve(sqlitePath);
      if (existsSync(resolvedContent) && existsSync(resolvedSqlite)) {
        return { contentPath: resolvedContent, sqlitePath: resolvedSqlite };
      }
    }
  }
  return null;
}

const corpus = resolveMarlothCorpus();

describe("Arcs sequencing page-block parse", () => {
  test.skipIf(!corpus)(
    "prepared Arcs markdown becomes tome_page_block (not raw HTML)",
    async () => {
      const { contentPath, sqlitePath } = corpus!;
      copyFileSync(sqlitePath, "/tmp/seq-parse.sqlite");
      const graph = openContentGraph(contentPath, "/tmp/seq-parse.sqlite");
      const runtime = new ExtensionServerRuntime(
        contentPath,
        () => createExtensionGraphQueryServices(graph.graphStore, contentPath),
        undefined,
        () => createExtensionExecuteImpServices(graph.graphStore),
      );
      await runtime.ensureLoaded();

      const storageMd = readFileSync(`${contentPath}/data/nodes/FZ/${arcsId}.md`, "utf8");
      const body = /^---\n[\s\S]*?\n---\n([\s\S]*)$/.exec(storageMd)?.[1] ?? storageMd;
      const nodeDocument = storageBodyToDocument(graph.cache, body);
      const withHtml = await attachPageBlockEditorHtml(nodeDocument, async (componentId, data) => {
        const html = await runtime.renderPageBlockHtml(arcsId, componentId, data);
        return `${formatPageBlockEmbedComment({ componentId, data })}\n${html}`;
      });
      const editorMarkdown = documentToEditorMarkdown(withHtml);
      expect(editorMarkdown.length).toBeGreaterThan(1000);

      resetPageBlockRegistryForTests();
      // Register interactive so remount prefers React path (stub component).
      registerInteractivePageBlockForTests(
        {
          id: "tome-sequencing.block",
          extensionId: "tome-sequencing",
          implementationId: "tome-sequencing",
          label: "Timeline",
          interactive: true,
        },
        {
          implementationId: "tome-sequencing",
          interactive: true,
          Component: () => null,
        },
      );

      const root = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(root);
      const editor = await Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, editorMarkdown);
        })
        .use(commonmark)
        .use(gfm)
        .use(pageBlockEmbed)
        .create();

      let found = false;
      await editor.action((ctx) => {
        ctx.get(editorViewCtx).state.doc.descendants((node) => {
          if (node.type.name === "tome_page_block") found = true;
        });
      });
      expect(found).toBe(true);
      expect(root.querySelector(".tome-page-block-embed")).toBeTruthy();
      // Interactive path hides HTML host
      const htmlHost = root.querySelector(
        '[data-type="tome-page-block-html"]',
      ) as HTMLElement | null;
      expect(htmlHost?.hidden).toBe(true);

      await editor.destroy();
    },
    { timeout: 30_000 },
  );
});
