import { describe, expect, test, mock } from "bun:test";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { AddRelationshipDialog } from "../../../src/webview/components/AddRelationshipDialog";
import type { EditorApi } from "../../../src/webview/api/client";
import { makeMockEditorApi } from "../test-fixtures/mock-api";
import { FIXTURE_PAGE_ID, FIXTURE_TARGET_ID } from "../test-fixtures/node-page";

describe("AddRelationshipDialog", () => {
  test("links target after type and record are selected", async () => {
    const linkOutgoingRelationship = mock(async () => {});
    const onLinked = mock(() => {});
    const onClose = mock(() => {});
    const api: EditorApi = {
      ...makeMockEditorApi(),
      listRelationshipTypes: async () => ["features"],
      getRelationshipLinkOptions: async () => ({ allowedTargetTypeIds: null }),
      search: async () => [
        {
          id: FIXTURE_TARGET_ID,
          title: "Target record",
          primaryTypeTitle: null,
        },
      ],
      linkOutgoingRelationship,
    };

    const view = render(
      <AddRelationshipDialog
        api={api}
        nodeId={FIXTURE_PAGE_ID}
        open
        onClose={onClose}
        onLinked={onLinked}
      />,
    );

    const featureOption = await within(view.container).findByRole("option", {
      name: /Features/i,
    });
    fireEvent.click(featureOption);

    const targetSearch = await within(view.container).findByPlaceholderText(/Search records/i);
    fireEvent.change(targetSearch, { target: { value: "Target" } });
    const targetOption = await within(view.container).findByRole("option", {
      name: /Target record/i,
    });
    fireEvent.click(targetOption);

    await waitFor(() => {
      expect(linkOutgoingRelationship).toHaveBeenCalledWith(FIXTURE_PAGE_ID, {
        type: "features",
        targetId: FIXTURE_TARGET_ID,
      });
    });
    expect(onLinked).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
