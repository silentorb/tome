import { describe, expect, test, mock } from "bun:test";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { AddRelationshipDialog } from "../../../src/webview/components/AddRelationshipDialog";
import type { EditorApi } from "../../../src/webview/api/client";
import { emptyUserSettings } from "../../../src/shared/user-settings";
import { UserSettingsProvider } from "../../../src/webview/hooks/useUserSettings";
import { makeMockEditorApi } from "../test-fixtures/mock-api";
import { FIXTURE_PAGE_ID, FIXTURE_TARGET_ID } from "../test-fixtures/node-page";

const FEATURES_TYPE = "000000000000000000000000B2:0";

describe("AddRelationshipDialog", () => {
  test("links target after type and record are selected", async () => {
    const linkOutgoingRelationship = mock(async () => {});
    const patchUserSettings = mock(async () => emptyUserSettings());
    const onLinked = mock(() => {});
    const onClose = mock(() => {});
    const search = mock(
      async (
        _query: string,
        _limit?: number,
        _allowedTypeIds?: string[],
        _options?: {
          role?: "title" | "content";
          participatesInProjectionType?: string;
          onlyActivePickingRole?: "source" | "target";
        },
      ) => ({
        results: [
          {
            id: FIXTURE_TARGET_ID,
            title: "Target record",
            primaryTypeTitle: null,
          },
        ],
        searchAvailable: true,
      }),
    );
    const api: EditorApi = {
      ...makeMockEditorApi(),
      patchUserSettings,
      listRelationshipTypes: async () => [
        { type: FEATURES_TYPE, label: "Features" },
      ],
      getRelationshipLinkOptions: async () => ({ allowedTargetTypeIds: null }),
      search,
      linkOutgoingRelationship,
    };

    const view = render(
      <UserSettingsProvider api={api}>
        <AddRelationshipDialog
          api={api}
          nodeId={FIXTURE_PAGE_ID}
          open
          onClose={onClose}
          onLinked={onLinked}
        />
      </UserSettingsProvider>,
    );

    expect(await within(view.container).findByLabelText("Only active")).toBeTruthy();
    expect(
      (within(view.container).getByLabelText("Only active") as HTMLInputElement).checked,
    ).toBe(true);

    const featureOption = await within(view.container).findByRole("option", {
      name: /Features/i,
    });
    fireEvent.click(featureOption);

    await waitFor(() => {
      expect(search).toHaveBeenCalled();
    });
    const lastSearch = search.mock.calls.at(-1);
    expect(lastSearch?.[3]).toEqual({
      role: "title",
      participatesInProjectionType: FEATURES_TYPE,
      onlyActivePickingRole: "target",
    });

    const targetSearch = await within(view.container).findByPlaceholderText(/Search records/i);
    fireEvent.change(targetSearch, { target: { value: "Target" } });
    const targetOption = await within(view.container).findByRole("option", {
      name: /Target record/i,
    });
    fireEvent.click(targetOption);

    await waitFor(() => {
      expect(linkOutgoingRelationship).toHaveBeenCalledWith(FIXTURE_PAGE_ID, {
        type: FEATURES_TYPE,
        targetId: FIXTURE_TARGET_ID,
      });
    });
    expect(onLinked).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => {
      expect(patchUserSettings).toHaveBeenCalledWith({
        relationships: { recentAssociationTypes: [FEATURES_TYPE] },
      });
    });
  });

  test("omits participation filter when Only active is unchecked", async () => {
    const search = mock(
      async (
        _query: string,
        _limit?: number,
        _allowedTypeIds?: string[],
        _options?: {
          role?: "title" | "content";
          participatesInProjectionType?: string;
          onlyActivePickingRole?: "source" | "target";
        },
      ) => ({ results: [], searchAvailable: true }),
    );
    const api: EditorApi = {
      ...makeMockEditorApi(),
      listRelationshipTypes: async () => [
        { type: FEATURES_TYPE, label: "Features" },
      ],
      getRelationshipLinkOptions: async () => ({ allowedTargetTypeIds: null }),
      search,
    };

    const view = render(
      <UserSettingsProvider api={api}>
        <AddRelationshipDialog
          api={api}
          nodeId={FIXTURE_PAGE_ID}
          open
          onClose={() => {}}
        />
      </UserSettingsProvider>,
    );

    fireEvent.click(await within(view.container).findByLabelText("Only active"));
    fireEvent.click(
      await within(view.container).findByRole("option", { name: /Features/i }),
    );

    await waitFor(() => {
      expect(search).toHaveBeenCalled();
    });
    const lastSearch = search.mock.calls.at(-1);
    expect(lastSearch?.[3]).toEqual({
      role: "title",
      participatesInProjectionType: undefined,
      onlyActivePickingRole: "target",
    });
  });
});
