import { describe, expect, mock, test } from "bun:test";
import type { ComponentProps } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { GlobalSearch } from "../../../src/webview/components/GlobalSearch";
import type { EditorApi } from "../../../src/webview/api/client";
import type { NodeSummary } from "../../../src/shared/types";
import { UserSettingsProvider } from "../../../src/webview/hooks/useUserSettings";
import {
  applyUserSettingsPatch,
  emptyUserSettings,
  type UserSettings,
} from "../../../src/shared/user-settings";

const sampleResults: NodeSummary[] = [
  { id: "AAAAAAAAAAAAAAAAAAAAAAAAAA", title: "Alpha Scene", primaryTypeTitle: null },
  { id: "BBBBBBBBBBBBBBBBBBBBBBBBBB", title: "Beta Feature", primaryTypeTitle: null },
];

const resultsWithPreview: NodeSummary[] = [
  {
    id: "CCCCCCCCCCCCCCCCCCCCCCCCCC",
    title: "Gamma Note",
    primaryTypeTitle: null,
    matchPreview: {
      parts: [
        { text: "…", highlight: false },
        { text: "before ", highlight: false },
        { text: "needle", highlight: true },
        { text: " after", highlight: false },
        { text: "…", highlight: false },
      ],
    },
  },
];

function makeApi(
  results: NodeSummary[],
  options?: {
    search?: ReturnType<typeof mock>;
    settings?: UserSettings;
    onPatch?: (patch: Parameters<EditorApi["patchUserSettings"]>[0]) => UserSettings;
  },
): EditorApi {
  let settings = options?.settings ?? emptyUserSettings();
  const search =
    options?.search ??
    mock(async () => results);
  return {
    search,
    getUserSettings: mock(async () => settings),
    patchUserSettings: mock(async (patch) => {
      settings = options?.onPatch
        ? options.onPatch(patch)
        : applyUserSettingsPatch(settings, patch);
      return settings;
    }),
  } as unknown as EditorApi;
}

function renderGlobalSearch(
  props: Omit<ComponentProps<typeof GlobalSearch>, "api"> & {
    api?: EditorApi;
    results?: NodeSummary[];
  },
) {
  const api = props.api ?? makeApi(props.results ?? sampleResults);
  return render(
    <UserSettingsProvider api={api}>
      <GlobalSearch open={props.open} onOpenChange={props.onOpenChange} api={api} />
    </UserSettingsProvider>,
  );
}

describe("GlobalSearch", () => {
  test("does not render when closed", () => {
    const { container } = renderGlobalSearch({
      open: false,
      onOpenChange: () => {},
    });
    expect(container.querySelector(".tome-global-search")).toBeNull();
  });

  test("renders result links with node query URLs", async () => {
    const { container } = renderGlobalSearch({
      open: true,
      onOpenChange: () => {},
    });

    await waitFor(() => {
      expect(container.querySelectorAll(".tome-global-search-item")).toHaveLength(2);
    });

    const link = container.querySelector(
      ".tome-global-search-item",
    ) as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toContain("node=AAAAAAAAAAAAAAAAAAAAAAAAAA");
  });

  test("shows body match preview when adapter returns matchPreview", async () => {
    const search = mock(async () => resultsWithPreview);
    const api = makeApi(resultsWithPreview, { search });

    const { container } = renderGlobalSearch({
      api,
      open: true,
      onOpenChange: () => {},
    });

    await waitFor(() => {
      expect(container.querySelector(".tome-global-search-preview")).toBeTruthy();
    });

    const preview = container.querySelector(".tome-global-search-preview");
    expect(preview?.querySelector("strong")?.textContent).toBe("needle");
  });

  test("calls search without includeBody option", async () => {
    const search = mock(async () => sampleResults);
    const api = makeApi(sampleResults, { search });

    renderGlobalSearch({
      api,
      open: true,
      onOpenChange: () => {},
    });

    await waitFor(() => {
      expect(search).toHaveBeenCalledWith("", 25);
    });
  });

  test("closes on Escape", () => {
    const onOpenChange = mock((_open: boolean) => {});
    renderGlobalSearch({
      open: true,
      onOpenChange,
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("shows muted corpus label suffix when present on a result", async () => {
    const results: NodeSummary[] = [
      {
        id: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
        title: "Alpha Scene",
        primaryTypeTitle: null,
        corpusId: "other",
        corpusLabel: "Translucence",
      },
      {
        id: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
        title: "Beta Feature",
        primaryTypeTitle: null,
        corpusId: "active",
      },
    ];
    const { container } = renderGlobalSearch({
      open: true,
      onOpenChange: () => {},
      results,
    });

    await waitFor(() => {
      expect(container.querySelector(".tome-corpus-suffix")?.textContent).toBe("Translucence");
    });

    const titles = [...container.querySelectorAll(".tome-global-search-title")].map(
      (el) => el.textContent,
    );
    expect(titles[0]).toBe("Alpha SceneTranslucence");
    expect(titles[1]).toBe("Beta Feature");
  });
});
