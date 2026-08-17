import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { makeNodePageDetail } from "./test-fixtures/node-page";
import { makeMockEditorApi } from "./test-fixtures/mock-api";

mock.module("../../src/webview/components/TomeEditor", () => ({
  TomeEditor: () => <div data-testid="tome-editor-stub" />,
}));

mock.module("react-force-graph-2d", () => ({
  default: () => <div data-testid="force-graph-stub" />,
}));

const createdId = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
const createdNode = makeNodePageDetail({
  id: createdId,
  title: "Fresh idea",
  body: "",
});

let createNodeCalls: { title: string; body?: string; corpusId?: string }[] = [];
const createNode = async (input: { title: string; body?: string; corpusId?: string }) => {
  createNodeCalls.push(input);
  return { id: createdId, title: input.title };
};

const getNode = async (id: string) => {
  if (id === createdId) return { ...createdNode, title: "Fresh idea" };
  return makeNodePageDetail({ id, title: "Home" });
};

mock.module("../../src/webview/api/client", () => ({
  createEditorApi: () => {
    const base = makeMockEditorApi();
    return {
      ...base,
      listCorpora: async () => {
        const [corpus] = await base.listCorpora();
        return [
          { ...corpus, id: "marloth", label: "Marloth" },
          { ...corpus, id: "translucence", label: "Translucence" },
        ];
      },
      createNode,
      getNode,
    };
  },
}));

import { App } from "../../src/webview/App";

describe("App new page draft", () => {
  afterEach(() => {
    createNodeCalls = [];
  });

  test("?view=create opens a draft without calling createNode", async () => {
    window.history.replaceState({}, "", "/?view=create");
    const { container } = render(<App />);

    await waitFor(() => {
      expect(
        container.querySelector('textarea[aria-label="Page title"]'),
      ).toBeTruthy();
    });

    const title = container.querySelector(
      'textarea[aria-label="Page title"]',
    ) as HTMLTextAreaElement;
    expect(title.value).toBe("");
    expect(title.placeholder).toBe("Untitled");
    expect(createNodeCalls).toEqual([]);
    expect(window.location.search).toContain("view=create");
  });

  test("persistable title creates the node and replaces the URL", async () => {
    window.history.replaceState({}, "", "/?view=create");
    const { container } = render(<App />);

    await waitFor(() => {
      expect(
        container.querySelector('textarea[aria-label="Page title"]'),
      ).toBeTruthy();
    });

    const title = container.querySelector(
      'textarea[aria-label="Page title"]',
    ) as HTMLTextAreaElement;
    fireEvent.change(title, { target: { value: "Fresh idea" } });

    await waitFor(
      () => {
        expect(createNodeCalls).toEqual([
          { title: "Fresh idea", body: undefined, corpusId: "marloth" },
        ]);
        expect(window.location.search).toContain(`node=${createdId}`);
        expect(window.location.search).not.toContain("view=create");
      },
      { timeout: 3500 },
    );
  });

  test("?corpus= pins the draft to that corpus instead of the first one", async () => {
    window.history.replaceState({}, "", "/?view=create&corpus=translucence");
    const { container } = render(<App />);

    await waitFor(() => {
      expect(
        container.querySelector('textarea[aria-label="Page title"]'),
      ).toBeTruthy();
    });

    const title = container.querySelector(
      'textarea[aria-label="Page title"]',
    ) as HTMLTextAreaElement;
    fireEvent.change(title, { target: { value: "Fresh idea" } });

    await waitFor(
      () => {
        expect(createNodeCalls).toEqual([
          { title: "Fresh idea", body: undefined, corpusId: "translucence" },
        ]);
      },
      { timeout: 3500 },
    );
  });

  test("Untitled title does not create a node", async () => {
    window.history.replaceState({}, "", "/?view=create");
    const { container } = render(<App />);

    await waitFor(() => {
      expect(
        container.querySelector('textarea[aria-label="Page title"]'),
      ).toBeTruthy();
    });

    const title = container.querySelector(
      'textarea[aria-label="Page title"]',
    ) as HTMLTextAreaElement;
    fireEvent.change(title, { target: { value: "Untitled" } });

    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect(createNodeCalls).toEqual([]);
    expect(window.location.search).toContain("view=create");
  });
});
