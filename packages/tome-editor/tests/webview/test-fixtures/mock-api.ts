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
    createRelationshipView: async (nodeId, relationshipType, input) => ({
      id: "new-view",
      nodeId,
      relationshipType,
      name: input.name,
      sorts: input.sorts ?? [{ column: "name", direction: "asc" as const }],
    }),
    updateRelationshipView: async (nodeId, relationshipType, viewId, input) => ({
      id: viewId,
      nodeId,
      relationshipType,
      name: input.name ?? viewId,
      sorts: input.sorts ?? [{ column: "name", direction: "asc" as const }],
      ...(input.hiddenColumns ? { hiddenColumns: input.hiddenColumns } : {}),
    }),
    deleteRelationshipView: async () => {},
    patchRelationshipViews: async (nodeId, relationshipType, input) => {
      if (input.viewOrder) {
        return {
          views: input.viewOrder.map((id) => ({
            id,
            nodeId,
            relationshipType,
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
    moveOrderedAssociation: async () => {
      throw new Error("not implemented in mock");
    },
    getExtensionsManifest: async () => ({ components: [], editorBundles: [] }),
    prepareEditorBody: async (_nodeId, markdown) => markdown,
    navigate: () => {},
  };
}
