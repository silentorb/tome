import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, within } from "@testing-library/react";
import type { EditorApi } from "../../../src/webview/api/client";
import { QuickLinksPanel } from "../../../src/webview/components/QuickLinksPanel";

const mockApi = {} as EditorApi;

function nodeActionMocks() {
  return {
    onRemoveQuickLink: mock(async () => {}),
    onArchiveNode: mock(async () => {}),
    onDeleteNode: mock(async () => {}),
  };
}

describe("QuickLinksPanel", () => {
  test("renders quick links as native anchors", () => {
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

  test("marks links reorderable when multiple links and onQuickLinksReorder is provided", () => {
    render(
      <QuickLinksPanel
        api={mockApi}
        quickLinks={[
          { nodeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", label: "Features", icon: "★" },
          { nodeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", label: "Scenes", icon: "▶" },
        ]}
        activeView="node-page"
        activeNodeId={null}
        collapsed={false}
        onQuickLinksReorder={mock(async () => {})}
        {...nodeActionMocks()}
      />,
    );

    expect(document.querySelectorAll(".tome-side-panel-item.is-reorderable")).toHaveLength(2);
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
