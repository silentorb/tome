import {
  createHttpEditorClient,
  DEFAULT_API_BASE_URL,
  type EditorApiClient,
} from "../../shared/http-client";
import {
  navigateStandaloneNode,
  openStandaloneNodeInNewTab,
} from "../node-links";

export interface EditorApi extends EditorApiClient {
  navigate(nodeId: string, openInNewTab?: boolean): void;
}

function resolveWebviewApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_TOME_API_URL;
  if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
  if (typeof window !== "undefined") return window.location.origin;
  return DEFAULT_API_BASE_URL;
}

export function createEditorApi(): EditorApi {
  const rest = createHttpEditorClient(resolveWebviewApiBaseUrl());

  return {
    getWorkspace: rest.getWorkspace.bind(rest),
    getHomeId: rest.getHomeId.bind(rest),
    createNode: rest.createNode.bind(rest),
    createRelationRow: rest.createRelationRow.bind(rest),
    createDatabaseRow: rest.createDatabaseRow.bind(rest),
    getNode: rest.getNode.bind(rest),
    getDatabaseView: rest.getDatabaseView.bind(rest),
    createSectionTab: rest.createSectionTab.bind(rest),
    updateSectionTab: rest.updateSectionTab.bind(rest),
    deleteSectionTab: rest.deleteSectionTab.bind(rest),
    updateSectionColumnOrder: rest.updateSectionColumnOrder.bind(rest),
    updateSectionTabOrder: rest.updateSectionTabOrder.bind(rest),
    deleteDatabaseColumn: rest.deleteDatabaseColumn.bind(rest),
    createDatabaseColumn: rest.createDatabaseColumn.bind(rest),
    updateDatabaseColumn: rest.updateDatabaseColumn.bind(rest),
    listTypeTables: rest.listTypeTables.bind(rest),
    search: rest.search.bind(rest),
    listRecent: rest.listRecent.bind(rest),
    saveBody: rest.saveBody.bind(rest),
    saveTitle: rest.saveTitle.bind(rest),
    updateDatabaseRowProperty: rest.updateDatabaseRowProperty.bind(rest),
    updateOutgoingRelationshipProperty: rest.updateOutgoingRelationshipProperty.bind(rest),
    linkOutgoingRelationship: rest.linkOutgoingRelationship.bind(rest),
    unlinkOutgoingRelationship: rest.unlinkOutgoingRelationship.bind(rest),
    moveRelationshipConnection: rest.moveRelationshipConnection.bind(rest),
    deleteNode: rest.deleteNode.bind(rest),
    archiveNode: rest.archiveNode.bind(rest),
    unarchiveNode: rest.unarchiveNode.bind(rest),
    getGraphFull: rest.getGraphFull.bind(rest),
    getGraphExplorerLod: rest.getGraphExplorerLod.bind(rest),
    getSchema: rest.getSchema.bind(rest),
    listRelationshipTypes: rest.listRelationshipTypes.bind(rest),
    getRelationshipLinkOptions: rest.getRelationshipLinkOptions.bind(rest),
    getUserSettings: rest.getUserSettings.bind(rest),
    patchUserSettings: rest.patchUserSettings.bind(rest),
    moveOrderedAssociation: rest.moveOrderedAssociation.bind(rest),
    navigate(nodeId: string, openInNewTab = false): void {
      if (openInNewTab) {
        openStandaloneNodeInNewTab(nodeId);
        return;
      }
      navigateStandaloneNode(nodeId);
    },
  };
}
