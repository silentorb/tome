import type {
  GraphSnapshot,
  GraphLodSnapshot,
  NodePageDetail,
  NodeSummary,
  DatabaseViewDetail,
  OrderedAssociationViewDetail,
} from "./types";
import type { UserSettings, UserSettingsPatch } from "./user-settings";
import type { PublicExtensionsManifest } from "./extensions";
import type { SchemaFile } from "tome-db/schema-file";
import type { OrderedAssociationMoveParams, WorkspaceFile } from "tome-db";

export type WorkspacePublic = WorkspaceFile & { archiveNodeTitle?: string };

export type { GraphRelationship, GraphNode, GraphSnapshot, GraphLodSnapshot, DatabaseViewDetail } from "tome-db";
export type { OrderedAssociationViewDetail } from "tome-db";

export interface GetNodeOptions {
  tab?: string;
  /** @deprecated Use tab */
  view?: string;
  /** @deprecated Use tab */
  scope?: string;
}

export interface GraphExplorerLodOptions {
  anchorId?: string;
  layerCount?: number;
}

export interface CreateNodeResponse {
  id: string;
  title: string;
}

export interface EditorApiClient {
  getWorkspace(): Promise<WorkspacePublic>;
  getHomeId(): Promise<string>;
  createNode(input: { title: string; body?: string }): Promise<CreateNodeResponse>;
  createRelationRow(
    sourceId: string,
    input: { type: string; title: string; properties?: Record<string, string> },
  ): Promise<CreateNodeResponse>;
  createDatabaseRow(
    databaseId: string,
    input: { title: string; view?: string; properties?: Record<string, string> },
  ): Promise<CreateNodeResponse>;
  getNode(id: string, options?: GetNodeOptions | string): Promise<NodePageDetail>;
  getDatabaseView(id: string, tabId?: string): Promise<DatabaseViewDetail>;
  createRelationshipView(
    nodeId: string,
    relationshipType: string,
    input: { name: string; sorts?: import("tome-db").ViewSortSpec[]; properties?: import("tome-db").ViewProperties },
  ): Promise<import("tome-db").ViewDefinition>;
  updateRelationshipView(
    nodeId: string,
    relationshipType: string,
    viewId: string,
    input: {
      name?: string;
      sorts?: import("tome-db").ViewSortSpec[];
      properties?: import("tome-db").ViewProperties;
      hiddenColumns?: string[];
    },
  ): Promise<import("tome-db").ViewDefinition>;
  deleteRelationshipView(
    nodeId: string,
    relationshipType: string,
    viewId: string,
  ): Promise<void>;
  patchRelationshipViews(
    nodeId: string,
    relationshipType: string,
    input: {
      viewOrder?: string[];
      properties?: import("tome-db").ViewProperties;
    },
  ): Promise<{
    views?: import("tome-db").ViewDefinition[];
    properties?: import("tome-db").ViewProperties;
  }>;
  deleteDatabaseColumn(
    databaseId: string,
    columnKey: string,
  ): Promise<{ rowsAffected: number; relationsUnlinked: number }>;
  createDatabaseColumn(
    databaseId: string,
    input: {
      key?: string;
      name: string;
      type: string;
      enumId?: string;
      targetTypeId?: string;
      perspective?: string;
    },
  ): Promise<{
    column: import("tome-db").TableColumnDef;
    rowsMigrated: number;
    relationsUnlinked: number;
    valuesCleared: number;
  }>;
  updateDatabaseColumn(
    databaseId: string,
    columnKey: string,
    input: {
      name?: string;
      newKey?: string;
      type?: string;
      enumId?: string | null;
      targetTypeId?: string;
      perspective?: string;
    },
  ): Promise<{
    column: import("tome-db").TableColumnDef;
    rowsMigrated: number;
    relationsUnlinked: number;
    valuesCleared: number;
  }>;
  listTypeTables(): Promise<{ id: string; title: string }[]>;
  moveOrderedAssociation(
    configId: string,
    params: OrderedAssociationMoveParams,
  ): Promise<OrderedAssociationViewDetail>;
  search(
    query: string,
    limit?: number,
    allowedTypeIds?: string[],
    options?: { includeBody?: boolean },
  ): Promise<NodeSummary[]>;
  listRecent(limit?: number): Promise<NodeSummary[]>;
  saveBody(id: string, body: string): Promise<void>;
  saveTitle(id: string, title: string): Promise<void>;
  updateDatabaseRowProperty(
    databaseId: string,
    nodeId: string,
    propertyKey: string,
    value: string | null,
  ): Promise<void>;
  updateOutgoingRelationshipProperty(
    nodeId: string,
    type: string,
    targetId: string,
    propertyKey: string,
    value: string | null,
  ): Promise<void>;
  linkOutgoingRelationship(
    sourceId: string,
    input: { type: string; targetId: string },
  ): Promise<void>;
  unlinkOutgoingRelationship(
    sourceId: string,
    type: string,
    targetId: string,
  ): Promise<void>;
  moveRelationshipConnection(input: {
    type: string;
    oldSourceId: string;
    oldTargetId: string;
    newSourceId: string;
    newTargetId: string;
  }): Promise<void>;
  deleteNode(id: string): Promise<void>;
  archiveNode(id: string): Promise<void>;
  unarchiveNode(id: string): Promise<void>;
  addQuickLink(id: string, options?: { label?: string; icon?: string }): Promise<void>;
  removeQuickLink(id: string): Promise<void>;
  reorderQuickLinks(nodeIds: readonly string[]): Promise<void>;
  getGraphFull(): Promise<GraphSnapshot>;
  getGraphExplorerLod(options?: GraphExplorerLodOptions): Promise<GraphLodSnapshot>;
  getSchema(): Promise<SchemaFile>;
  listRelationshipTypes(): Promise<string[]>;
  getRelationshipLinkOptions(
    sourceId: string,
    type: string,
  ): Promise<{ allowedTargetTypeIds: string[] | null }>;
  getUserSettings(): Promise<UserSettings>;
  patchUserSettings(patch: UserSettingsPatch): Promise<UserSettings>;
  getExtensionsManifest(): Promise<PublicExtensionsManifest>;
  prepareEditorBody(nodeId: string, markdown: string): Promise<string>;
}
