import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import { installGraphCanvasTestEnv } from "./test-fixtures/canvas-container-size";
import { makeNodePageDetail } from "./test-fixtures/node-page";
import { makeMockEditorApi } from "./test-fixtures/mock-api";
import { makeGraphLodSnapshot } from "./test-fixtures/graph-lod";

mock.module("../../src/webview/components/TomeEditor", () => ({
  TomeEditor: () => <div data-testid="tome-editor-stub" />,
}));

mock.module("react-force-graph-2d", () => ({
  default: () => <div data-testid="force-graph" />,
}));

const record = makeNodePageDetail({
  id: "0000000000000000000000002Z",
  title: "Example page",
});

mock.module("../../src/webview/api/client", () => ({
  createEditorApi: () => ({
    ...makeMockEditorApi(),
    getNode: async () => record,
    getGraphExplorerLod: async () => makeGraphLodSnapshot(),
  }),
}));

const { App } = await import("../../src/webview/App");

describe("App graph explorer route", () => {
  let restoreCanvasSize: (() => void) | undefined;

  beforeEach(() => {
    restoreCanvasSize = installGraphCanvasTestEnv();
  });

  afterEach(() => {
    restoreCanvasSize?.();
  });

  test("renders graph explorer from ?view=explorer", async () => {
    window.history.replaceState({}, "", "/?view=explorer");

    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="force-graph"]')).toBeTruthy();
    });

    expect(container.textContent).toContain("Graph Explorer");
    expect(container.textContent).toMatch(/\d+ nodes · \d+ relationships/);
    expect(container.querySelector(".tome-graph-canvas")).toBeTruthy();
  });
});
