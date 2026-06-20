import type { EditorApi } from "../../../src/webview/api/client";
import { emptySchemaFile } from "tome-db/schema-file";
import { emptyUserSettings } from "../../../src/shared/user-settings";
import { defaultTestWorkspaceFile } from "tome-db/content/test-helpers";
import { makeGraphLodSnapshot } from "./graph-lod";
import { makeDatabaseViewDetail } from "./node-page";

export function makeMockEditorApi(): EditorApi {
  const workspace = {
    ...defaultTestWorkspaceFile(),
    archiveNodeTitle: "Archive",
  };

  return {
    getWorkspace: async () => workspace,
    getHomeId: async () => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    createNode: async (input) => ({ id: "cccccccccccccccccccccccccccccccc", title: input.title }),
    createRelationRow: async (_sourceId, input) => ({
      id: "dddddddddddddddddddddddddddddddd",
      title: input.title,
    }),
    createDatabaseRow: async (_databaseId, input) => ({
      id: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      title: input.title,
    }),
    getNode: async () => {
      throw new Error("not implemented in mock");
    },
    getDatabaseView: async (databaseId, tabId) => {
      void databaseId;
      void tabId;
      return makeDatabaseViewDetail();
    },
    createSectionTab: async (_nodeId, _sectionKey, input) => ({
      id: "new-tab",
      name: input.name,
      sorts: input.sorts ?? [{ column: "name", direction: "asc" as const }],
    }),
    updateSectionTab: async (_nodeId, _sectionKey, tabId, input) => ({
      id: tabId,
      name: input.name ?? tabId,
      sorts: input.sorts ?? [{ column: "name", direction: "asc" as const }],
    }),
    deleteSectionTab: async () => {},
    updateSectionColumnOrder: async (_nodeId, _sectionKey, columnOrder) => columnOrder,
    updateSectionTabOrder: async (_nodeId, _sectionKey, tabOrder) =>
      tabOrder.map((id) => ({
        id,
        name: id,
        sorts: [{ column: "name", direction: "asc" as const }],
      })),
    deleteDatabaseColumn: async () => ({ rowsAffected: 0, relationsUnlinked: 0 }),
    createDatabaseColumn: async (_databaseId, input) => ({
      column: {
        key: input.key ?? "new_column",
        name: input.name,
        type: input.type as "text",
      },
      rowsMigrated: 0,
      relationsUnlinked: 0,
      valuesCleared: 0,
    }),
    updateDatabaseColumn: async (_databaseId, columnKey, input) => ({
      column: {
        key: input.newKey ?? columnKey,
        name: input.name ?? columnKey,
        type: (input.type ?? "text") as "text",
      },
      rowsMigrated: 0,
      relationsUnlinked: 0,
      valuesCleared: 0,
    }),
    listTypeTables: async () => [],
    search: async (_query, _limit, _allowedTypeIds, _options) => [],
    listRecent: async () => [],
    saveBody: async () => {},
    saveTitle: async () => {},
    updateDatabaseRowProperty: async () => {},
    updateOutgoingRelationshipProperty: async () => {},
    linkOutgoingRelationship: async () => {},
    unlinkOutgoingRelationship: async () => {},
    moveRelationshipConnection: async () => {},
    deleteNode: async () => {},
    archiveNode: async () => {},
    unarchiveNode: async () => {},
    getGraphFull: async () => ({ nodes: [], relationships: [] }),
    getGraphExplorerLod: async () => makeGraphLodSnapshot(),
    getSchema: async () => emptySchemaFile(),
    listRelationshipTypes: async () => ["features", "inspirations"],
    getRelationshipLinkOptions: async () => ({ allowedTargetTypeIds: null }),
    getUserSettings: async () => emptyUserSettings(),
    patchUserSettings: async () => emptyUserSettings(),
    moveOrderedAssociation: async () => {
      throw new Error("not implemented in mock");
    },
    navigate: () => {},
  };
}
