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
  exportFullGraph,
  createExtensionGraphQueryServices,
  createExtensionSchemaQueryServices,
  getDatabaseViewDetail,
  getNodePageDetail,
  loadSchemaFromContent,
  loadRelationshipTypesFromContent,
  relationshipTypeRuleContext,
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
import type {
  NodeSummary,
  PublicExtensionsManifest,
  TomeGraphServices,
  WorkspacePublic,
} from "tome-graph-interfaces";

export type { PublicExtensionsManifest, WorkspacePublic, TomeGraphServices };

/** @deprecated Use TomeGraphServices */
export type EditorDatabase = TomeGraphServices;

export function openTomeGraphServices(
  dbPath = resolveDbPath(),
  contentPath = resolveContentPath(),
): TomeGraphServices {
  const writeCtx: TomeWriteContext = openTomeWriteContext(contentPath, dbPath);
  const extensions = new ExtensionServerRuntime(
    contentPath,
    () => createExtensionGraphQueryServices(writeCtx.db, contentPath),
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
      const archivePage = getNodePageDetail(writeCtx.db, ws.archiveNodeId, { contentDir: contentPath });
      return {
        ...ws,
        archiveNodeTitle: archivePage?.title ?? "Archive",
      };
    },
    getHomeId(): string {
      const homeId = loadWorkspaceFromContent(contentPath).homeNodeId;
      const home = getNodePageDetail(writeCtx.db, homeId, { contentDir: contentPath });
      if (home) return homeId;
      const recent = searchNodes(writeCtx.db, "", 1);
      return recent[0]?.id ?? homeId;
    },
    getNode(id: string, options?: { tabId?: string; databaseView?: string; scopeId?: string }): NodePageDetail | null {
      const tabId = options?.tabId ?? options?.scopeId ?? options?.databaseView;
      return getNodePageDetail(writeCtx.db, id, {
        tabId,
        contentDir: contentPath,
        includeSchemaEmptySections: true,
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
      const registry = loadRelationshipTypesFromContent(contentPath);
      const rule = relationshipTypeRuleContext(registry, writeCtx.db, sourceId, type, contentPath);
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
      const registry = loadRelationshipTypesFromContent(contentPath);
      const rule = relationshipTypeRuleContext(
        registry,
        writeCtx.db,
        sourceId,
        input.type,
        contentPath,
      );
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


/** @deprecated Use openTomeGraphServices */
export const openEditorDatabase = openTomeGraphServices;
