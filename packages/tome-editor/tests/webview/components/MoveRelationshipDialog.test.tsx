import { describe, expect, test, mock } from "bun:test";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { MoveRelationshipDialog } from "../../../src/webview/components/MoveRelationshipDialog";
import type { EditorApi } from "../../../src/webview/api/client";
import { UserSettingsProvider } from "../../../src/webview/hooks/useUserSettings";
import { makeMockEditorApi } from "../test-fixtures/mock-api";
import { FIXTURE_PAGE_ID, FIXTURE_TARGET_ID } from "../test-fixtures/node-page";

const FEATURES_TYPE = "000000000000000000000000B2:0";

describe("MoveRelationshipDialog", () => {
  test("applies Only active participation filter by default", async () => {
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
            title: "Destination",
            primaryTypeTitle: null,
          },
        ],
        searchAvailable: true,
      }),
    );
    const onMove = mock(async () => {});
    const api: EditorApi = {
      ...makeMockEditorApi(),
      search,
    };

    const view = render(
      <UserSettingsProvider api={api}>
        <MoveRelationshipDialog
          api={api}
          open
          recordTitle="Row"
          projectionType={FEATURES_TYPE}
          onlyActivePickingRole="target"
          excludedIds={[FIXTURE_PAGE_ID]}
          onClose={() => {}}
          onMove={onMove}
        />
      </UserSettingsProvider>,
    );

    expect(
      (await within(view.container).findByLabelText("Only active") as HTMLInputElement)
        .checked,
    ).toBe(true);

    await waitFor(() => {
      expect(search).toHaveBeenCalled();
    });
    expect(search.mock.calls.at(-1)?.[3]).toEqual({
      role: "title",
      participatesInProjectionType: FEATURES_TYPE,
      onlyActivePickingRole: "target",
    });

    fireEvent.click(
      await within(view.container).findByRole("option", { name: /Destination/i }),
    );
    await waitFor(() => {
      expect(onMove).toHaveBeenCalledWith(FIXTURE_TARGET_ID);
    });
  });
});
