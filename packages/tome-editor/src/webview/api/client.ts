import { createHttpEditorClient } from "../../shared/create-http-editor-client";
import type { EditorApiClient } from "../../shared/http-client-types";
import {
  navigateStandaloneNode,
  openStandaloneNodeInNewTab,
} from "../node-links";

/** Bun API origin when the webview is not served by Vite (tests, SSR). */
const FALLBACK_API_BASE_URL = "http://127.0.0.1:3847";

export interface EditorApi extends EditorApiClient {
  navigate(nodeId: string, openInNewTab?: boolean): void;
}

function resolveWebviewApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_TOME_API_URL;
  if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
  if (typeof window !== "undefined") return window.location.origin;
  return FALLBACK_API_BASE_URL;
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
    createRelationshipView: rest.createRelationshipView.bind(rest),
    updateRelationshipView: rest.updateRelationshipView.bind(rest),
    deleteRelationshipView: rest.deleteRelationshipView.bind(rest),
    patchRelationshipViews: rest.patchRelationshipViews.bind(rest),
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
    addQuickLink: rest.addQuickLink.bind(rest),
    removeQuickLink: rest.removeQuickLink.bind(rest),
    reorderQuickLinks: rest.reorderQuickLinks.bind(rest),
    getGraphFull: rest.getGraphFull.bind(rest),
    getGraphExplorerLod: rest.getGraphExplorerLod.bind(rest),
    getSchema: rest.getSchema.bind(rest),
    listRelationshipTypes: rest.listRelationshipTypes.bind(rest),
    getRelationshipLinkOptions: rest.getRelationshipLinkOptions.bind(rest),
    getUserSettings: rest.getUserSettings.bind(rest),
    patchUserSettings: rest.patchUserSettings.bind(rest),
    moveOrderedAssociation: rest.moveOrderedAssociation.bind(rest),
    getExtensionsManifest: rest.getExtensionsManifest.bind(rest),
    prepareEditorBody: rest.prepareEditorBody.bind(rest),
    navigate(nodeId: string, openInNewTab = false): void {
      if (openInNewTab) {
        openStandaloneNodeInNewTab(nodeId);
        return;
      }
      navigateStandaloneNode(nodeId);
    },
  };
}
