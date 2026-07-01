import {
  applyOrderedAssociationMove,
  archiveNode as archiveNodeInDb,
  unarchiveNode as unarchiveNodeInDb,
  addWorkspaceQuickLink,
  removeWorkspaceQuickLink,
  reorderWorkspaceQuickLinks,
  type QuickLinkError,
  createNode as createNodeInDb,
  deleteNode as deleteNodeInDb,
  exportExplorerLodGraph,
  createExtensionGraphQueryServices,
  createExtensionSchemaQueryServices,
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
  type ViewDefinition,
  type ViewProperties,
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
  createRelationshipView,
  deleteRelationshipView,
  patchRelationshipViews,
  readNodeViews,
  updateRelationshipView,
} from "./views";
import {
  ExtensionServerRuntime,
} from "./extensions/runtime";
import type { PublicExtensionsManifest } from "../shared/extensions";

export type { PublicExtensionsManifest };

export type WorkspacePublic = WorkspaceFile & { archiveNodeTitle?: string };

export interface EditorDatabase {
  getWorkspace(): WorkspacePublic;
  getHomeId(): string;
  getNode(id: string, options?: { tabId?: string; databaseView?: string; scopeId?: string }): NodePageDetail | null;
  getDatabaseView(id: string, tabId?: string): DatabaseViewDetail | null;
  getNodeViews(nodeId: string): ViewDefinition[];
  createRelationshipView(
    nodeId: string,
    relationshipType: string,
    input: { name: string; sorts?: ViewSortSpec[]; properties?: ViewProperties },
  ): ReturnType<typeof createRelationshipView>;
  updateRelationshipView(
    nodeId: string,
    relationshipType: string,
    viewId: string,
    input: { name?: string; sorts?: ViewSortSpec[]; properties?: ViewProperties },
  ): ReturnType<typeof updateRelationshipView>;
  deleteRelationshipView(nodeId: string, relationshipType: string, viewId: string): void;
  patchRelationshipViews(
    nodeId: string,
    relationshipType: string,
    input: { viewOrder?: string[]; properties?: ViewProperties },
  ): ReturnType<typeof patchRelationshipViews>;
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
  addQuickLink(
    id: string,
    options?: { label?: string; icon?: string },
  ): QuickLinkError | null;
  removeQuickLink(id: string): QuickLinkError | null;
  reorderQuickLinks(nodeIds: readonly string[]): QuickLinkError | null;
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
  getExtensionsManifest(): Promise<PublicExtensionsManifest>;
  prepareEditorBody(nodeId: string, markdown: string): Promise<string | null>;
  invokeExtension(
    componentId: string,
    input: unknown,
    nodeId?: string,
  ): Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
  bundleEditorExtension(extensionId: string): Promise<string | null>;
  close(): void;
}

export function openEditorDatabase(
  dbPath = resolveDbPath(),
  contentPath = resolveContentPath(),
): EditorDatabase {
  const writeCtx: TomeWriteContext = openTomeWriteContext(contentPath, dbPath);
  const extensions = new ExtensionServerRuntime(
    contentPath,
    () => createExtensionGraphQueryServices(writeCtx.db),
    () => createExtensionSchemaQueryServices(writeCtx.db, contentPath),
  );
  const extensionsReady = extensions.ensureLoaded().catch((err: unknown) => {
    console.error("[tome-extensions] failed to load:", err);
  });
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
    createRelationshipView(
      nodeId: string,
      relationshipType: string,
      input: { name: string; sorts?: ViewSortSpec[]; properties?: ViewProperties },
    ) {
      return createRelationshipView(writeCtx, nodeId, relationshipType, input);
    },
    updateRelationshipView(
      nodeId: string,
      relationshipType: string,
      viewId: string,
      input: { name?: string; sorts?: ViewSortSpec[]; properties?: ViewProperties },
    ) {
      return updateRelationshipView(writeCtx, nodeId, relationshipType, viewId, input);
    },
    deleteRelationshipView(nodeId: string, relationshipType: string, viewId: string) {
      deleteRelationshipView(writeCtx, nodeId, relationshipType, viewId);
    },
    patchRelationshipViews(
      nodeId: string,
      relationshipType: string,
      input: { viewOrder?: string[]; properties?: ViewProperties },
    ) {
      return patchRelationshipViews(writeCtx, nodeId, relationshipType, input);
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
    addQuickLink(
      id: string,
      options?: { label?: string; icon?: string },
    ): QuickLinkError | null {
      return addWorkspaceQuickLink(writeCtx, id, options);
    },
    removeQuickLink(id: string): QuickLinkError | null {
      return removeWorkspaceQuickLink(writeCtx, id);
    },
    reorderQuickLinks(nodeIds: readonly string[]): QuickLinkError | null {
      return reorderWorkspaceQuickLinks(writeCtx, nodeIds);
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
    async getExtensionsManifest(): Promise<PublicExtensionsManifest> {
      await extensionsReady;
      await extensions.ensureLoaded();
      return extensions.getPublicManifest();
    },
    async prepareEditorBody(nodeId: string, markdown: string): Promise<string | null> {
      if (!writeCtx.db.getNode(nodeId)) return null;
      await extensionsReady;
      await extensions.ensureLoaded();
      return extensions.prepareEditorBody(nodeId, markdown);
    },
    invokeExtension(componentId, input, nodeId) {
      return extensionsReady.then(() =>
        extensions.invokeExtension(componentId, input, nodeId),
      );
    },
    bundleEditorExtension(extensionId) {
      return extensionsReady.then(() => extensions.bundleEditorModule(extensionId));
    },
    close(): void {
      watcher.close();
      writeCtx.db.close();
    },
  };
}
