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
  { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Alpha Scene", primaryTypeTitle: null },
  { id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Beta Feature", primaryTypeTitle: null },
];

const resultsWithPreview: NodeSummary[] = [
  {
    id: "cccccccccccccccccccccccccccccccc",
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
    expect(link.getAttribute("href")).toContain("node=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  test("shows body match preview when search node contents is enabled", async () => {
    const search = mock(async () => resultsWithPreview);
    const api = makeApi(resultsWithPreview, { search });

    const { container } = renderGlobalSearch({
      api,
      open: true,
      onOpenChange: () => {},
    });

    const checkbox = container.querySelector(
      ".tome-global-search-config-item input",
    ) as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(container.querySelector(".tome-global-search-preview")).toBeTruthy();
    });

    const preview = container.querySelector(".tome-global-search-preview");
    expect(preview?.querySelector("strong")?.textContent).toBe("needle");
  });

  test("hides body match preview when search node contents is disabled", async () => {
    const search = mock(async () => resultsWithPreview);
    const api = makeApi(resultsWithPreview, { search });

    const { container } = renderGlobalSearch({
      api,
      open: true,
      onOpenChange: () => {},
    });

    await waitFor(() => {
      expect(container.querySelector(".tome-global-search-title")).toBeTruthy();
    });

    expect(container.querySelector(".tome-global-search-preview")).toBeNull();
  });

  test("passes includeBody when search node contents is enabled", async () => {
    const search = mock(async () => sampleResults);
    const api = makeApi(sampleResults, { search });

    const { container } = renderGlobalSearch({
      api,
      open: true,
      onOpenChange: () => {},
    });

    await waitFor(() => {
      expect(search).toHaveBeenCalled();
    });

    const checkbox = container.querySelector(
      ".tome-global-search-config-item input",
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(search).toHaveBeenCalledWith("", 25, undefined, { includeBody: true });
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
});
