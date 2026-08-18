import {
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
  createExtensionGraphMutateServices,
  createExtensionSchemaQueryServices,
  createExtensionSqlQueryServices,
  getDatabaseViewDetail,
  getNodePageDetail,
  getRelationTableSection,
  storageBodyToDocument,
  documentToStorageBody,
  attachPageBlockEditorHtml,
  reorderDatabaseMembers as reorderDatabaseMembersInDb,
  DEFAULT_TABLE_ROW_LIMIT,
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
  type ReorderDatabaseMembersParams,
  type NodeLifecycleError,
  type SchemaFile,
  type ViewSortSpec,
  type TomeWriteContext,
  type GraphDatabase,
  loadWorkspaceFromContent,
} from "tome-db";
import {
  openContentGraph,
  openTomeWriteContext,
  type FlatfileStore,
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
  NodeBodyDocument,
  NodeSummary,
  PublicExtensionsManifest,
  SearchNodesOptions,
  TableRowsQuery,
  TomeGraphServices,
  WorkspacePublic,
} from "tome-graph-interfaces";
import { formatPageBlockEmbedComment } from "tome-interfaces/page-block";

const EDITOR_TABLE_ROWS: TableRowsQuery = {
  limit: DEFAULT_TABLE_ROW_LIMIT,
  offset: 0,
};

export type { PublicExtensionsManifest, WorkspacePublic, TomeGraphServices };

/** @deprecated Use TomeGraphServices */
export type EditorDatabase = TomeGraphServices;

export type OpenTomeGraphServicesArgs = {
  store: TomeDataStore | FlatfileStore;
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
    () => createExtensionSqlQueryServices(cache),
    () => createExtensionGraphMutateServices(writeCtx),
  );
  const extensionsReady = extensions.ensureLoaded().catch((err: unknown) => {
    console.error("[tome-extensions] failed to load:", err);
  });

  const schema = () => loadSchemaFromContent(contentPath);

  const corpusMeta = (nodeId: string, activeCorpusId?: string) => {
    const corpora = writeCtx.store.listCorpora();
    const corpusId = writeCtx.store.locateNode(nodeId) ?? undefined;
    const info = corpusId
      ? corpora.find((c) => c.id === corpusId)
      : undefined;
    const corpusLabel =
      corpora.length > 1 &&
      activeCorpusId &&
      corpusId &&
      corpusId !== activeCorpusId
        ? info?.workspace.branding?.appTitle?.trim() || corpusId
        : undefined;
    return {
      corpusId,
      corpusReadonly: info ? info.access === "readonly" : undefined,
      ...(corpusLabel ? { corpusLabel } : {}),
    };
  };

  const workspaceForCorpus = (corpusId?: string): WorkspacePublic => {
    const corpora = writeCtx.store.listCorpora();
    const match = corpusId
      ? corpora.find((c) => c.id === corpusId)
      : corpora[0];
    const contentDir = match?.contentDir ?? contentPath;
    const ws = match?.workspace ?? loadWorkspaceFromContent(contentDir);
    const archivePage = getNodePageDetail(cache, ws.archiveNodeId, { contentDir });
    return {
      ...ws,
      archiveNodeTitle: archivePage?.title ?? "Archive",
    };
  };

  return {
    getWorkspace(corpusId?: string): WorkspacePublic {
      return workspaceForCorpus(corpusId);
    },
    listCorpora() {
      return writeCtx.store.listCorpora().map((c) => {
        const workspace = workspaceForCorpus(c.id);
        return {
          id: c.id,
          access: c.access,
          label: c.workspace.branding?.appTitle?.trim() || c.id,
          homeNodeId: c.workspace.homeNodeId,
          archiveNodeId: c.workspace.archiveNodeId,
          workspace,
        };
      });
    },
    getHomeId(corpusId?: string): string {
      const ws = workspaceForCorpus(corpusId);
      const contentDir =
        writeCtx.store.listCorpora().find((c) => c.workspace.homeNodeId === ws.homeNodeId)
          ?.contentDir ?? contentPath;
      const home = getNodePageDetail(cache, ws.homeNodeId, { contentDir });
      if (home) return ws.homeNodeId;
      const recent = searchNodes(cache, "", 1);
      return recent[0]?.id ?? ws.homeNodeId;
    },
    async getNode(
      id: string,
      options?: {
        tabId?: string;
        databaseView?: string;
        scopeId?: string;
        rows?: TableRowsQuery;
      },
    ) {
      const tabId = options?.tabId ?? options?.scopeId ?? options?.databaseView;
      const nodeContentDir =
        writeCtx.store.listCorpora().find((c) => c.id === writeCtx.store.locateNode(id))
          ?.contentDir ?? contentPath;
      const detail = getNodePageDetail(cache, id, {
        tabId,
        contentDir: nodeContentDir,
        includeSchemaEmptySections: true,
        rows: options?.rows ?? EDITOR_TABLE_ROWS,
      });
      if (!detail) return null;

      let document = storageBodyToDocument(cache, detail.body);
      const needsPageBlockExtensions = document.segments.some(
        (segment) => segment.type === "page_block",
      );
      if (needsPageBlockExtensions) {
        await extensionsReady;
        try {
          await extensions.ensureLoaded();
          document = await attachPageBlockEditorHtml(document, async (componentId, data) => {
            const html = await extensions.renderPageBlockHtml(id, componentId, data);
            return `${formatPageBlockEmbedComment({ componentId, data })}\n${html}`;
          });
        } catch (err: unknown) {
          console.error(
            `[tome-server] getNode page-block extensions unavailable for ${id}:`,
            err,
          );
        }
      }

      const meta = corpusMeta(id);
      return {
        id: detail.id,
        title: detail.title,
        primaryTypeTitle: detail.primaryTypeTitle,
        isTypeTable: detail.isTypeTable,
        archived: detail.archived,
        corpusId: meta.corpusId,
        corpusReadonly: meta.corpusReadonly,
        document,
        metadata: detail.metadata,
        properties: detail.properties,
        sections: detail.sections.map((section) =>
          section.type === "markdown" ? { type: "markdown" as const } : section,
        ),
      };
    },
    getDatabaseView(id: string, tabId?: string, rows?: TableRowsQuery) {
      return getDatabaseViewDetail(
        cache,
        id,
        tabId,
        contentPath,
        rows ?? EDITOR_TABLE_ROWS,
      );
    },
    getRelationTable(nodeId: string, perspective: string, rows?: TableRowsQuery) {
      return getRelationTableSection(cache, nodeId, perspective, {
        contentDir: contentPath,
        includeSchemaEmptySections: true,
        rowsQuery: rows ?? EDITOR_TABLE_ROWS,
      });
    },
    getNodeViews(nodeId: string) {
      return readNodeViews(writeCtx, nodeId);
    },
    createRelationshipView(
      nodeId: string,
      association: string,
      input: { name: string; sorts?: ViewSortSpec[]; properties?: string[] },
    ) {
      return createRelationshipView(writeCtx, nodeId, association, input);
    },
    updateRelationshipView(
      nodeId: string,
      association: string,
      viewId: string,
      input: { name?: string; sorts?: ViewSortSpec[]; properties?: string[] },
    ) {
      return updateRelationshipView(writeCtx, nodeId, association, viewId, input);
    },
    deleteRelationshipView(nodeId: string, association: string, viewId: string) {
      deleteRelationshipView(writeCtx, nodeId, association, viewId);
    },
    patchRelationshipViews(
      nodeId: string,
      association: string,
      input: { viewOrder?: string[]; properties?: string[] },
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
    reorderDatabaseMembers(
      databaseId: string,
      params: ReorderDatabaseMembersParams,
    ) {
      return reorderDatabaseMembersInDb(writeCtx, databaseId, params);
    },
    search(
      query: string,
      limit?: number,
      allowedTypeIds?: string[],
      options?: SearchNodesOptions,
    ): NodeSummary[] {
      return searchNodes(cache, query, limit, allowedTypeIds, {
        includeBody: options?.includeBody,
      }).map((row) => ({
        ...row,
        ...corpusMeta(row.id, options?.activeCorpusId),
      }));
    },
    listRecent(limit?: number): NodeSummary[] {
      return listRecentNodesByModifiedAt(cache, limit).map((row) => ({
        ...row,
        ...corpusMeta(row.id),
      }));
    },
    saveDocument(id: string, document: NodeBodyDocument): boolean {
      return updateNodeBody(writeCtx, id, documentToStorageBody(document));
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
    const writeCtx = openTomeWriteContext(args.store as FlatfileStore, args.cache);
    return buildGraphServices(writeCtx, args.store.contentDir);
  }
  const writeCtx = openContentGraph(contentPath, args);
  return buildGraphServices(writeCtx, contentPath);
}

/** @deprecated Use openTomeGraphServices */
export const openEditorDatabase = openTomeGraphServices;
