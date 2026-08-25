import { describe, expect, test, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { filterAndSortAssociations, AssociationPicker } from "../../../src/webview/components/AssociationPicker";
import { makeMockEditorApi } from "../test-fixtures/mock-api";
import type { EditorApi } from "../../../src/webview/api/client";

const FEATURES_TYPE = "000000000000000000000000B2:0";
const SURREAL_TYPE = "000000000000000000000000B3:0";
const APPLIED_TYPE = "000000000000000000000000B4:0";

describe("filterAndSortAssociations", () => {
  test("returns types in source order when query is empty", () => {
    const types = [
      { type: "z", label: "Zeta" },
      { type: "a", label: "Alpha" },
      { type: "m", label: "Mike" },
    ];
    expect(filterAndSortAssociations(types, "")).toEqual(types);
    expect(filterAndSortAssociations(types, "  ")).toEqual(types);
  });

  test("sorts filtered types by label relevance when query is non-empty", () => {
    const types = [
      { type: APPLIED_TYPE, label: "Applied Surrealism" },
      { type: SURREAL_TYPE, label: "Surreal" },
      { type: FEATURES_TYPE, label: "Features" },
    ];
    expect(filterAndSortAssociations(types, "surreal")).toEqual([
      { type: SURREAL_TYPE, label: "Surreal" },
      { type: APPLIED_TYPE, label: "Applied Surrealism" },
    ]);
  });

  test("does not match opaque type ids", () => {
    const types = [{ type: FEATURES_TYPE, label: "Features" }];
    expect(filterAndSortAssociations(types, FEATURES_TYPE.slice(0, 8))).toEqual([]);
  });
});

describe("AssociationPicker", () => {
  test("shows perspective labels without type ids", async () => {
    const api = {
      ...makeMockEditorApi(),
      listRelationshipTypes: mock(async () => [
        { type: FEATURES_TYPE, label: "Features" },
        { type: SURREAL_TYPE, label: "Surreal" },
      ]),
    } as EditorApi;

    const view = render(
      <AssociationPicker
        api={api}
        selectedType={null}
        ariaLabel="Relationship type"
        onSelect={() => {}}
      />,
    );

    const options = await view.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Features", "Surreal"]);
    expect(view.container.textContent).not.toContain(FEATURES_TYPE);
    expect(view.container.textContent).not.toContain(SURREAL_TYPE);
  });

  test("selects by type id while displaying the label", async () => {
    const onSelect = mock((_type: string, _label?: string) => {});
    const api = {
      ...makeMockEditorApi(),
      listRelationshipTypes: mock(async () => [
        { type: FEATURES_TYPE, label: "Features" },
      ]),
    } as EditorApi;

    const view = render(
      <AssociationPicker
        api={api}
        selectedType={null}
        ariaLabel="Relationship type"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(await view.findByRole("option", { name: "Features" }));
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(FEATURES_TYPE, "Features");
    });
  });
});
