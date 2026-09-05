import { mock, describe, expect, test } from "bun:test";
import { useEffect } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { makeNodePageDetail } from "./test-fixtures/node-page";
import { makeMockEditorApi } from "./test-fixtures/mock-api";

let tomeEditorMountCount = 0;

mock.module("../../src/webview/components/TomeEditor", () => ({
  TomeEditor: () => {
    useEffect(() => {
      tomeEditorMountCount += 1;
    }, []);
    return <div data-testid="tome-editor-stub" />;
  },
}));

mock.module("react-force-graph-2d", () => ({
  default: () => <div data-testid="force-graph-stub" />,
}));

const record = makeNodePageDetail({
  id: "0000000000000000000000002Z",
  title: "Example page",
});

mock.module("../../src/webview/api/client", () => ({
  createEditorApi: () => ({
    ...makeMockEditorApi(),
    getNode: async () => record,
  }),
}));

import { App } from "../../src/webview/App";

describe("App", () => {
  test("renders a node page from standalone URL params", async () => {
    tomeEditorMountCount = 0;
    window.history.replaceState(
      {},
      "",
      "/?scope=0000000000000000000000002V&node=0000000000000000000000002Z",
    );

    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="tome-editor-stub"]')).toBeTruthy();
    });
    expect(container.querySelector('[name="Page title"], textarea[aria-label="Page title"]')).toBeTruthy();
    expect(container.textContent).not.toContain("Loading…");
  });

  test("page title keeps trailing space while typing the next word", async () => {
    tomeEditorMountCount = 0;
    window.history.replaceState(
      {},
      "",
      "/?scope=0000000000000000000000002V&node=0000000000000000000000002Z",
    );

    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector('textarea[aria-label="Page title"]')).toBeTruthy();
    });

    const title = container.querySelector(
      'textarea[aria-label="Page title"]',
    ) as HTMLTextAreaElement;
    fireEvent.change(title, { target: { value: "Example page " } });
    expect(title.value).toBe("Example page ");
  });

  test("editing the page title does not remount the body editor", async () => {
    tomeEditorMountCount = 0;
    window.history.replaceState(
      {},
      "",
      "/?scope=0000000000000000000000002V&node=0000000000000000000000002Z",
    );

    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="tome-editor-stub"]')).toBeTruthy();
    });
    const mountsAfterLoad = tomeEditorMountCount;
    expect(mountsAfterLoad).toBeGreaterThan(0);

    const title = container.querySelector(
      'textarea[aria-label="Page title"]',
    ) as HTMLTextAreaElement;
    fireEvent.change(title, { target: { value: "Renamed page" } });
    fireEvent.change(title, { target: { value: "Renamed page again" } });

    expect(tomeEditorMountCount).toBe(mountsAfterLoad);
    expect(title.value).toBe("Renamed page again");
  });
});
