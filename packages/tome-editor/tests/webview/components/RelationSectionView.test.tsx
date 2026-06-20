import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { UserSettingsProvider } from "../../../src/webview/hooks/useUserSettings";
import { RelationSectionView } from "../../../src/webview/components/RelationSectionView";
import { FIXTURE_PAGE_ID, FIXTURE_TARGET_ID, FIXTURE_TYPE_ID, makeRelationSection } from "../test-fixtures/node-page";
import { makeMockEditorApi } from "../test-fixtures/mock-api";

function renderRelationSection() {
  const api = makeMockEditorApi();
  return render(
    <UserSettingsProvider api={api}>
      <RelationSectionView
        api={api}
        nodeId={FIXTURE_PAGE_ID}
        section={makeRelationSection()}
      />
    </UserSettingsProvider>,
  );
}

describe("RelationSectionView", () => {
  test("renders row links with node query URLs", () => {
    renderRelationSection();

    const link = screen.getByRole("link", { name: "Linked record" });
    expect(link.getAttribute("href")).toContain(`node=${FIXTURE_TARGET_ID}`);
    expect(screen.getByRole("columnheader", { name: /Priority/ })).toBeTruthy();
    const priorityTrigger = screen.getByRole("button", { name: "Priority", expanded: false });
    expect(priorityTrigger.textContent).toBe("High");
    expect(priorityTrigger.getAttribute("aria-haspopup")).toBe("listbox");
  });

  test("section title link targets type node", () => {
    renderRelationSection();

    const link = screen.getByRole("link", { name: "Related items" });
    expect(link.getAttribute("href")).toContain(`node=${FIXTURE_TYPE_ID}`);
  });

  test("renders sortable column headers", () => {
    renderRelationSection();

    expect(screen.getByRole("button", { name: /Name/ })).toBeTruthy();
    const priorityHeader = screen.getByRole("columnheader", { name: /Priority/ });
    expect(within(priorityHeader).getByRole("button")).toBeTruthy();
  });

  test("renders link existing control when addMode is link-existing", () => {
    renderRelationSection();
    expect(screen.getByRole("button", { name: "Link" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Link Related item" })).toBeTruthy();
  });

  test("hides add control when addMode is none", () => {
    const api = makeMockEditorApi();
    render(
      <UserSettingsProvider api={api}>
        <RelationSectionView
          api={api}
          nodeId={FIXTURE_PAGE_ID}
          section={makeRelationSection({ addMode: "none" })}
        />
      </UserSettingsProvider>,
    );

    expect(screen.queryByRole("button", { name: "Link" })).toBeNull();
    expect(screen.queryByRole("button", { name: /\+ Link/ })).toBeNull();
  });

  test("filters rows using search_<label> URL param", () => {
    window.history.replaceState(
      {},
      "",
      "http://127.0.0.1:5173/?node=abc&search_RELATED=linked",
    );
    renderRelationSection();

    expect(
      (screen.getByRole("searchbox", { name: "Filter table rows by name" }) as HTMLInputElement).value,
    ).toBe("linked");
    expect(screen.getByRole("link", { name: "Linked record" })).toBeTruthy();
  });

  test("filters rows when typing in search input", () => {
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=abc");
    renderRelationSection();

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter table rows by name" }), {
      target: { value: "nope" },
    });

    expect(screen.getByText('No rows match “nope”.')).toBeTruthy();
    expect(window.location.search).toContain("search_RELATED=nope");
  });
});
