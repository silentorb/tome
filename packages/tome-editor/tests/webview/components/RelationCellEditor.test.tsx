import { describe, expect, test, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RelationCellEditor } from "../../../src/webview/components/RelationCellEditor";
import { makeMockEditorApi } from "../test-fixtures/mock-api";

describe("RelationCellEditor", () => {
  test("opens popup from edit control and removes link inside dialog", async () => {
    const onRemove = mock(async () => {});
    const { container } = render(
      <RelationCellEditor
        api={makeMockEditorApi()}
        links={[{ targetId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Parent" }]}
        columnName="Parents"
        onAdd={async () => {}}
        onRemove={onRemove}
      />,
    );

    const cell = container.querySelector(".tome-relation-cell");
    expect(cell).toBeTruthy();
    fireEvent.mouseEnter(cell!);

    fireEvent.click(screen.getByRole("button", { name: "Edit Parents links" }));
    expect(screen.getByRole("dialog", { name: "Edit Parents links" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove Parent" }));
    await waitFor(() =>
      expect(onRemove).toHaveBeenCalledWith("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    );
  });

  test("opens popup from empty links area via hit layer", () => {
    const { container } = render(
      <RelationCellEditor
        api={makeMockEditorApi()}
        links={[{ targetId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Parent" }]}
        columnName="Parents"
        onAdd={async () => {}}
        onRemove={async () => {}}
      />,
    );

    const hitArea = container.querySelector(".tome-relation-cell-hit-area");
    expect(hitArea).toBeTruthy();
    fireEvent.click(hitArea!);
    expect(screen.getByRole("dialog", { name: "Edit Parents links" })).toBeTruthy();
  });

  test("standalone cell link uses native href", () => {
    const { container } = render(
      <RelationCellEditor
        api={makeMockEditorApi()}
        links={[{ targetId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Parent" }]}
        columnName="Parents"
        onAdd={async () => {}}
        onRemove={async () => {}}
      />,
    );

    const link = screen.getByRole("link", { name: "Parent" });
    expect(link.getAttribute("href")).toContain("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    fireEvent.click(link);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector(".tome-relation-cell.is-popup-open")).toBeNull();
  });

  test("hides existing links section when there are no relationships", () => {
    render(
      <RelationCellEditor
        api={makeMockEditorApi()}
        links={[]}
        columnName="Parents"
        onAdd={async () => {}}
        onRemove={async () => {}}
      />,
    );

    fireEvent.mouseEnter(document.querySelector(".tome-relation-cell")!);
    fireEvent.click(screen.getByRole("button", { name: "Edit Parents links" }));

    expect(screen.queryByText("No linked records")).toBeNull();
    expect(document.querySelector(".tome-relation-field-popup-links")).toBeNull();
    const search = screen.getByPlaceholderText("Search records…");
    expect(search).toBeTruthy();
    expect(document.activeElement).toBe(search);
  });

  test("adds link inside dialog without closing", async () => {
    const search = mock(async () => [
      { id: "cccccccccccccccccccccccccccccccc", title: "Child", primaryTypeTitle: null },
    ]);
    const onAdd = mock(async () => {});
    const api = {
      ...makeMockEditorApi(),
      search,
    };

    render(
      <RelationCellEditor
        api={api}
        links={[]}
        columnName="Parents"
        onAdd={onAdd}
        onRemove={async () => {}}
      />,
    );

    fireEvent.mouseEnter(document.querySelector(".tome-relation-cell")!);
    fireEvent.click(screen.getByRole("button", { name: "Edit Parents links" }));
    expect(screen.getByRole("dialog", { name: "Edit Parents links" })).toBeTruthy();

    await waitFor(() => expect(search).toHaveBeenCalled());
    const option = await screen.findByRole("option", { name: /Child/ });
    fireEvent.click(option);
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(screen.getByRole("dialog", { name: "Edit Parents links" })).toBeTruthy();
  });

  test("defers onEditingComplete until popup closes after mutations", async () => {
    const onEditingComplete = mock(() => {});
    const search = mock(async () => [
      { id: "cccccccccccccccccccccccccccccccc", title: "Child", primaryTypeTitle: null },
    ]);
    const onAdd = mock(async () => {});
    const api = {
      ...makeMockEditorApi(),
      search,
    };

    render(
      <RelationCellEditor
        api={api}
        links={[]}
        columnName="Parents"
        onAdd={onAdd}
        onRemove={async () => {}}
        onEditingComplete={onEditingComplete}
      />,
    );

    fireEvent.mouseEnter(document.querySelector(".tome-relation-cell")!);
    fireEvent.click(screen.getByRole("button", { name: "Edit Parents links" }));

    await waitFor(() => expect(search).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("option", { name: /Child/ }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onEditingComplete).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Edit Parents links" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onEditingComplete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Edit Parents links" })).toBeNull();
  });

  test("shows link labels and overflow suffix in compact cell", () => {
    const manyLinks = Array.from({ length: 30 }, (_, index) => ({
      targetId: `${index}`.padStart(32, "0"),
      title: `Feat ${index + 1}`,
    }));

    render(
      <RelationCellEditor
        api={makeMockEditorApi()}
        links={manyLinks}
        columnName="Parents"
        onAdd={async () => {}}
        onRemove={async () => {}}
      />,
    );

    expect(screen.getByRole("link", { name: "Feat 1" })).toBeTruthy();
    const body = document.querySelector(".tome-relation-cell-links");
    expect(body?.textContent).toMatch(/\d+\+/);
  });

  test("opens popup when empty links area is clicked beside overflow suffix", () => {
    const manyLinks = Array.from({ length: 30 }, (_, index) => ({
      targetId: `${index}`.padStart(32, "0"),
      title: `Feat ${index + 1}`,
    }));

    const { container } = render(
      <RelationCellEditor
        api={makeMockEditorApi()}
        links={manyLinks}
        columnName="Parents"
        onAdd={async () => {}}
        onRemove={async () => {}}
      />,
    );

    fireEvent.click(container.querySelector(".tome-relation-cell-hit-area")!);
    expect(screen.getByRole("dialog", { name: "Edit Parents links" })).toBeTruthy();
  });

  test("clicking a visible link does not open edit popup", () => {
    render(
      <RelationCellEditor
        api={makeMockEditorApi()}
        links={[{ targetId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Parent" }]}
        columnName="Parents"
        onAdd={async () => {}}
        onRemove={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "Parent" }));
    expect(screen.queryByRole("dialog", { name: "Edit Parents links" })).toBeNull();
  });

  test("sorts existing links by title in edit popup", () => {
    const { container } = render(
      <RelationCellEditor
        api={makeMockEditorApi()}
        links={[
          { targetId: "cccccccccccccccccccccccccccccccc", title: "Zeta Parent" },
          { targetId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Alpha Parent" },
          { targetId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Mike Parent" },
        ]}
        columnName="Parents"
        onAdd={async () => {}}
        onRemove={async () => {}}
      />,
    );

    fireEvent.mouseEnter(container.querySelector(".tome-relation-cell")!);
    fireEvent.click(screen.getByRole("button", { name: "Edit Parents links" }));

    const popupLinks = document.querySelectorAll(".tome-relation-field-popup-link");
    expect([...popupLinks].map((link) => link.textContent)).toEqual([
      "Alpha Parent",
      "Mike Parent",
      "Zeta Parent",
    ]);
  });
});
