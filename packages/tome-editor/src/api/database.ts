import {
  applyOrderedAssociationMove,
  archiveNode as archiveNodeInDb,
  unarchiveNode as unarchiveNodeInDb,
  createNode as createNodeInDb,
  deleteNode as deleteNodeInDb,
  exportExplorerLodGraph,
  exportFullGraph,
  getDatabaseViewDetail,
  getNodePageDetail,
  loadSchemaFromContent,
  relationshipRuleContextForType,
  searchNodes,
  listRecentNodesByModifiedAt,
  updateNodeBody,
  updateNodeTitle,
  deleteDatabaseColumn as deleteDatabaseColumnInDb,
  createDatabaseColumn as createDatabaseColumnInDb,
  updateDatabaseColumn as updateDatabaseColumnInDb,
  loadTableSchemasFromContent,
  type CreateDatabaseColumnInput,
  type UpdateDatabaseColumnInput,
  type DatabaseColumnMutationError,
  type DatabaseColumnMutationResult,
  updateDatabaseRowProperty,
  updateOutgoingRelationshipProperty,
  linkOutgoingRelationship,
  moveRelationshipConnection,
  unlinkOutgoingRelationship,
  type CreateNodeError,
  type LinkOutgoingRelationshipError,
  type MoveRelationshipConnectionError,
  type UnlinkOutgoingRelationshipError,
  type CreateNodeInput,
  type CreateNodeResult,
  type GraphLodSnapshot,
  type GraphSnapshot,
  type OrderedAssociationMoveParams,
  type OrderedAssociationViewDetail,
  type NodeLifecycleError,
  type NodePageDetail,
  type DatabaseViewDetail,
  type TomeWriteContext,
  type SchemaFile,
  type ViewSortSpec,
  type NodeViewConfig,
  type WorkspaceFile,
  loadWorkspaceFromContent,
} from "tome-db";
import {
  ContentWatcher,
  openTomeWriteContext,
} from "tome-db/content";
import type { NodeSummary } from "../shared/types";
import { resolveContentPath, resolveDbPath } from "./paths";
import {
  createSectionTab,
  deleteSectionTab,
  ITEMS_SECTION_KEY,
  patchSectionColumnOrder,
  patchSectionTabOrder,
  readNodeViews,
  updateSectionTab,
} from "./views";

export type WorkspacePublic = WorkspaceFile & { archiveNodeTitle?: string };

export interface EditorDatabase {
  getWorkspace(): WorkspacePublic;
  getHomeId(): string;
  getNode(id: string, options?: { tabId?: string; databaseView?: string; scopeId?: string }): NodePageDetail | null;
  getDatabaseView(id: string, tabId?: string): DatabaseViewDetail | null;
  getNodeViews(nodeId: string): NodeViewConfig | null;
  createSectionTab(
    nodeId: string,
    sectionKey: string,
    input: { name: string; sorts?: ViewSortSpec[] },
  ): ReturnType<typeof createSectionTab>;
  updateSectionTab(
    nodeId: string,
    sectionKey: string,
    tabId: string,
    input: { name?: string; sorts?: ViewSortSpec[] },
  ): ReturnType<typeof updateSectionTab>;
  deleteSectionTab(nodeId: string, sectionKey: string, tabId: string): void;
  updateSectionColumnOrder(
    nodeId: string,
    sectionKey: string,
    columnOrder: string[],
  ): string[];
  updateSectionTabOrder(
    nodeId: string,
    sectionKey: string,
    tabOrder: string[],
  ): import("tome-db").CustomTabDefinition[];
  deleteDatabaseColumn(
    databaseId: string,
    columnKey: string,
  ): import("tome-db").DeleteDatabaseColumnResult | import("tome-db").DeleteDatabaseColumnError;
  createDatabaseColumn(
    databaseId: string,
    input: CreateDatabaseColumnInput,
  ): DatabaseColumnMutationResult | DatabaseColumnMutationError;
  updateDatabaseColumn(
    databaseId: string,
    columnKey: string,
    input: UpdateDatabaseColumnInput,
  ): DatabaseColumnMutationResult | DatabaseColumnMutationError;
  listTypeTables(): { id: string; title: string }[];
  getSchema(): SchemaFile;
  listRelationshipTypes(): string[];
  getRelationshipLinkOptions(
    sourceId: string,
    type: string,
  ): { allowedTargetTypeIds: string[] | null };
  moveOrderedAssociation(
    configId: string,
    params: OrderedAssociationMoveParams,
  ): OrderedAssociationViewDetail | null;
  search(
    query: string,
    limit?: number,
    allowedTypeIds?: string[],
    options?: { includeBody?: boolean },
  ): NodeSummary[];
  listRecent(limit?: number): NodeSummary[];
  saveBody(id: string, body: string): boolean;
  saveTitle(id: string, title: string): boolean;
  updateDatabaseRowProperty(
    databaseId: string,
    nodeId: string,
    propertyKey: string,
    value: string | null,
  ): import("tome-db").RelationshipPropertyUpdateError | null;
  updateOutgoingRelationshipProperty(
    nodeId: string,
    type: string,
    targetId: string,
    propertyKey: string,
    value: string | null,
  ): import("tome-db").RelationshipPropertyUpdateError | null;
  deleteNode(id: string): NodeLifecycleError | null;
  archiveNode(id: string): NodeLifecycleError | null;
  unarchiveNode(id: string): NodeLifecycleError | null;
  createNode(input: CreateNodeInput): CreateNodeResult | CreateNodeError;
  createRelationRow(
    sourceId: string,
    input: { type: string; title: string; properties?: Record<string, string> },
  ): CreateNodeResult | CreateNodeError;
  linkOutgoingRelationship(
    sourceId: string,
    input: { type: string; targetId: string },
  ): LinkOutgoingRelationshipError | null;
  unlinkOutgoingRelationship(
    sourceId: string,
    type: string,
    targetId: string,
  ): UnlinkOutgoingRelationshipError | null;
  moveRelationshipConnection(input: {
    type: string;
    oldSourceId: string;
    oldTargetId: string;
    newSourceId: string;
    newTargetId: string;
  }): MoveRelationshipConnectionError | null;
  getGraphFull(): GraphSnapshot;
  getGraphExplorerLod(options?: { anchorId?: string; layerCount?: number }): GraphLodSnapshot;
  close(): void;
}

export function openEditorDatabase(
  dbPath = resolveDbPath(),
  contentPath = resolveContentPath(),
): EditorDatabase {
  const writeCtx: TomeWriteContext = openTomeWriteContext(contentPath, dbPath);
  const watcher = new ContentWatcher(writeCtx.sync, (err) => {
    console.error("[tome-content] sync error:", err.message);
  });
  watcher.start();

  const schema = () => loadSchemaFromContent(contentPath);

  return {
    getWorkspace(): WorkspacePublic {
      const ws = loadWorkspaceFromContent(contentPath);
      const archivePage = getNodePageDetail(writeCtx.db, ws.archiveNodeId, { schema: schema() });
      return {
        ...ws,
        archiveNodeTitle: archivePage?.title ?? "Archive",
      };
    },
    getHomeId(): string {
      const homeId = loadWorkspaceFromContent(contentPath).homeNodeId;
      const home = getNodePageDetail(writeCtx.db, homeId, { schema: schema() });
      if (home) return homeId;
      const recent = searchNodes(writeCtx.db, "", 1);
      return recent[0]?.id ?? homeId;
    },
    getNode(id: string, options?: { tabId?: string; databaseView?: string; scopeId?: string }): NodePageDetail | null {
      const tabId = options?.tabId ?? options?.scopeId ?? options?.databaseView;
      return getNodePageDetail(writeCtx.db, id, {
        tabId,
        schema: schema(),
        contentDir: contentPath,
      });
    },
    getDatabaseView(id: string, tabId?: string) {
      return getDatabaseViewDetail(writeCtx.db, id, tabId, contentPath);
    },
    getNodeViews(nodeId: string) {
      return readNodeViews(writeCtx, nodeId);
    },
    createSectionTab(nodeId: string, sectionKey: string, input: { name: string; sorts?: ViewSortSpec[] }) {
      return createSectionTab(writeCtx, nodeId, sectionKey, input);
    },
    updateSectionTab(
      nodeId: string,
      sectionKey: string,
      tabId: string,
      input: { name?: string; sorts?: ViewSortSpec[] },
    ) {
      return updateSectionTab(writeCtx, nodeId, sectionKey, tabId, input);
    },
    deleteSectionTab(nodeId: string, sectionKey: string, tabId: string) {
      deleteSectionTab(writeCtx, nodeId, sectionKey, tabId);
    },
    updateSectionColumnOrder(nodeId: string, sectionKey: string, columnOrder: string[]) {
      return patchSectionColumnOrder(writeCtx, nodeId, sectionKey, columnOrder);
    },
    updateSectionTabOrder(nodeId: string, sectionKey: string, tabOrder: string[]) {
      return patchSectionTabOrder(writeCtx, nodeId, sectionKey, tabOrder);
    },
    deleteDatabaseColumn(databaseId: string, columnKey: string) {
      return deleteDatabaseColumnInDb(writeCtx, databaseId, columnKey);
    },
    createDatabaseColumn(databaseId: string, input: CreateDatabaseColumnInput) {
      return createDatabaseColumnInDb(writeCtx, databaseId, input);
    },
    updateDatabaseColumn(
      databaseId: string,
      columnKey: string,
      input: UpdateDatabaseColumnInput,
    ) {
      return updateDatabaseColumnInDb(writeCtx, databaseId, columnKey, input);
    },
    listTypeTables() {
      const schemas = loadTableSchemasFromContent(writeCtx.store.contentDir);
      const entries: { id: string; title: string }[] = [];
      for (const id of Object.keys(schemas.tables)) {
        const node = writeCtx.db.getNode(id);
        const title =
          typeof node?.properties.title === "string" && node.properties.title.trim()
            ? node.properties.title.trim()
            : "Untitled";
        entries.push({ id, title });
      }
      entries.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
      return entries;
    },
    getSchema(): SchemaFile {
      return schema();
    },
    listRelationshipTypes(): string[] {
      return writeCtx.db.listDistinctRelationshipTypes();
    },
    getRelationshipLinkOptions(sourceId: string, type: string) {
      const rule = relationshipRuleContextForType(schema(), writeCtx.db, sourceId, type);
      return {
        allowedTargetTypeIds: rule ? [...rule.allowedTargetTypeIds] : null,
      };
    },
    moveOrderedAssociation(
      configId: string,
      params: OrderedAssociationMoveParams,
    ): OrderedAssociationViewDetail | null {
      return applyOrderedAssociationMove(writeCtx, configId, params);
    },
    search(
      query: string,
      limit?: number,
      allowedTypeIds?: string[],
      options?: { includeBody?: boolean },
    ): NodeSummary[] {
      return searchNodes(writeCtx.db, query, limit, allowedTypeIds, options);
    },
    listRecent(limit?: number): NodeSummary[] {
      return listRecentNodesByModifiedAt(writeCtx.db, limit);
    },
    saveBody(id: string, body: string): boolean {
      return updateNodeBody(writeCtx, id, body);
    },
    saveTitle(id: string, title: string): boolean {
      return updateNodeTitle(writeCtx, id, title);
    },
    updateDatabaseRowProperty(
      databaseId: string,
      nodeId: string,
      propertyKey: string,
      value: string | null,
    ) {
      return updateDatabaseRowProperty(writeCtx, databaseId, nodeId, propertyKey, value);
    },
    updateOutgoingRelationshipProperty(
      nodeId: string,
      type: string,
      targetId: string,
      propertyKey: string,
      value: string | null,
    ) {
      return updateOutgoingRelationshipProperty(
        writeCtx,
        nodeId,
        targetId,
        type,
        propertyKey,
        value,
      );
    },
    deleteNode(id: string): NodeLifecycleError | null {
      return deleteNodeInDb(writeCtx, id);
    },
    archiveNode(id: string): NodeLifecycleError | null {
      return archiveNodeInDb(writeCtx, id);
    },
    unarchiveNode(id: string): NodeLifecycleError | null {
      return unarchiveNodeInDb(writeCtx, id);
    },
    createNode(input: CreateNodeInput): CreateNodeResult | CreateNodeError {
      return createNodeInDb(writeCtx, input);
    },
    createRelationRow(
      sourceId: string,
      input: { type: string; title: string; properties?: Record<string, string> },
    ): CreateNodeResult | CreateNodeError {
      const rule = relationshipRuleContextForType(schema(), writeCtx.db, sourceId, input.type);
      const membershipTypeId =
        rule && rule.allowedTargetTypeIds.length === 1
          ? rule.allowedTargetTypeIds[0]
          : undefined;
      return createNodeInDb(writeCtx, {
        title: input.title,
        link: {
          kind: "outgoing",
          sourceId,
          type: input.type,
          properties: input.properties,
          membershipTypeId,
        },
      });
    },
    linkOutgoingRelationship(
      sourceId: string,
      input: { type: string; targetId: string },
    ): LinkOutgoingRelationshipError | null {
      return linkOutgoingRelationship(writeCtx, {
        sourceId,
        targetId: input.targetId,
        type: input.type,
        schema: schema(),
      });
    },
    unlinkOutgoingRelationship(
      sourceId: string,
      type: string,
      targetId: string,
    ): UnlinkOutgoingRelationshipError | null {
      return unlinkOutgoingRelationship(writeCtx, sourceId, targetId, type);
    },
    moveRelationshipConnection(input: {
      type: string;
      oldSourceId: string;
      oldTargetId: string;
      newSourceId: string;
      newTargetId: string;
    }): MoveRelationshipConnectionError | null {
      return moveRelationshipConnection(writeCtx, {
        ...input,
        schema: schema(),
      });
    },
    getGraphFull(): GraphSnapshot {
      return exportFullGraph(writeCtx.db);
    },
    getGraphExplorerLod(options?: { anchorId?: string; layerCount?: number }): GraphLodSnapshot {
      return exportExplorerLodGraph(writeCtx.db, options);
    },
    close(): void {
      watcher.close();
      writeCtx.db.close();
    },
  };
}
