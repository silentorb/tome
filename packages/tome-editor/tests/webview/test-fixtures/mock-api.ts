import type { EditorApi } from "../../../src/webview/api/client";
import { emptySchemaFile } from "tome-flatfile/schema-file";
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
    getHomeId: async () => "AAAAAAAAAAAAAAAAAAAAAAAAAA",
    createNode: async (input) => ({ id: "CCCCCCCCCCCCCCCCCCCCCCCCCC", title: input.title }),
    createRelationRow: async (_sourceId, input) => ({
      id: "DDDDDDDDDDDDDDDDDDDDDDDDDD",
      title: input.title,
    }),
    createDatabaseRow: async (_databaseId, input) => ({
      id: "EEEEEEEEEEEEEEEEEEEEEEEEEE",
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
    createRelationshipView: async (nodeId, association, input) => ({
      id: "new-view",
      nodeId,
      association,
      name: input.name,
      sorts: input.sorts ?? [{ column: "name", direction: "asc" as const }],
    }),
    updateRelationshipView: async (nodeId, association, viewId, input) => ({
      id: viewId,
      nodeId,
      association,
      name: input.name ?? viewId,
      sorts: input.sorts ?? [{ column: "name", direction: "asc" as const }],
      ...(input.properties ? { properties: input.properties } : {}),
    }),
    deleteRelationshipView: async () => {},
    patchRelationshipViews: async (nodeId, association, input) => {
      if (input.viewOrder) {
        return {
          views: input.viewOrder.map((id) => ({
            id,
            nodeId,
            association,
            name: id,
            sorts: [{ column: "name", direction: "asc" as const }],
          })),
        };
      }
      return { properties: input.properties };
    },
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
    addQuickLink: async (id, options) => {
      workspace.quickLinks = [
        ...workspace.quickLinks,
        {
          nodeId: id,
          label: options?.label ?? "Quick link",
          icon: options?.icon ?? "M",
        },
      ];
    },
    removeQuickLink: async (id) => {
      workspace.quickLinks = workspace.quickLinks.filter((link) => link.nodeId !== id);
    },
    reorderQuickLinks: async (nodeIds) => {
      const byId = new Map(workspace.quickLinks.map((link) => [link.nodeId, link]));
      workspace.quickLinks = nodeIds
        .map((id) => byId.get(id))
        .filter((link): link is (typeof workspace.quickLinks)[number] => link !== undefined);
    },
    getGraphFull: async () => ({ nodes: [], relationships: [] }),
    getGraphExplorerLod: async () => makeGraphLodSnapshot(),
    getSchema: async () => emptySchemaFile(),
    listRelationshipTypes: async () => ["features", "inspirations"],
    getRelationshipLinkOptions: async () => ({ allowedTargetTypeIds: null }),
    getUserSettings: async () => emptyUserSettings(),
    patchUserSettings: async () => emptyUserSettings(),
    moveOrderedCollection: async () => {
      throw new Error("not implemented in mock");
    },
    getExtensionsManifest: async () => ({ components: [], editorBundles: [] }),
    prepareEditorBody: async (_nodeId, markdown) => markdown,
    navigate: () => {},
  };
}
