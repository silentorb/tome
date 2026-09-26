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
  createExtensionExecuteImpServices,
  createExtensionCorpusQueryServices,
  getDatabaseViewDetail,
  getNodePageDetail,
  getRelationTableSection,
  storageBodyToDocument,
  documentToStorageBody,
  attachPageBlockEditorHtml,
  rewriteDatabaseSequence as rewriteDatabaseSequenceInDb,
  DEFAULT_TABLE_ROW_LIMIT,
  loadSchemaFromContent,
  loadAssociationsFromContent,
  labeledRelationshipTypes,
  associationRuleContext,
  recentNodesGraph,
  searchNodesGraph,
  listDistinctProjectionTypes,
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
  type RewriteDatabaseSequenceParams,
  type NodeLifecycleError,
  type SchemaFile,
  type ViewSortSpec,
  type TomeWriteContext,
  loadWorkspaceFromContent,
  primaryTypeTitleForInstance,
} from "tome-db";
import {
  openContentGraph,
  openTomeWriteContext,
  type FlatfileStore,
  type SyncProgressReporter,
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
import { readDocumentIconFile } from "./document-icon";
import {
  documentHasPageBlock,
  stripDuplicateTitleHeading,
  type NodeBodyDocument,
  type NodeSummary,
  type PublicExtensionsManifest,
  type SearchNodesOptions,
  type TableRowsQuery,
  type TomeGraphServices,
  type WorkspacePublic,
} from "tome-graph-interfaces";

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
  options?: {
    startWatching?: boolean;
    searchBackends?: Map<string, unknown>;
  },
): { services: TomeGraphServices; extensionsReady: Promise<void> } {
  if (options?.startWatching !== false) {
    writeCtx.graphStore.startWatching();
  }
  const graphStore = writeCtx.graphStore;

  const searchBackends = options?.searchBackends ?? new Map<string, unknown>();

  const extensions = new ExtensionServerRuntime(
    contentPath,
    () => createExtensionGraphQueryServices(writeCtx.graphStore, contentPath),
    () => createExtensionSchemaQueryServices(graphStore, contentPath),
    () => createExtensionExecuteImpServices(writeCtx.graphStore),
    () => createExtensionGraphMutateServices(writeCtx),
    () => createExtensionCorpusQueryServices(writeCtx.graphStore),
    {
      getQueryCache: () => writeCtx.cache,
      getSearcherBackend: (dataStoreId: string) => searchBackends.get(dataStoreId),
    },
  );

  const syncSearchIntoGraphStore = () => {
    const composed = writeCtx.graphStore as {
      setSearch?: (search: import("tome-interfaces/search").TomeSearch | null) => void;
    };
    composed.setSearch?.(extensions.activeSearch);
  };

  const extensionsReady = extensions
    .ensureLoaded()
    .then(() => {
      syncSearchIntoGraphStore();
    })
    .catch((err: unknown) => {
      console.error("[tome-extensions] failed to load:", err);
    });

  const schema = () => loadSchemaFromContent(contentPath);

  const corpusMeta = (nodeId: string, activeCorpus?: string) => {
    const corpora = writeCtx.graphStore.listCorpora();
    const corpus = writeCtx.graphStore.locateNode(nodeId) ?? undefined;
    const info = corpus
      ? corpora.find((c) => c.id === corpus)
      : undefined;
    const corpusLabel =
      corpora.length > 1 &&
      activeCorpus &&
      corpus &&
      corpus !== activeCorpus
        ? info?.workspace.branding?.appTitle?.trim() || corpus
        : undefined;
    return {
      corpus,
      corpusReadonly: info ? info.access === "readonly" : undefined,
      ...(corpusLabel ? { corpusLabel } : {}),
    };
  };

  const workspaceForCorpus = (corpus?: string): WorkspacePublic => {
    const corpora = writeCtx.graphStore.listCorpora();
    const match = corpus
      ? corpora.find((c) => c.id === corpus)
      : corpora[0];
    const contentDir = match?.contentDir ?? contentPath;
    const ws = match?.workspace ?? loadWorkspaceFromContent(contentDir);
    const archiveNode = graphStore.getNode(ws.archiveNodeId);
    const archiveTitleRaw = archiveNode?.properties.title ?? archiveNode?.properties.alias;
    const archiveNodeTitle =
      typeof archiveTitleRaw === "string" && archiveTitleRaw.trim()
        ? archiveTitleRaw.trim()
        : "Archive";
    return {
      ...ws,
      archiveNodeTitle,
    };
  };

  const services: TomeGraphServices = {
    getWorkspace(corpus?: string): WorkspacePublic {
      return workspaceForCorpus(corpus);
    },
    getDocumentIcon(corpus?: string) {
      const corpora = writeCtx.graphStore.listCorpora();
      const match = corpus
        ? corpora.find((c) => c.id === corpus)
        : corpora[0];
      const contentDir = match?.contentDir ?? contentPath;
      const ws = loadWorkspaceFromContent(contentDir);
      return readDocumentIconFile(contentDir, ws.branding?.documentIconImage);
    },
    listCorpora() {
      return writeCtx.graphStore.listCorpora().map((c) => {
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
    getHomeId(corpus?: string): string {
      const ws = workspaceForCorpus(corpus);
      if (graphStore.getNode(ws.homeNodeId)) return ws.homeNodeId;
      const recent = writeCtx.graphStore.executeImp(recentNodesGraph(1));
      const rows = recent instanceof Promise ? [] : recent.rows;
      return rows[0]?.id ? String(rows[0].id) : ws.homeNodeId;
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
        writeCtx.graphStore.listCorpora().find((c) => c.id === writeCtx.graphStore.locateNode(id))
          ?.contentDir ?? contentPath;
      const detail = getNodePageDetail(graphStore, id, {
        tabId,
        contentDir: nodeContentDir,
        includeSchemaEmptySections: true,
        rows: options?.rows ?? EDITOR_TABLE_ROWS,
      });
      if (!detail) return null;

      let document = stripDuplicateTitleHeading(
        storageBodyToDocument(graphStore, detail.body),
        detail.title,
      );
      const needsPageBlockExtensions = documentHasPageBlock(document);
      if (needsPageBlockExtensions) {
        await extensionsReady;
        try {
          await extensions.ensureLoaded();
          document = await attachPageBlockEditorHtml(document, async (componentId, data) => {
            return extensions.renderPageBlockHtml(id, componentId, data);
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
        corpus: meta.corpus,
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
        graphStore,
        id,
        tabId,
        contentPath,
        rows ?? EDITOR_TABLE_ROWS,
      );
    },
    getRelationTable(nodeId: string, perspective: string, rows?: TableRowsQuery) {
      return getRelationTableSection(graphStore, nodeId, perspective, {
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
      const schemas = loadTableSchemasFromContent(writeCtx.graphStore.contentDir);
      const entries: { id: string; title: string }[] = [];
      for (const id of Object.keys(schemas.tables)) {
        const node = graphStore.getNode(id);
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
  listRelationshipTypes() {
      const registry = loadAssociationsFromContent(contentPath);
      return labeledRelationshipTypes(
        registry,
        listDistinctProjectionTypes(graphStore),
      );
    },
    getRelationshipLinkOptions(sourceId: string, type: string) {
      const registry = loadAssociationsFromContent(contentPath);
      const rule = associationRuleContext(registry, graphStore, sourceId, type, contentPath);
      return {
        allowedTargetTypeIds: rule ? [...rule.allowedTargetTypeIds] : null,
      };
    },
    rewriteDatabaseSequence(
      databaseId: string,
      params: RewriteDatabaseSequenceParams,
    ) {
      return rewriteDatabaseSequenceInDb(writeCtx, databaseId, params);
    },
    search(
      query: string,
      limit?: number,
      allowedTypeIds?: string[],
      options?: SearchNodesOptions,
    ): NodeSummary[] {
      const cap = Math.max(1, Math.min(limit ?? 20, 100));
      const executed = writeCtx.graphStore.executeImp(searchNodesGraph(cap), {
        parameters: { query },
        allowedTypeIds,
        participatesInProjectionType: options?.participatesInProjectionType,
        onlyActivePickingRole: options?.onlyActivePickingRole,
      });
      const rows = executed instanceof Promise ? [] : executed.rows;
      return rows.map((row) => {
        const id = String(row.id);
        const title =
          typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Untitled";
        const matchPreview = row.matchPreview as NodeSummary["matchPreview"];
        return {
          id,
          title,
          primaryTypeTitle: primaryTypeTitleForInstance(graphStore, id),
          ...(matchPreview ? { matchPreview } : {}),
          ...corpusMeta(id, options?.activeCorpus),
        };
      });
    },
    isSearchAvailable(): boolean {
      return extensions.isSearchAvailable();
    },
    listRecent(limit?: number): NodeSummary[] {
      const cap = Math.max(1, Math.min(limit ?? 20, 100));
      const executed = writeCtx.graphStore.executeImp(recentNodesGraph(cap));
      const rows = executed instanceof Promise ? [] : executed.rows;
      return rows.map((row) => {
        const id = String(row.id);
        return {
          id,
          title: typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Untitled",
          primaryTypeTitle: primaryTypeTitleForInstance(graphStore, id),
          ...corpusMeta(id),
        };
      });
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
      options?: { label?: string },
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
        graphStore,
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
      return exportFullGraph(writeCtx.graphStore, contentPath);
    },
    getGraphExplorerLod(options?: { anchorId?: string; layerCount?: number }): GraphLodSnapshot {
      return exportExplorerLodGraph(writeCtx.graphStore, { ...options, contentDir: contentPath });
    },
    executeImp(graph, context) {
      return writeCtx.graphStore.executeImp(graph, context);
    },
    async getExtensionsManifest(): Promise<PublicExtensionsManifest> {
      await extensionsReady;
      await extensions.ensureLoaded();
      return extensions.getPublicManifest();
    },
    async prepareEditorBody(nodeId: string, markdown: string): Promise<string | null> {
      if (!graphStore.getNode(nodeId)) return null;
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
      writeCtx.graphStore.close();
    },
  };

  return {
    services,
    extensionsReady: extensionsReady.then(() => undefined),
  };
}

/**
 * Open graph services from injected store + cache, or from db/content paths (tests).
 *
 * - `openTomeGraphServices({ store, cache })` — host DI path (syncs cache before return)
 * - `openTomeGraphServices(dbPath, contentPath)` — test convenience via `openContentGraph`
 */
export function openTomeGraphServices(
  args: OpenTomeGraphServicesArgs | string = resolveDbPath(),
  contentPath = resolveContentPath(),
): TomeGraphServices {
  if (typeof args === "object" && args !== null && "store" in args && "cache" in args) {
    const writeCtx = openTomeWriteContext(args.store as FlatfileStore, args.cache);
    return buildGraphServices(writeCtx, args.store.contentDir).services;
  }
  const writeCtx = openContentGraph(contentPath, args);
  return buildGraphServices(writeCtx, contentPath).services;
}

export type DeferredTomeGraphServices = {
  services: TomeGraphServices;
  writeCtx: TomeWriteContext;
  startWatching: () => void;
  /** Resolves when extension modules (including searcher) have loaded. */
  extensionsReady: Promise<void>;
};

/**
 * Open graph services without blocking on cache sync or starting file watchers.
 * Caller runs cache sync (ensureReadyAsync / SyncGraphWire.runInitialFull), then
 * `startWatching()`. When `skipStoreSyncSubscribe` is set, do not call
 * `finishDeferredWriteContextReady` — observers are already wired.
 */
export function openTomeGraphServicesDeferred(
  args: OpenTomeGraphServicesArgs,
  options?: {
    progress?: SyncProgressReporter;
    /** Reuse an existing write context (e.g. from openDataStoreSession). */
    writeContext?: TomeWriteContext;
    /** When true, observers are already installed (SyncGraphWire); skip CacheSync subscribe. */
    skipStoreSyncSubscribe?: boolean;
    /** dataStore id → TomeSearch (or FTS handle) for searcher extensions. */
    searchBackends?: Map<string, unknown>;
  },
): DeferredTomeGraphServices {
  const writeCtx =
    options?.writeContext ??
    openTomeWriteContext(args.store as FlatfileStore, args.cache, {
      deferReady: true,
      progress: options?.progress,
    });
  const built = buildGraphServices(writeCtx, args.store.contentDir, {
    startWatching: false,
    searchBackends: options?.searchBackends,
  });
  return {
    services: built.services,
    writeCtx,
    startWatching: () => writeCtx.graphStore.startWatching(),
    extensionsReady: built.extensionsReady,
  };
}

/** @deprecated Use openTomeGraphServices */
export const openEditorDatabase = openTomeGraphServices;
