import { describe, expect, mock, test } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { TEST_HOME_NODE_ID, defaultTestWorkspaceFile } from "tome-db/content/test-helpers";
import { isHomeNavActive, SidePanel } from "../../../src/webview/components/SidePanel";
import { UserSettingsProvider } from "../../../src/webview/hooks/useUserSettings";
import { makeMockEditorApi } from "../test-fixtures/mock-api";

function renderSidePanel(ui: ReactElement) {
  return render(<UserSettingsProvider api={makeMockEditorApi()}>{ui}</UserSettingsProvider>);
}

describe("SidePanel home nav", () => {
  const featuresNodeId = "0000000000000000000000002P";

  test("isHomeNavActive matches home node only on node-page view", () => {
    expect(isHomeNavActive("node-page", TEST_HOME_NODE_ID, TEST_HOME_NODE_ID)).toBe(
      true,
    );
    expect(isHomeNavActive("node-page", featuresNodeId, TEST_HOME_NODE_ID)).toBe(
      false,
    );
    expect(isHomeNavActive("graph-explorer", TEST_HOME_NODE_ID, TEST_HOME_NODE_ID)).toBe(
      false,
    );
    expect(isHomeNavActive("node-page", TEST_HOME_NODE_ID, null)).toBe(false);
  });
});

describe("SidePanel corpus switcher", () => {
  test("shows corpus dropdown and calls onCorpusChange", () => {
    const api = makeMockEditorApi();
    const onCorpusChange = mock(() => {});
    const workspace = {
      ...defaultTestWorkspaceFile(),
      archiveNodeTitle: "Archive",
    };
    renderSidePanel(
      <SidePanel
        api={api}
        activeView="node-page"
        homeNodeId={TEST_HOME_NODE_ID}
        corpora={[
          {
            id: "marloth",
            access: "readwrite",
            label: "Marloth",
            homeNodeId: TEST_HOME_NODE_ID,
            archiveNodeId: workspace.archiveNodeId,
            workspace,
          },
          {
            id: "translucence",
            access: "readonly",
            label: "Translucence",
            homeNodeId: TEST_HOME_NODE_ID,
            archiveNodeId: workspace.archiveNodeId,
            workspace,
          },
        ]}
        activeCorpusId="marloth"
        onCorpusChange={onCorpusChange}
        corpusReadonly
        onViewChange={() => {}}
        onNewPage={() => {}}
        onOpenSearch={() => {}}
      />,
    );

    const select = screen.getByLabelText("Active corpus") as HTMLSelectElement;
    expect(select.value).toBe("marloth");
    fireEvent.change(select, { target: { value: "translucence" } });
    expect(onCorpusChange).toHaveBeenCalledWith("translucence");
    expect(screen.queryByTitle("New page")).toBeNull();
  });

  test("hides corpus dropdown for a single corpus", () => {
    const api = makeMockEditorApi();
    const workspace = {
      ...defaultTestWorkspaceFile(),
      archiveNodeTitle: "Archive",
    };
    renderSidePanel(
      <SidePanel
        api={api}
        activeView="node-page"
        homeNodeId={TEST_HOME_NODE_ID}
        corpora={[
          {
            id: "default",
            access: "readwrite",
            label: "Tome",
            homeNodeId: TEST_HOME_NODE_ID,
            archiveNodeId: workspace.archiveNodeId,
            workspace,
          },
        ]}
        activeCorpusId="default"
        onViewChange={() => {}}
        onNewPage={() => {}}
        onOpenSearch={() => {}}
      />,
    );
    expect(screen.queryByLabelText("Active corpus")).toBeNull();
    expect(screen.getByTitle("New page")).toBeTruthy();
  });
});
