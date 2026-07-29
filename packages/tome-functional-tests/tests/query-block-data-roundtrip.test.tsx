import { afterAll, describe, expect, mock, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invalidateExtensionsCache } from "tome-db";
import { contentModelDir } from "tome-db/content";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestWorkspace,
  TEST_HOME_NODE_ID,
} from "tome-db/content/test-helpers";
import { normalizeEditorBody } from "tome-editor/src/webview/editor-save.ts";
import {
  formatPageBlockEmbedComment,
  parsePageBlockFences,
  parsePageBlockPayload,
  serializePageBlock,
} from "tome-interfaces/page-block";
import { defaultBlockData, defaultReactFlowGraph, parseQueryBlockData } from "tome-query/config";
import { createTestApiFromContent } from "../src/harness/create-test-api.ts";
import { createHandlerClient } from "../src/harness/handler-client.ts";

const queryEditorPath = fileURLToPath(
  new URL("../../tome-query/src/query-editor.tsx", import.meta.url),
);
mock.module(queryEditorPath, () => ({
  QueryFlowEditor: () => <div data-testid="query-flow-stub" />,
}));

const { QueryBlockComponent } = await import("tome-query/editor");

const NODE_ID = "00000000000000000000000029";
const PAGE_TITLE = "Query block page";

function writeTomeQueryExtensions(contentDir: string): void {
  writeFileSync(
    join(contentModelDir(contentDir), "extensions.json"),
    JSON.stringify(
      {
        version: 1,
        extensions: [
          {
            id: "tome-query",
            enabled: true,
            htmlModule: "tome-query/html",
            serverModule: "tome-query/server",
          },
        ],
        components: [
          {
            id: "tome-query.block",
            extensionId: "tome-query",
            kind: "page-block",
            implementationId: "tome-query",
            label: "Query table",
            enabled: true,
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );
  invalidateExtensionsCache();
}

function payloadFromPreparedMarkdown(markdown: string): unknown {
  const commentMatch = /<!-- tome-page-block (\{[\s\S]*\}) -->/.exec(markdown);
  if (commentMatch) {
    return parsePageBlockPayload(commentMatch[1]!)?.data;
  }
  const { segments } = parsePageBlockFences(markdown);
  const block = segments.find((segment) => segment.type === "block");
  return block && block.type === "block" ? block.payload.data : undefined;
}

describe("query-block data client↔API round trip", () => {
  const fixture = createTestContentFixture("tome-func-query-data-");
  seedTestWorkspace(fixture);
  seedTestNode(fixture, {
    id: TEST_HOME_NODE_ID,
    properties: { title: "Home" },
  });
  seedTestNode(
    fixture,
    {
      id: NODE_ID,
      properties: { title: PAGE_TITLE },
    },
    serializePageBlock("tome-query.block", defaultBlockData()),
  );
  writeTomeQueryExtensions(fixture.ctx.store.contentDir);

  const api = createTestApiFromContent(fixture);
  const client = createHandlerClient(api.handler);

  afterAll(() => {
    api.handler.close();
    destroyTestContentFixture(fixture);
  });

  test("graph edit survives normalize → saveBody → prepare → remount", async () => {
    const invoke = mock(async () => ({
      ok: true,
      columns: ["id"],
      rows: [],
    }));
    const written: unknown[] = [];
    let onGraphChange: ((graph: unknown) => void) | undefined;

    const { unmount } = render(
      <QueryBlockComponent
        ctx={{
          component: { id: "tome-query.block", label: "Query table" },
          nodeId: NODE_ID,
          invoke,
          openToolPanel: (session) => {
            onGraphChange = session.props.onGraphChange as (graph: unknown) => void;
          },
        }}
        blockData={defaultBlockData()}
        onBlockDataChange={(data) => {
          written.push(data);
        }}
      />,
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit query" }));
    const nextGraph = {
      ...defaultReactFlowGraph(),
      nodes: defaultReactFlowGraph().nodes.map((node) =>
        node.id === "in" ? { ...node, position: { x: 42, y: 24 } } : node,
      ),
    };
    onGraphChange?.(nextGraph);
    expect(written.length).toBeGreaterThan(0);
    const blockData = written.at(-1);
    expect(parseQueryBlockData(blockData).reactFlow.nodes.find((n) => n.id === "in")?.position.x).toBe(
      42,
    );
    expect("viewMode" in parseQueryBlockData(blockData)).toBe(false);

    unmount();

    const embed =
      `${formatPageBlockEmbedComment({
        componentId: "tome-query.block",
        data: blockData,
      })}\n` + `<div class="tome-query-block">snapshot</div>`;
    const fence = normalizeEditorBody(embed, PAGE_TITLE);
    expect(fence).toContain("```tome-block");
    expect(fence).toContain('"x": 42');
    expect(fence).not.toContain('"viewMode"');

    await client.saveBody(NODE_ID, fence);

    const stored = await client.getNodeBody(NODE_ID);
    expect(
      parseQueryBlockData(payloadFromPreparedMarkdown(stored)).reactFlow.nodes.find(
        (n) => n.id === "in",
      )?.position.x,
    ).toBe(42);

    const prepared = await client.prepareEditorBody(NODE_ID, stored);
    expect(prepared).toContain("<!-- tome-page-block ");
    const restoredData = payloadFromPreparedMarkdown(prepared);
    expect(parseQueryBlockData(restoredData).reactFlow.nodes.find((n) => n.id === "in")?.position.x).toBe(
      42,
    );

    const invokeAfterReload = mock(async () => ({
      ok: true,
      columns: ["id"],
      rows: [],
    }));
    render(
      <QueryBlockComponent
        ctx={{
          component: { id: "tome-query.block", label: "Query table" },
          nodeId: NODE_ID,
          invoke: invokeAfterReload,
          openToolPanel: () => {},
        }}
        blockData={restoredData}
        onBlockDataChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Edit query" })).toBeTruthy();
    await waitFor(() => {
      expect(invokeAfterReload).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("query-flow-stub")).toBeNull();
  });
});
