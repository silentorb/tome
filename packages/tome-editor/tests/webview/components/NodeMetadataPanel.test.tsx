import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { NodeMetadataPanel } from "../../../src/webview/components/NodeMetadataPanel";
import { makeMockEditorApi } from "../test-fixtures/mock-api";
import type { NodePageMetadata } from "../../../src/shared/types";

const metadata: NodePageMetadata = {
  createdAt: "2024-01-15T10:00:00.000Z",
  modifiedAt: "2024-06-01T12:30:00.000Z",
  relationshipCount: 3,
  backlinks: [
    {
      sourceId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      title: "Source page",
      linkText: "Target page",
    },
  ],
};

describe("NodeMetadataPanel", () => {
  test("shows summary when collapsed", () => {
    const api = makeMockEditorApi();
    render(
      <NodeMetadataPanel
        api={api}
        metadata={metadata}
        nodeId="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        properties={null}
        expanded={false}
        onExpandedChange={() => {}}
      />,
    );
    expect(screen.getByText(/3 relationships · 1 backlink/)).toBeTruthy();
  });

  test("shows metadata rows when expanded", () => {
    const api = makeMockEditorApi();
    render(
      <NodeMetadataPanel
        api={api}
        metadata={metadata}
        nodeId="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        properties={null}
        expanded={true}
        onExpandedChange={() => {}}
      />,
    );
    expect(screen.getByText("Created")).toBeTruthy();
    expect(screen.getByText("Modified")).toBeTruthy();
    expect(screen.getByText("Relationships")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  test("shows properties inside expanded panel", () => {
    const api = makeMockEditorApi();
    render(
      <NodeMetadataPanel
        api={api}
        metadata={metadata}
        nodeId="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        properties={{
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
            },
          ],
          cells: { priority: "High" },
        }}
        expanded={true}
        onExpandedChange={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: "Properties", level: 2 })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Priority" })).toBeTruthy();
  });

  test("hides properties when collapsed", () => {
    const api = makeMockEditorApi();
    render(
      <NodeMetadataPanel
        api={api}
        metadata={metadata}
        nodeId="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        properties={{
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
            },
          ],
          cells: { priority: "High" },
        }}
        expanded={false}
        onExpandedChange={() => {}}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Properties", level: 2 })).toBeNull();
  });
});
