import type { DatabaseViewDetail, NodePageDetail, RelationTableSection } from "../../../src/shared/types";

export const FIXTURE_PAGE_ID = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
export const FIXTURE_TYPE_ID = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
export const FIXTURE_TARGET_ID = "CCCCCCCCCCCCCCCCCCCCCCCCCC";

export const FIXTURE_DATABASE_ID = "DDDDDDDDDDDDDDDDDDDDDDDDDD";

export function makeDatabaseViewDetail(
  overrides: Partial<DatabaseViewDetail> = {},
): DatabaseViewDetail {
  const view = overrides.view ?? "All";
  const views = overrides.views ?? [view];
  const tabs = overrides.tabs ?? {
    kind: "custom" as const,
    items: views.map((label) => ({
      id: label.toLowerCase().replace(/\s+/g, "-"),
      label,
      kind: "custom" as const,
    })),
    activeTabId: views[0]!.toLowerCase().replace(/\s+/g, "-"),
    customDefinitions: views.map((label) => ({
      id: label.toLowerCase().replace(/\s+/g, "-"),
      name: label,
      sorts: [{ column: "name", direction: "asc" as const }],
    })),
  };
  return {
    id: FIXTURE_DATABASE_ID,
    title: "Features",
    views,
    view,
    tabs,
    viewAssociation: "members",
    memberSidePerspective: "member_of",
    sectionTitle: "Contents",
    allColumns: ["priority"],
    columns: ["priority"],
    columnDefs: [
      {
        key: "priority",
        name: "Priority",
        type: "enum",
        enumId: "priority",
        options: ["Low", "Medium", "High", "Consideration"],
        defaultValue: "Low",
      },
    ],
    allColumnDefs: [
      {
        key: "priority",
        name: "Priority",
        type: "enum",
        enumId: "priority",
        options: ["Low", "Medium", "High", "Consideration"],
        defaultValue: "Low",
      },
    ],
    rows: [
      {
        rowIndex: 0,
        nodeId: FIXTURE_TARGET_ID,
        name: "Linked record",
        cells: { priority: "High" },
      },
    ],
    rowsWindow: { offset: 0, limit: 50, total: 1, hasMore: false },
    ...overrides,
    rowsWindow:
      overrides.rowsWindow ??
      ({
        offset: 0,
        limit: 50,
        total: (overrides.rows ?? [
          {
            rowIndex: 0,
            nodeId: FIXTURE_TARGET_ID,
            name: "Linked record",
            cells: { priority: "High" },
          },
        ]).length,
        hasMore: false,
      }),
  };
}

export function makeRelationSection(
  overrides: Partial<RelationTableSection> = {},
): RelationTableSection {
  const defaultRows = [
    {
      targetId: FIXTURE_TARGET_ID,
      name: "Linked record",
      cells: { priority: "High" },
    },
  ];
  return {
    type: "relations",
    label: "RELATED",
    title: "Related items",
    typeNodeId: FIXTURE_TYPE_ID,
    addMode: "link-existing",
    columns: ["priority"],
    columnDefs: [
      {
        key: "priority",
        name: "Priority",
        type: "enum",
        enumId: "priority",
        options: ["Low", "Medium", "High", "Consideration"],
        defaultValue: "Low",
      },
    ],
    rows: defaultRows,
    rowsWindow: { offset: 0, limit: 50, total: 1, hasMore: false },
    ...overrides,
    rowsWindow:
      overrides.rowsWindow ??
      ({
        offset: 0,
        limit: 50,
        total: (overrides.rows ?? defaultRows).length,
        hasMore: false,
      }),
  };
}

export function makeNodePageDetail(
  overrides: Partial<NodePageDetail> = {},
): NodePageDetail {
  const sections = overrides.sections ?? [
    { type: "markdown", body: "# Example page\n\nBody text." },
    makeRelationSection(),
  ];

  return {
    id: FIXTURE_PAGE_ID,
    title: "Example page",
    primaryTypeTitle: null,
    body: "# Example page\n\nBody text.",
    isTypeTable: false,
    archived: false,
    properties: null,
    metadata: {
      createdAt: null,
      modifiedAt: null,
      relationshipCount: 1,
      backlinks: [],
    },
    sections,
    ...overrides,
  };
}
