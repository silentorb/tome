import { afterEach, describe, expect, mock, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { getMarkdown } from "@milkdown/kit/utils";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import {
  formatPageBlockEmbedComment,
  parsePageBlockPayload,
} from "tome-interfaces/page-block";
import type { EditorToolPanelSession } from "tome-interfaces/page-block/editor";
import { defaultBlockData, defaultReactFlowGraph } from "tome-query/config";
import { normalizeEditorBody } from "../../src/webview/editor-save";
import { pageBlockEmbed } from "../../src/webview/extensions/page-block-embed";
import {
  registerInteractivePageBlockForTests,
  resetPageBlockRegistryForTests,
  setPageBlockToolPanelHandlers,
} from "../../src/webview/extensions/page-block-registry";

mock.module(
  new URL("../../../tome-query/src/query-editor.tsx", import.meta.url).pathname,
  () => ({
    QueryFlowEditor: () => <div data-testid="query-flow-stub" />,
  }),
);

const { QueryBlockComponent } = await import("tome-query/editor");

async function createEditor(initial: string) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initial);
    })
    .use(commonmark)
    .use(gfm)
    .use(pageBlockEmbed)
    .create();
  return { editor, root };
}

describe("interactive page-block data persistence", () => {
  afterEach(() => {
    resetPageBlockRegistryForTests();
  });

  test("Edit query graph change writes reactFlow into getMarkdown / normalize fence", async () => {
    resetPageBlockRegistryForTests();
    let session: EditorToolPanelSession | null = null;
    setPageBlockToolPanelHandlers({
      open: (next) => {
        session = next;
      },
      close: () => {
        session = null;
      },
    });
    registerInteractivePageBlockForTests(
      {
        id: "tome-query.block",
        extensionId: "tome-query",
        implementationId: "tome-query",
        label: "Query table",
        interactive: true,
      },
      {
        implementationId: "tome-query",
        interactive: true,
        Component: QueryBlockComponent,
      },
    );

    const initial = defaultBlockData();
    const embed =
      `${formatPageBlockEmbedComment({
        componentId: "tome-query.block",
        data: initial,
      })}\n` + `<div class="tome-query-block">snapshot</div>`;

    const { editor, root } = await createEditor(embed);

    await waitFor(() => {
      expect(root.querySelector(".tome-query-block-ui")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit query" }));
    expect(session).toBeTruthy();

    const nextGraph = {
      ...defaultReactFlowGraph(),
      nodes: defaultReactFlowGraph().nodes.map((node) =>
        node.id === "in" ? { ...node, position: { x: 12, y: 34 } } : node,
      ),
    };
    const onGraphChange = session!.props.onGraphChange as (graph: unknown) => void;
    onGraphChange(nextGraph);

    await waitFor(async () => {
      const markdown = await editor.action(getMarkdown());
      expect(markdown.includes('"x": 12') || markdown.includes('"x":12')).toBe(true);
    });

    const markdown = await editor.action(getMarkdown());
    const fence = normalizeEditorBody(markdown, "Page");
    expect(fence).toContain('"x": 12');
    expect(fence).not.toContain('"viewMode"');

    const match = /```tome-block\n([\s\S]*?)\n```/.exec(fence);
    expect(match).toBeTruthy();
    const payload = parsePageBlockPayload(match![1]!);
    const data = payload?.data as { reactFlow?: { nodes?: { id: string; position: { x: number } }[] } };
    expect(data?.reactFlow?.nodes?.find((n) => n.id === "in")?.position.x).toBe(12);

    await editor.destroy();
  });

  test("graph change fires markdownUpdated (autosave signal)", async () => {
    const { listener, listenerCtx } = await import("@milkdown/kit/plugin/listener");

    resetPageBlockRegistryForTests();
    let session: EditorToolPanelSession | null = null;
    setPageBlockToolPanelHandlers({
      open: (next) => {
        session = next;
      },
      close: () => {
        session = null;
      },
    });
    registerInteractivePageBlockForTests(
      {
        id: "tome-query.block",
        extensionId: "tome-query",
        implementationId: "tome-query",
        label: "Query table",
        interactive: true,
      },
      {
        implementationId: "tome-query",
        interactive: true,
        Component: QueryBlockComponent,
      },
    );

    const updates: string[] = [];
    const root = document.createElement("div");
    document.body.appendChild(root);
    const initial = defaultBlockData();
    const embed =
      `${formatPageBlockEmbedComment({
        componentId: "tome-query.block",
        data: initial,
      })}\n` + `<div class="tome-query-block">snapshot</div>`;

    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, embed);
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          updates.push(markdown);
        });
      })
      .use(listener)
      .use(commonmark)
      .use(gfm)
      .use(pageBlockEmbed)
      .create();

    await waitFor(() => {
      expect(root.querySelector(".tome-query-block-ui")).toBeTruthy();
    });

    await new Promise((resolve) => setTimeout(resolve, 250));
    updates.length = 0;

    fireEvent.click(screen.getByRole("button", { name: "Edit query" }));
    const onGraphChange = session!.props.onGraphChange as (graph: unknown) => void;
    onGraphChange({
      ...defaultReactFlowGraph(),
      nodes: defaultReactFlowGraph().nodes.map((node) =>
        node.id === "out" ? { ...node, position: { x: 99, y: 88 } } : node,
      ),
    });

    await waitFor(
      () => {
        expect(
          updates.some((md) => md.includes('"x": 99') || md.includes('"x":99')),
        ).toBe(true);
      },
      { timeout: 2000 },
    );

    await editor.destroy();
  });
});
