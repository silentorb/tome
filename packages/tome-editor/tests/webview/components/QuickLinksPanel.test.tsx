import { describe, expect, mock, test, afterEach, beforeEach } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QuickLinksPanel } from "../../../src/webview/components/QuickLinksPanel";
import { setStandaloneNavigationHandler } from "../../../src/webview/node-links";
import {
  attachStandaloneChromeNavigation,
  resetStandaloneChromeNavigation,
} from "../../../src/webview/standalone-navigation";

const NODE_A = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const NODE_B = "BBBBBBBBBBBBBBBBBBBBBBBBBB";

function nodeActionMocks() {
  return {
    onRemoveQuickLink: mock(async () => {}),
  };
}

function renderReorderableQuickLinks(onQuickLinksReorder = mock(async () => {})) {
  return render(
    <QuickLinksPanel
      quickLinks={[
        { nodeId: NODE_A, label: "Features" },
        { nodeId: NODE_B, label: "Scenes" },
      ]}
      activeView="node-page"
      activeNodeId={null}
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
        quickLinks={[
          { nodeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA", label: "Features" },
        ]}
        activeView="node-page"
        activeNodeId={null}
        {...nodeActionMocks()}
      />,
    );

    const link = getByRole("link", { name: /Features/ });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toContain("AAAAAAAAAAAAAAAAAAAAAAAAAA");
  });

  test("row menu only offers Remove", async () => {
    const onRemoveQuickLink = mock(async () => {});

    const { getByRole } = render(
      <QuickLinksPanel
        quickLinks={[
          { nodeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA", label: "Features" },
        ]}
        activeView="node-page"
        activeNodeId={null}
        onRemoveQuickLink={onRemoveQuickLink}
      />,
    );

    fireEvent.click(getByRole("button", { name: "Page actions" }));
    const menu = within(document.body).getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Remove" })).toBeTruthy();
    expect(within(menu).queryByRole("menuitem", { name: "Remove quick link" })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "Relate" })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "Archive" })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "Delete" })).toBeNull();
    expect(screen.queryAllByRole("menuitem")).toHaveLength(1);

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Remove" }));
    expect(onRemoveQuickLink).toHaveBeenCalledWith("AAAAAAAAAAAAAAAAAAAAAAAAAA");
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
        quickLinks={[
          { nodeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA", label: "Features" },
        ]}
        activeView="node-page"
        activeNodeId={null}
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
        quickLinks={[{ nodeId: NODE_A, label: "Features" }]}
        activeView="node-page"
        activeNodeId={null}
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
        quickLinks={[]}
        activeView="node-page"
        {...nodeActionMocks()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
