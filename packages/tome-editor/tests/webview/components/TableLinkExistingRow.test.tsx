import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import {
  TableLinkExistingRow,
  TableLinkExistingRowFooter,
  TableLinkExistingRowTrigger,
} from "../../../src/webview/components/TableLinkExistingRow";
import { makeMockEditorApi } from "../test-fixtures/mock-api";

describe("TableLinkExistingRow", () => {
  test("top Link button expands the same footer picker as the footer trigger", () => {
    const api = makeMockEditorApi();
    const onLink = async () => {};

    const view = render(
      <TableLinkExistingRow
        label="Link Feature"
        api={api}
        excludedIds={[]}
        onLink={onLink}
      >
        <TableLinkExistingRowTrigger />
        <TableLinkExistingRowFooter />
      </TableLinkExistingRow>,
    );

    expect(within(view.container).queryByRole("searchbox")).toBeNull();

    fireEvent.click(within(view.container).getByRole("button", { name: "Link" }));

    expect(within(view.container).getByRole("searchbox")).toBeTruthy();
    expect(within(view.container).queryByRole("button", { name: "+ Link Feature" })).toBeNull();
  });

  test("keeps picker open after linking a record", async () => {
    const search = mock(async () => [
      { id: "cccccccccccccccccccccccccccccccc", title: "Linked feature", primaryTypeTitle: null },
    ]);
    const onLink = mock(async () => {});
    const api = {
      ...makeMockEditorApi(),
      search,
    };

    const view = render(
      <TableLinkExistingRow
        label="Link Feature"
        api={api}
        excludedIds={[]}
        onLink={onLink}
      >
        <TableLinkExistingRowFooter />
      </TableLinkExistingRow>,
    );

    fireEvent.click(within(view.container).getByRole("button", { name: "+ Link Feature" }));
    await waitFor(() => expect(search).toHaveBeenCalled());
    fireEvent.click(
      await within(view.container).findByRole("option", { name: /Linked feature/ }),
    );
    await waitFor(() => expect(onLink).toHaveBeenCalled());
    expect(within(view.container).getByRole("searchbox")).toBeTruthy();
    expect(within(view.container).queryByRole("button", { name: "+ Link Feature" })).toBeNull();
  });
});
