import { describe, expect, mock, test, afterEach, beforeEach } from "bun:test";
import { createEvent, fireEvent, render, within } from "@testing-library/react";
import type { EditorApi } from "../../../src/webview/api/client";
import { QuickLinksPanel } from "../../../src/webview/components/QuickLinksPanel";

const mockApi = {} as EditorApi;
const NODE_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NODE_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function nodeActionMocks() {
  return {
    onRemoveQuickLink: mock(async () => {}),
    onArchiveNode: mock(async () => {}),
    onDeleteNode: mock(async () => {}),
  };
}

function renderReorderableQuickLinks() {
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
      onQuickLinksReorder={mock(async () => {})}
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
    window.location.assign = ((url: string | URL) => {
      assignedUrl = String(url);
    }) as typeof window.location.assign;
  });

  afterEach(() => {
    window.location.assign = originalAssign;
  });

  test("renders non-reorderable quick links as native anchors", () => {
    const { getByRole } = render(
      <QuickLinksPanel
        api={mockApi}
        quickLinks={[
          { nodeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", label: "Features", icon: "★" },
        ]}
        activeView="node-page"
        activeNodeId={null}
        collapsed={false}
        {...nodeActionMocks()}
      />,
    );

    const link = getByRole("link", { name: /Features/ });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toContain("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  test("calls onRemoveQuickLink from page actions menu", async () => {
    const onRemoveQuickLink = mock(async () => {});

    const { getByRole } = render(
      <QuickLinksPanel
        api={mockApi}
        quickLinks={[
          { nodeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", label: "Features", icon: "★" },
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

    expect(onRemoveQuickLink).toHaveBeenCalledWith("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  test("hides page actions menu when collapsed", () => {
    const { queryByRole } = render(
      <QuickLinksPanel
        api={mockApi}
        quickLinks={[
          { nodeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", label: "Features", icon: "★" },
        ]}
        activeView="node-page"
        activeNodeId={null}
        collapsed
        {...nodeActionMocks()}
      />,
    );

    expect(queryByRole("button", { name: "Page actions" })).toBeNull();
  });

  test("renders reorderable quick links as buttons", () => {
    renderReorderableQuickLinks();
    const buttons = document.querySelectorAll("button.tome-side-panel-item.is-reorderable");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.tagName).toBe("BUTTON");
    expect(document.querySelectorAll("a.tome-side-panel-item")).toHaveLength(0);
  });

  test("does not mark links reorderable when only one quick link", () => {
    render(
      <QuickLinksPanel
        api={mockApi}
        quickLinks={[
          { nodeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", label: "Features", icon: "★" },
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

  test("reorderable quick link pointerup navigates when drag did not activate", () => {
    const { getByRole } = renderReorderableQuickLinks();
    const button = getByRole("button", { name: /^Features$/ });

    fireEvent.pointerUp(button, { button: 0, bubbles: true });

    expect(assignedUrl).toContain(`node=${NODE_A}`);
  });

  test("reorderable quick link swallows synthetic click", () => {
    const { getByRole } = renderReorderableQuickLinks();
    const button = getByRole("button", { name: /^Features$/ });
    const clickEvent = createEvent.click(button, { bubbles: true, cancelable: true });
    fireEvent(button, clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(assignedUrl).toBeNull();
  });

  test("reorderable quick links do not show grab cursor until dragging", () => {
    renderReorderableQuickLinks();
    const link = document.querySelector(".tome-side-panel-item.is-reorderable");
    expect(link).not.toBeNull();
    expect(getComputedStyle(link!).cursor).not.toBe("grab");
  });

  test("non-reorderable quick links use native pointer behavior", () => {
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
    const clickEvent = createEvent.click(link, { bubbles: true, cancelable: true });
    fireEvent(link, clickEvent);

    expect(clickEvent.defaultPrevented).toBe(false);
    expect(assignedUrl).toBeNull();
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
