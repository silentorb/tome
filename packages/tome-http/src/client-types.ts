import type {
  GraphSnapshot,
  GraphLodSnapshot,
  NodePageDetail,
  NodeSummary,
  DatabaseViewDetail,
  OrderedCollectionViewDetail,
} from "tome-graph-interfaces";
import type { UserSettings, UserSettingsPatch } from "./user-settings";
import type { PublicExtensionsManifest } from "tome-graph-interfaces";
import type { SchemaFile } from "tome-graph-interfaces";
import type { OrderedCollectionMoveParams, WorkspaceFile } from "tome-graph-interfaces";

export type WorkspacePublic = WorkspaceFile & { archiveNodeTitle?: string };

export type { GraphRelationship, GraphNode, GraphSnapshot, GraphLodSnapshot, DatabaseViewDetail } from "tome-graph-interfaces";
export type { OrderedCollectionViewDetail } from "tome-graph-interfaces";

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

export interface TomeHttpClient {
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
    association: string,
    input: { name: string; sorts?: import("tome-graph-interfaces").ViewSortSpec[]; properties?: string[] },
  ): Promise<import("tome-graph-interfaces").ViewDefinition>;
  updateRelationshipView(
    nodeId: string,
    association: string,
    viewId: string,
    input: {
      name?: string;
      sorts?: import("tome-graph-interfaces").ViewSortSpec[];
      properties?: string[];
    },
  ): Promise<import("tome-graph-interfaces").ViewDefinition>;
  deleteRelationshipView(
    nodeId: string,
    association: string,
    viewId: string,
  ): Promise<void>;
  patchRelationshipViews(
    nodeId: string,
    association: string,
    input: {
      viewOrder?: string[];
      properties?: string[];
    },
  ): Promise<{
    views?: import("tome-graph-interfaces").ViewDefinition[];
    properties?: string[];
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
      association?: string;
      viewId?: string;
    },
  ): Promise<{
    column: import("tome-graph-interfaces").TableColumnDef;
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
      association?: string;
    },
  ): Promise<{
    column: import("tome-graph-interfaces").TableColumnDef;
    rowsMigrated: number;
    relationsUnlinked: number;
    valuesCleared: number;
  }>;
  listTypeTables(): Promise<{ id: string; title: string }[]>;
  moveOrderedCollection(
    configId: string,
    params: OrderedCollectionMoveParams,
  ): Promise<OrderedCollectionViewDetail>;
  search(
    query: string,
    limit?: number,
    allowedTypeIds?: string[],
    options?: { includeBody?: boolean },
  ): Promise<NodeSummary[]>;
  listRecent(limit?: number): Promise<NodeSummary[]>;
  saveNode(
    id: string,
    patch: { body?: string; title?: string },
    options?: { keepalive?: boolean },
  ): Promise<void>;
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
  invokeExtension(componentId: string, input?: unknown, nodeId?: string): Promise<unknown>;
}

/** @deprecated Use TomeHttpClient */
export type EditorApiClient = TomeHttpClient;
