import { describe, expect, mock, test, afterEach, beforeEach } from "bun:test";
import { fireEvent, render, within } from "@testing-library/react";
import type { EditorApi } from "../../../src/webview/api/client";
import { QuickLinksPanel } from "../../../src/webview/components/QuickLinksPanel";
import { setStandaloneNavigationHandler } from "../../../src/webview/node-links";
import {
  attachStandaloneChromeNavigation,
  resetStandaloneChromeNavigation,
} from "../../../src/webview/standalone-navigation";

const mockApi = {} as EditorApi;
const NODE_A = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const NODE_B = "BBBBBBBBBBBBBBBBBBBBBBBBBB";

function nodeActionMocks() {
  return {
    onRemoveQuickLink: mock(async () => {}),
    onArchiveNode: mock(async () => {}),
    onDeleteNode: mock(async () => {}),
  };
}

function renderReorderableQuickLinks(onQuickLinksReorder = mock(async () => {})) {
  return render(
    <QuickLinksPanel
      api={mockApi}
      quickLinks={[
        { nodeId: NODE_A, label: "Features", icon: "★" },
        { nodeId: NODE_B, label: "Scenes", icon: "▶" },
      ]}
      activeView="node-page"
      activeNodeId={null}
      collapsed={false}
      onQuickLinksReorder={onQuickLinksReorder}
      {...nodeActionMocks()}
    />,
  );
}

describe("QuickLinksPanel", () => {
  let originalAssign: typeof window.location.assign;
  let assignedUrl: string | null = null;

  beforeEach(() => {
    originalAssign = window.location.assign.bind(window.location);
    assignedUrl = null;
    setStandaloneNavigationHandler(null);
    resetStandaloneChromeNavigation();
    window.location.assign = ((url: string | URL) => {
      assignedUrl = String(url);
    }) as typeof window.location.assign;
    window.history.replaceState({}, "", "http://127.0.0.1:5173/");
    attachStandaloneChromeNavigation(document);
  });

  afterEach(() => {
    window.location.assign = originalAssign;
    setStandaloneNavigationHandler(null);
    resetStandaloneChromeNavigation();
  });

  test("renders non-reorderable quick links as native anchors", () => {
    const { getByRole } = render(
      <QuickLinksPanel
        api={mockApi}
        quickLinks={[
          { nodeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA", label: "Features", icon: "★" },
        ]}
        activeView="node-page"
        activeNodeId={null}
        collapsed={false}
        {...nodeActionMocks()}
      />,
    );

    const link = getByRole("link", { name: /Features/ });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toContain("AAAAAAAAAAAAAAAAAAAAAAAAAA");
  });

  test("calls onRemoveQuickLink from page actions menu", async () => {
    const onRemoveQuickLink = mock(async () => {});

    const { getByRole } = render(
      <QuickLinksPanel
        api={mockApi}
        quickLinks={[
          { nodeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA", label: "Features", icon: "★" },
        ]}
        activeView="node-page"
        activeNodeId={null}
        collapsed={false}
        onRemoveQuickLink={onRemoveQuickLink}
        onArchiveNode={mock(async () => {})}
        onDeleteNode={mock(async () => {})}
      />,
    );

    fireEvent.click(getByRole("button", { name: "Page actions" }));
    fireEvent.click(
      within(document.body).getByRole("menuitem", { name: "Remove quick link" }),
    );

    expect(onRemoveQuickLink).toHaveBeenCalledWith("AAAAAAAAAAAAAAAAAAAAAAAAAA");
  });

  test("hides page actions menu when collapsed", () => {
    const { queryByRole } = render(
      <QuickLinksPanel
        api={mockApi}
        quickLinks={[
          { nodeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA", label: "Features", icon: "★" },
        ]}
        activeView="node-page"
        activeNodeId={null}
        collapsed
        {...nodeActionMocks()}
      />,
    );

    expect(queryByRole("button", { name: "Page actions" })).toBeNull();
  });

  test("renders reorderable quick links as native anchors", () => {
    renderReorderableQuickLinks();
    const links = document.querySelectorAll("a.tome-side-panel-item.is-reorderable");
    expect(links).toHaveLength(2);
    expect(links[0]?.tagName).toBe("A");
    expect(links[0]?.getAttribute("href")).toContain(NODE_A);
    expect(links[1]?.getAttribute("href")).toContain(NODE_B);
    expect(document.querySelectorAll("button.tome-side-panel-item")).toHaveLength(0);
  });

  test("does not mark links reorderable when only one quick link", () => {
    render(
      <QuickLinksPanel
        api={mockApi}
        quickLinks={[
          { nodeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA", label: "Features", icon: "★" },
        ]}
        activeView="node-page"
        activeNodeId={null}
        collapsed={false}
        onQuickLinksReorder={mock(async () => {})}
        {...nodeActionMocks()}
      />,
    );

    expect(document.querySelector(".tome-side-panel-item.is-reorderable")).toBeNull();
    expect(document.querySelector("a.tome-side-panel-item")).not.toBeNull();
  });

  test("reorderable quick link click navigates when drag did not activate", () => {
    const { getByRole } = renderReorderableQuickLinks();
    const link = getByRole("link", { name: /^Features$/ });

    fireEvent.click(link);

    expect(assignedUrl).toContain(`node=${NODE_A}`);
  });

  test("reorderable quick links do not show grab cursor until dragging", () => {
    renderReorderableQuickLinks();
    const link = document.querySelector(".tome-side-panel-item.is-reorderable");
    expect(link).not.toBeNull();
    expect(getComputedStyle(link!).cursor).not.toBe("grab");
  });

  test("non-reorderable quick links remain anchors with href", () => {
    const { getByRole } = render(
      <QuickLinksPanel
        api={mockApi}
        quickLinks={[{ nodeId: NODE_A, label: "Features", icon: "★" }]}
        activeView="node-page"
        activeNodeId={null}
        collapsed={false}
        onQuickLinksReorder={mock(async () => {})}
        {...nodeActionMocks()}
      />,
    );

    const link = getByRole("link", { name: /Features/ });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toContain(NODE_A);
  });

  test("returns null when quick links are empty", () => {
    const { container } = render(
      <QuickLinksPanel
        api={mockApi}
        quickLinks={[]}
        activeView="node-page"
        collapsed={false}
        {...nodeActionMocks()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
