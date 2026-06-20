import { describe, expect, mock, test } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import type { EditorApi } from "../../../src/webview/api/client";
import type { NodeSummary } from "../../../src/shared/types";
import { UserSettingsProvider } from "../../../src/webview/hooks/useUserSettings";
import { RecentNodesPanel } from "../../../src/webview/components/RecentNodesPanel";
import { emptyUserSettings } from "../../../src/shared/user-settings";

const recentNodes: NodeSummary[] = [
  {
    id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    title: "Newer Page",
    primaryTypeTitle: "Scenes",
  },
  {
    id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    title: "Older Page",
    primaryTypeTitle: null,
  },
];

function makeApi(listRecent = mock(async () => recentNodes)): EditorApi {
  return {
    listRecent,
    getUserSettings: mock(async () => emptyUserSettings()),
    patchUserSettings: mock(async () => emptyUserSettings()),
  } as unknown as EditorApi;
}

describe("RecentNodesPanel", () => {
  test("renders recent node links with native hrefs", async () => {
    const api = makeApi();
    const { container } = render(
      <UserSettingsProvider api={api}>
        <RecentNodesPanel
          api={api}
          activeView="node-page"
          activeNodeId="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          homeNodeId="cccccccccccccccccccccccccccccccc"
          collapsed={false}
          refreshKey={0}
          pageBase="http://127.0.0.1:5173/?node=home"
        />
      </UserSettingsProvider>,
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".tome-side-panel-item").length).toBe(2);
    });

    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>("a.tome-side-panel-item"));
    expect(links[0]?.href).toContain("node=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(links[1]?.href).toContain("node=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(links[0]?.classList.contains("is-active")).toBe(true);
    expect(container.querySelector(".tome-side-panel-section-label")?.textContent).toBe("Recent");
  });

  test("renders nothing when the API returns no nodes", async () => {
    const api = makeApi(mock(async () => []));
    const { container } = render(
      <UserSettingsProvider api={api}>
        <RecentNodesPanel
          api={api}
          activeView="node-page"
          collapsed={false}
          refreshKey={0}
        />
      </UserSettingsProvider>,
    );

    await waitFor(() => {
      expect(api.listRecent).toHaveBeenCalled();
    });
    expect(container.querySelector(".tome-side-panel-section")).toBeNull();
  });
});
