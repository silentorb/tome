import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, mock } from "bun:test";
import { useState } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { RecordLinkPicker } from "../../../src/webview/components/RecordLinkPicker";
import { makeMockEditorApi } from "../test-fixtures/mock-api";
import type { EditorApi } from "../../../src/webview/api/client";

const COMPONENT_DIR = import.meta.dir;

describe("RecordLinkPicker CSS", () => {
  const pickerCss = readFileSync(join(COMPONENT_DIR, "../../../src/webview/components/record-link-picker.css"), "utf8");
  const relationCss = readFileSync(join(COMPONENT_DIR, "../../../src/webview/components/relation-cell-editor.css"), "utf8");

  test("base list uses bounded vertical scroll", () => {
    expect(pickerCss).toMatch(/\.tome-record-link-picker-list[\s\S]*max-height:\s*240px/);
    expect(pickerCss).toMatch(/\.tome-record-link-picker-list[\s\S]*overflow-y:\s*auto/);
    expect(pickerCss).toMatch(/\.tome-record-link-picker-list[\s\S]*overscroll-behavior:\s*contain/);
  });

  test("embedded relation popup list uses bounded vertical scroll", () => {
    expect(relationCss).toMatch(
      /\.tome-relation-field-popup-add \.tome-record-link-picker-list[\s\S]*max-height:\s*200px/,
    );
    expect(relationCss).toMatch(
      /\.tome-relation-field-popup-add \.tome-record-link-picker-list[\s\S]*overflow-y:\s*auto/,
    );
    expect(relationCss).toMatch(
      /\.tome-relation-field-popup-add \.tome-record-link-picker-list[\s\S]*overscroll-behavior:\s*contain/,
    );
  });
});

describe("RecordLinkPicker", () => {
  test("preserves API result order without re-sorting", async () => {
    const search = mock(async () => [
      { id: "cccccccccccccccccccccccccccccccc", title: "Zeta", primaryTypeTitle: null },
      { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Alpha", primaryTypeTitle: null },
      { id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Mike", primaryTypeTitle: null },
    ]);
    const api = {
      ...makeMockEditorApi(),
      search,
    };

    const view = render(
      <RecordLinkPicker
        api={api}
        embedded
        excludedIds={[]}
        ariaLabel="Search records"
        onSelect={async () => {}}
        onClose={() => {}}
      />,
    );

    await waitFor(() => expect(search).toHaveBeenCalled());
    await waitFor(async () => {
      expect(await view.findAllByRole("option")).toHaveLength(3);
    });
    const options = await view.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Zeta", "Alpha", "Mike"]);
  });

  test("omits excluded ids from search results", async () => {
    const search = mock(async () => [
      { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Alpha", primaryTypeTitle: null },
      { id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Beta", primaryTypeTitle: null },
      { id: "cccccccccccccccccccccccccccccccc", title: "Gamma", primaryTypeTitle: null },
    ]);
    const api = {
      ...makeMockEditorApi(),
      search,
    };

    const view = render(
      <RecordLinkPicker
        api={api}
        embedded
        excludedIds={["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]}
        ariaLabel="Search records"
        onSelect={async () => {}}
        onClose={() => {}}
      />,
    );

    await waitFor(() => expect(search).toHaveBeenCalled());
    await waitFor(async () => {
      expect(await view.findAllByRole("option")).toHaveLength(2);
    });
    const options = await view.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Alpha", "Gamma"]);
  });

  test("requests full type-scoped result set when allowedTypeIds is set", async () => {
    const search = mock(async () => []);
    const api = {
      ...makeMockEditorApi(),
      search,
    };
    const featuresDbId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    render(
      <RecordLinkPicker
        api={api}
        embedded
        allowedTypeIds={[featuresDbId]}
        excludedIds={[]}
        ariaLabel="Search features"
        onSelect={async () => {}}
        onClose={() => {}}
      />,
    );

    await waitFor(() => expect(search).toHaveBeenCalled());
    expect(search).toHaveBeenCalledWith("", 5000, [featuresDbId]);
  });

  test("focuses search input when autoFocus is set on embedded picker", async () => {
    const search = mock(async () => []);
    const api = {
      ...makeMockEditorApi(),
      search,
    };

    const view = render(
      <RecordLinkPicker
        api={api}
        embedded
        autoFocus
        excludedIds={[]}
        ariaLabel="Search records"
        onSelect={async () => {}}
        onClose={() => {}}
      />,
    );

    await waitFor(() => expect(search).toHaveBeenCalled());
    const input = view.container.querySelector(".tome-record-link-picker-search");
    expect(document.activeElement).toBe(input);
  });

  test("preserves list scroll position after multi-add pick", async () => {
    const items = Array.from({ length: 30 }, (_, index) => ({
      id: `${index}`.padStart(32, "0"),
      title: `Record ${String(index + 1).padStart(2, "0")}`,
      primaryTypeTitle: null,
    }));
    const search = mock(async () => items);
    const onSelect = mock(async (_targetId: string) => {});
    const api = {
      ...makeMockEditorApi(),
      search,
    } as EditorApi;

    function MultiAddPicker() {
      const [excludedIds, setExcludedIds] = useState<readonly string[]>([]);
      return (
        <RecordLinkPicker
          api={api}
          embedded
          closeOnSelect={false}
          excludedIds={excludedIds}
          ariaLabel="Search records"
          onSelect={async (targetId) => {
            await onSelect(targetId);
            setExcludedIds((prev) => [...prev, targetId]);
          }}
          onClose={() => {}}
        />
      );
    }

    const view = render(<MultiAddPicker />);
    await waitFor(() => expect(search).toHaveBeenCalled());
    await waitFor(async () => {
      expect(await view.findAllByRole("option")).toHaveLength(30);
    });

    const list = view.container.querySelector(".tome-record-link-picker-list");
    expect(list).toBeTruthy();
    Object.defineProperty(list!, "scrollTop", { value: 200, writable: true, configurable: true });
    const scrollTopBefore = list!.scrollTop;

    const target = await view.findByRole("option", { name: /Record 15/ });
    fireEvent.click(target);
    await waitFor(() => expect(onSelect).toHaveBeenCalled());

    expect(list!.scrollTop).toBe(scrollTopBefore);
    expect(view.container.querySelector(".tome-record-link-picker-search")).toBeTruthy();
  });
});
