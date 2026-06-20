import { mock, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

mock.module("../../../src/webview/components/TomeEditor", () => ({
  TomeEditor: () => <div data-testid="tome-editor-stub" />,
}));

import { PropertiesSectionView } from "../../../src/webview/components/PropertiesSectionView";
import { NodePageView } from "../../../src/webview/components/NodePageView";
import { UserSettingsProvider } from "../../../src/webview/hooks/useUserSettings";
import { makeNodePageDetail, makeDatabaseViewDetail, makeRelationSection } from "../test-fixtures/node-page";
import { makeMockEditorApi } from "../test-fixtures/mock-api";

describe("NodePageView", () => {
  test("renders title, metadata, markdown, and relation sections", () => {
    const api = makeMockEditorApi();

    render(
      <UserSettingsProvider api={api}>
        <NodePageView
          api={api}
          node={makeNodePageDetail()}
          saveState="idle"
          metadataExpanded={false}
          onMetadataExpandedChange={() => {}}
          onBodyChange={() => {}}
          onTitleChange={() => {}}
          onTabSelect={() => {}}
          onOrderedAssociationViewChange={() => {}}
          onArchiveNode={async () => {}}
          onUnarchiveNode={async () => {}}
          onDeleteNode={async () => {}}
        />
      </UserSettingsProvider>,
    );

    const titleField = screen.getByRole("textbox", { name: "Page title" }) as HTMLTextAreaElement;
    expect(titleField.value).toBe("Example page");
    expect(screen.getByRole("button", { name: /Metadata/i })).toBeTruthy();
    expect(screen.getByTestId("tome-editor-stub")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Related items", level: 2 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Linked record" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Page actions" })).toHaveLength(2);
  });

  test("page actions menu includes Relate for linking existing records", () => {
    const api = makeMockEditorApi();
    const node = makeNodePageDetail({
      sections: [{ type: "markdown", body: "# Solo page\n" }],
    });

    render(
      <UserSettingsProvider api={api}>
        <NodePageView
          api={api}
          node={node}
          saveState="idle"
          metadataExpanded={false}
          onMetadataExpandedChange={() => {}}
          onBodyChange={() => {}}
          onTitleChange={() => {}}
          onTabSelect={() => {}}
          onOrderedAssociationViewChange={() => {}}
          onArchiveNode={async () => {}}
          onUnarchiveNode={async () => {}}
          onDeleteNode={async () => {}}
        />
      </UserSettingsProvider>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Page actions" })[0]!);
    expect(screen.getByRole("menuitem", { name: "Relate" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Relate" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Related items", level: 2 })).toBeNull();
  });

  test("renders embedded database table section", () => {
    const api = makeMockEditorApi();
    const node = makeNodePageDetail({
      isTypeTable: true,
      sections: [
        { type: "markdown", body: "# Database page\n" },
        { type: "database", databaseView: makeDatabaseViewDetail() },
      ],
    });

    render(
      <UserSettingsProvider api={api}>
        <NodePageView
          api={api}
          node={node}
          saveState="idle"
          metadataExpanded={false}
          onMetadataExpandedChange={() => {}}
          onBodyChange={() => {}}
          onTitleChange={() => {}}
          onTabSelect={() => {}}
          onOrderedAssociationViewChange={() => {}}
          onArchiveNode={async () => {}}
          onUnarchiveNode={async () => {}}
          onDeleteNode={async () => {}}
        />
      </UserSettingsProvider>,
    );

    expect(screen.getByRole("link", { name: "Linked record" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ New row" })).toBeTruthy();
  });

  test("selectTitleOnMount focuses and selects the page title", async () => {
    const api = makeMockEditorApi();
    const node = makeNodePageDetail({ title: "Untitled", body: "" });

    render(
      <UserSettingsProvider api={api}>
        <NodePageView
          api={api}
          node={node}
          saveState="idle"
          metadataExpanded={false}
          onMetadataExpandedChange={() => {}}
          onBodyChange={() => {}}
          onTitleChange={() => {}}
          onTabSelect={() => {}}
          onOrderedAssociationViewChange={() => {}}
          onArchiveNode={async () => {}}
          onUnarchiveNode={async () => {}}
          onDeleteNode={async () => {}}
          selectTitleOnMount
        />
      </UserSettingsProvider>,
    );

    const title = screen.getByRole("textbox", { name: "Page title" }) as HTMLTextAreaElement;

    await waitFor(() => {
      expect(document.activeElement).toBe(title);
      expect(title.selectionStart).toBe(0);
      expect(title.selectionEnd).toBe("Untitled".length);
    });
  });

  test("renders Properties section when metadata is expanded", () => {
    const api = makeMockEditorApi();
    const node = makeNodePageDetail({
      properties: {
        type: "properties",
        databaseId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        typeTitle: "Features",
        columns: ["priority"],
        columnDefs: [
          {
            key: "priority",
            name: "Priority",
            type: "enum",
            enumId: "priority",
            options: ["Low", "Medium", "High"],
            defaultValue: "Low",
          },
        ],
        cells: { priority: "High" },
      },
    });

    render(
      <UserSettingsProvider api={api}>
        <NodePageView
          api={api}
          node={node}
          saveState="idle"
          metadataExpanded={true}
          onMetadataExpandedChange={() => {}}
          onBodyChange={() => {}}
          onTitleChange={() => {}}
          onTabSelect={() => {}}
          onOrderedAssociationViewChange={() => {}}
          onArchiveNode={async () => {}}
          onUnarchiveNode={async () => {}}
          onDeleteNode={async () => {}}
        />
      </UserSettingsProvider>,
    );

    const metadataPanel = screen.getByRole("region", { name: "Node metadata" });
    const propertiesHeading = within(metadataPanel).getByRole("heading", {
      name: "Properties",
      level: 2,
    });
    const propertiesSection = propertiesHeading.closest("section");
    expect(propertiesSection).toBeTruthy();
    expect(within(propertiesSection!).getByRole("button", { name: "Priority" })).toBeTruthy();
  });

  test("hides Properties section when metadata is collapsed", () => {
    const api = makeMockEditorApi();
    const node = makeNodePageDetail({
      properties: {
        type: "properties",
        databaseId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        typeTitle: "Features",
        columns: ["priority"],
        columnDefs: [
          {
            key: "priority",
            name: "Priority",
            type: "enum",
            enumId: "priority",
            options: ["Low", "Medium", "High"],
            defaultValue: "Low",
          },
        ],
        cells: { priority: "High" },
      },
    });

    render(
      <UserSettingsProvider api={api}>
        <NodePageView
          api={api}
          node={node}
          saveState="idle"
          metadataExpanded={false}
          onMetadataExpandedChange={() => {}}
          onBodyChange={() => {}}
          onTitleChange={() => {}}
          onTabSelect={() => {}}
          onOrderedAssociationViewChange={() => {}}
          onArchiveNode={async () => {}}
          onUnarchiveNode={async () => {}}
          onDeleteNode={async () => {}}
        />
      </UserSettingsProvider>,
    );

    expect(screen.queryByRole("heading", { name: "Properties", level: 2 })).toBeNull();
  });
});

describe("PropertiesSectionView", () => {
  test("renders computed fields as read-only", () => {
    const api = makeMockEditorApi();

    render(
      <PropertiesSectionView
        api={api}
        nodeId="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        section={{
          type: "properties",
          databaseId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          typeTitle: "Characters",
          columns: ["all_scene_count"],
          columnDefs: [
            {
              key: "all_scene_count",
              name: "All Scene count",
              type: "number",
              source: "dynamic",
            },
          ],
          cells: { all_scene_count: "3" },
        }}
      />,
    );

    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(/computed/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Priority" })).toBeNull();
  });
});

describe("NodePageView IS_A relation section", () => {
  test("renders IS_A relation table alongside Properties", () => {
    const api = makeMockEditorApi();
    const typeId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    render(
      <UserSettingsProvider api={api}>
        <NodePageView
          api={api}
          node={makeNodePageDetail({
            properties: {
              type: "properties",
              databaseId: typeId,
              typeTitle: "Features",
              columns: ["priority"],
              columnDefs: [
                {
                  key: "priority",
                  name: "Priority",
                  type: "enum",
                  enumId: "priority",
                  options: ["Low", "Medium", "High"],
                },
              ],
              cells: { priority: "Low" },
            },
            sections: [
              { type: "markdown", body: "# Example\n" },
              makeRelationSection({
                label: "is_a",
                title: "Features",
                typeNodeId: typeId,
                addMode: "link-existing",
                columns: [],
                columnDefs: [],
                rows: [{ targetId: typeId, name: "Features", cells: {} }],
              }),
            ],
          })}
          saveState="idle"
          metadataExpanded={true}
          onMetadataExpandedChange={() => {}}
          onBodyChange={() => {}}
          onTitleChange={() => {}}
          onTabSelect={() => {}}
          onOrderedAssociationViewChange={() => {}}
          onArchiveNode={async () => {}}
          onUnarchiveNode={async () => {}}
          onDeleteNode={async () => {}}
        />
      </UserSettingsProvider>,
    );

    expect(screen.getByRole("heading", { name: "Properties", level: 2 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Features", level: 2 })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Priority" })).toBeTruthy();
  });
});
