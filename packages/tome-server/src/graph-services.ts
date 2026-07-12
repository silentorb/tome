import {
  applyOrderedCollectionMove,
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
  loadAssociationsFromContent,
  associationRuleContext,
  searchNodes,
  listRecentNodesByModifiedAt,
  updateNodeBody,
  updateNodeTitle,
  deleteDatabaseColumn as deleteDatabaseColumnInDb,
  createDatabaseColumn as createDatabaseColumnInDb,
  updateDatabaseColumn as updateDatabaseColumnInDb,
  updateDatabaseRowProperty,
  updateOutgoingRelationshipProperty,
  linkOutgoingRelationship,
  moveRelationshipConnection,
  unlinkOutgoingRelationship,
  loadTableSchemasFromContent,
  type CreateDatabaseColumnInput,
  type UpdateDatabaseColumnInput,
  type CreateNodeError,
  type LinkOutgoingRelationshipError,
  type MoveRelationshipConnectionError,
  type UnlinkOutgoingRelationshipError,
  type CreateNodeInput,
  type CreateNodeResult,
  type GraphLodSnapshot,
  type GraphSnapshot,
  type OrderedCollectionMoveParams,
  type OrderedCollectionViewDetail,
  type NodeLifecycleError,
  type SchemaFile,
  type ViewSortSpec,
  type ViewProperties,
  type TomeWriteContext,
  type GraphDatabase,
  loadWorkspaceFromContent,
} from "tome-db";
import {
  openContentGraph,
  openTomeWriteContext,
  type ContentStore,
} from "tome-db/content";
import type { TomeDataStore, TomeQueryCache } from "tome-service-interfaces";
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

export type OpenTomeGraphServicesArgs = {
  store: TomeDataStore | ContentStore;
  cache: TomeQueryCache;
};

function buildGraphServices(
  writeCtx: TomeWriteContext,
  contentPath: string,
): TomeGraphServices {
  writeCtx.store.startWatching();
  const cache = writeCtx.cache as GraphDatabase;

  const extensions = new ExtensionServerRuntime(
    contentPath,
    () => createExtensionGraphQueryServices(cache, contentPath),
    () => createExtensionSchemaQueryServices(cache, contentPath),
  );
  const extensionsReady = extensions.ensureLoaded().catch((err: unknown) => {
    console.error("[tome-extensions] failed to load:", err);
  });

  const schema = () => loadSchemaFromContent(contentPath);

  return {
    getWorkspace(): WorkspacePublic {
      const ws = loadWorkspaceFromContent(contentPath);
      const archivePage = getNodePageDetail(cache, ws.archiveNodeId, { contentDir: contentPath });
      return {
        ...ws,
        archiveNodeTitle: archivePage?.title ?? "Archive",
      };
    },
    getHomeId(): string {
      const homeId = loadWorkspaceFromContent(contentPath).homeNodeId;
      const home = getNodePageDetail(cache, homeId, { contentDir: contentPath });
      if (home) return homeId;
      const recent = searchNodes(cache, "", 1);
      return recent[0]?.id ?? homeId;
    },
    getNode(id: string, options?: { tabId?: string; databaseView?: string; scopeId?: string }) {
      const tabId = options?.tabId ?? options?.scopeId ?? options?.databaseView;
      return getNodePageDetail(cache, id, {
        tabId,
        contentDir: contentPath,
        includeSchemaEmptySections: true,
      });
    },
    getDatabaseView(id: string, tabId?: string) {
      return getDatabaseViewDetail(cache, id, tabId, contentPath);
    },
    getNodeViews(nodeId: string) {
      return readNodeViews(writeCtx, nodeId);
    },
    createRelationshipView(
      nodeId: string,
      association: string,
      input: { name: string; sorts?: ViewSortSpec[]; properties?: ViewProperties },
    ) {
      return createRelationshipView(writeCtx, nodeId, association, input);
    },
    updateRelationshipView(
      nodeId: string,
      association: string,
      viewId: string,
      input: { name?: string; sorts?: ViewSortSpec[]; properties?: ViewProperties },
    ) {
      return updateRelationshipView(writeCtx, nodeId, association, viewId, input);
    },
    deleteRelationshipView(nodeId: string, association: string, viewId: string) {
      deleteRelationshipView(writeCtx, nodeId, association, viewId);
    },
    patchRelationshipViews(
      nodeId: string,
      association: string,
      input: { viewOrder?: string[]; properties?: ViewProperties },
    ) {
      return patchRelationshipViews(writeCtx, nodeId, association, input);
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
        const node = writeCtx.cache.getNode(id);
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
      return writeCtx.cache.listDistinctRelationshipTypes();
    },
    getRelationshipLinkOptions(sourceId: string, type: string) {
      const registry = loadAssociationsFromContent(contentPath);
      const rule = associationRuleContext(registry, cache, sourceId, type, contentPath);
      return {
        allowedTargetTypeIds: rule ? [...rule.allowedTargetTypeIds] : null,
      };
    },
    moveOrderedCollection(
      configId: string,
      params: OrderedCollectionMoveParams,
    ): OrderedCollectionViewDetail | null {
      return applyOrderedCollectionMove(writeCtx, configId, params);
    },
    search(
      query: string,
      limit?: number,
      allowedTypeIds?: string[],
      options?: { includeBody?: boolean },
    ): NodeSummary[] {
      return searchNodes(cache, query, limit, allowedTypeIds, options);
    },
    listRecent(limit?: number): NodeSummary[] {
      return listRecentNodesByModifiedAt(cache, limit);
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
      const registry = loadAssociationsFromContent(contentPath);
      const rule = associationRuleContext(
        registry,
        cache,
        sourceId,
        input.type,
        contentPath,
      );
      const typeTableId =
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
          typeTableId,
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
      return exportFullGraph(cache);
    },
    getGraphExplorerLod(options?: { anchorId?: string; layerCount?: number }): GraphLodSnapshot {
      return exportExplorerLodGraph(cache, options);
    },
    async getExtensionsManifest(): Promise<PublicExtensionsManifest> {
      await extensionsReady;
      await extensions.ensureLoaded();
      return extensions.getPublicManifest();
    },
    async prepareEditorBody(nodeId: string, markdown: string): Promise<string | null> {
      if (!writeCtx.cache.getNode(nodeId)) return null;
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
      writeCtx.store.stopWatching();
      writeCtx.store.close();
      writeCtx.cache.close();
    },
  };
}

/**
 * Open graph services from injected store + cache, or from db/content paths (tests).
 *
 * - `openTomeGraphServices({ store, cache })` — host DI path
 * - `openTomeGraphServices(dbPath, contentPath)` — test convenience via `openContentGraph`
 */
export function openTomeGraphServices(
  args: OpenTomeGraphServicesArgs | string = resolveDbPath(),
  contentPath = resolveContentPath(),
): TomeGraphServices {
  if (typeof args === "object" && args !== null && "store" in args && "cache" in args) {
    const writeCtx = openTomeWriteContext(args.store as ContentStore, args.cache);
    return buildGraphServices(writeCtx, args.store.contentDir);
  }
  const writeCtx = openContentGraph(contentPath, args);
  return buildGraphServices(writeCtx, contentPath);
}

/** @deprecated Use openTomeGraphServices */
export const openEditorDatabase = openTomeGraphServices;
