import {
  archiveNode as archiveNodeInDb,
  unarchiveNode as unarchiveNodeInDb,
  addWorkspaceQuickLink,
  removeWorkspaceQuickLink,
  reorderWorkspaceQuickLinks,
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
  loadRelationshipTypesFromContent,
  labeledRelationshipTypes,
  relationshipTypeRuleContext,
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
  type CreateNodeInput,
  type RewriteDatabaseSequenceParams,
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
      setSearchRoles?: (roles: {
        title?: import("tome-interfaces/search").TomeSearch | null;
        content?: import("tome-interfaces/search").TomeSearch | null;
      }) => void;
      setSearch?: (search: import("tome-interfaces/search").TomeSearch | null) => void;
    };
    if (composed.setSearchRoles) {
      composed.setSearchRoles({
        title: extensions.getSearch("title"),
        content: extensions.getSearch("content"),
      });
    } else {
      composed.setSearch?.(extensions.getSearch("content"));
    }
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

  const corpusMeta = async (nodeId: string, activeCorpus?: string) => {
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

  const workspaceForCorpus = async (corpus?: string): Promise<WorkspacePublic> => {
    const corpora = writeCtx.graphStore.listCorpora();
    const match = corpus
      ? corpora.find((c) => c.id === corpus)
      : corpora[0];
    const contentDir = match?.contentDir ?? contentPath;
    const ws = match?.workspace ?? loadWorkspaceFromContent(contentDir);
    const archiveNode = await graphStore.getNode(ws.archiveNodeId);
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
    async getWorkspace(corpus?: string) {
      return workspaceForCorpus(corpus);
    },
    async getDocumentIcon(corpus?: string) {
      const corpora = writeCtx.graphStore.listCorpora();
      const match = corpus
        ? corpora.find((c) => c.id === corpus)
        : corpora[0];
      const contentDir = match?.contentDir ?? contentPath;
      const ws = loadWorkspaceFromContent(contentDir);
      return readDocumentIconFile(contentDir, ws.branding?.documentIconImage);
    },
    async listCorpora() {
      const out = [];
      for (const c of writeCtx.graphStore.listCorpora()) {
        const workspace = await workspaceForCorpus(c.id);
        out.push({
          id: c.id,
          access: c.access,
          label: c.workspace.branding?.appTitle?.trim() || c.id,
          homeNodeId: c.workspace.homeNodeId,
          archiveNodeId: c.workspace.archiveNodeId,
          workspace,
        });
      }
      return out;
    },
    async getHomeId(corpus?: string) {
      const ws = await workspaceForCorpus(corpus);
      if (await graphStore.getNode(ws.homeNodeId)) return ws.homeNodeId;
      const recent = await writeCtx.graphStore.executeImp(recentNodesGraph(1));
      const rows = recent.rows;
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
      const detail = await Promise.resolve(
        getNodePageDetail(graphStore, id, {
          tabId,
          contentDir: nodeContentDir,
          includeSchemaEmptySections: true,
          rows: options?.rows ?? EDITOR_TABLE_ROWS,
        }),
      );
      if (!detail) return null;

      let document = stripDuplicateTitleHeading(
        await Promise.resolve(storageBodyToDocument(graphStore, detail.body)),
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

      const meta = await corpusMeta(id);
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
    async getDatabaseView(id: string, tabId?: string, rows?: TableRowsQuery) {
      return Promise.resolve(
        getDatabaseViewDetail(
          graphStore,
          id,
          tabId,
          contentPath,
          rows ?? EDITOR_TABLE_ROWS,
        ),
      );
    },
    async getRelationTable(nodeId: string, perspective: string, rows?: TableRowsQuery) {
      return Promise.resolve(
        getRelationTableSection(graphStore, nodeId, perspective, {
          contentDir: contentPath,
          includeSchemaEmptySections: true,
          rowsQuery: rows ?? EDITOR_TABLE_ROWS,
        }),
      );
    },
    async getNodeViews(nodeId: string) {
      return Promise.resolve(readNodeViews(writeCtx, nodeId));
    },
    async createRelationshipView(
      nodeId: string,
      relationshipTypeId: string,
      input: { name: string; sorts?: ViewSortSpec[]; properties?: string[] },
    ) {
      return createRelationshipView(writeCtx, nodeId, relationshipTypeId, input);
    },
    async updateRelationshipView(
      nodeId: string,
      relationshipTypeId: string,
      viewId: string,
      input: { name?: string; sorts?: ViewSortSpec[]; properties?: string[] },
    ) {
      return updateRelationshipView(writeCtx, nodeId, relationshipTypeId, viewId, input);
    },
    async deleteRelationshipView(nodeId: string, relationshipTypeId: string, viewId: string) {
      await deleteRelationshipView(writeCtx, nodeId, relationshipTypeId, viewId);
    },
    async patchRelationshipViews(
      nodeId: string,
      relationshipTypeId: string,
      input: { viewOrder?: string[]; properties?: string[] },
    ) {
      return patchRelationshipViews(writeCtx, nodeId, relationshipTypeId, input);
    },
    async deleteDatabaseColumn(databaseId: string, columnKey: string) {
      return deleteDatabaseColumnInDb(writeCtx, databaseId, columnKey);
    },
    async createDatabaseColumn(databaseId: string, input: CreateDatabaseColumnInput) {
      return createDatabaseColumnInDb(writeCtx, databaseId, input);
    },
    async updateDatabaseColumn(
      databaseId: string,
      columnKey: string,
      input: UpdateDatabaseColumnInput,
    ) {
      return updateDatabaseColumnInDb(writeCtx, databaseId, columnKey, input);
    },
    async listTypeTables() {
      const schemas = loadTableSchemasFromContent(writeCtx.graphStore.contentDir);
      const entries: { id: string; title: string }[] = [];
      for (const id of Object.keys(schemas.tables)) {
        const node = await graphStore.getNode(id);
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
    async getSchema(): Promise<SchemaFile> {
      return schema();
    },
    async listRelationshipTypes() {
      const registry = loadRelationshipTypesFromContent(contentPath);
      return labeledRelationshipTypes(
        registry,
        await Promise.resolve(listDistinctProjectionTypes(graphStore)),
      );
    },
    async getRelationshipLinkOptions(sourceId: string, type: string) {
      const registry = loadRelationshipTypesFromContent(contentPath);
      const rule = await Promise.resolve(
        relationshipTypeRuleContext(registry, graphStore, sourceId, type, contentPath),
      );
      return {
        allowedTargetTypeIds: rule ? [...rule.allowedTargetTypeIds] : null,
      };
    },
    async rewriteDatabaseSequence(
      databaseId: string,
      params: RewriteDatabaseSequenceParams,
    ) {
      return rewriteDatabaseSequenceInDb(writeCtx, databaseId, params);
    },
    async search(
      query: string,
      limit?: number,
      allowedTypeIds?: string[],
      options?: SearchNodesOptions,
    ) {
      const cap = Math.max(1, Math.min(limit ?? 20, 100));
      const searchRole = options?.role === "title" ? "title" : "content";
      const executed = await writeCtx.graphStore.executeImp(searchNodesGraph(cap), {
        parameters: { query },
        allowedTypeIds,
        searchRole,
        participatesInProjectionType: options?.participatesInProjectionType,
        onlyActivePickingRole: options?.onlyActivePickingRole,
      });
      const rows = executed.rows;
      const summaries: NodeSummary[] = [];
      for (const row of rows) {
        const id = String(row.id);
        const title =
          typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Untitled";
        const matchPreview = row.matchPreview as NodeSummary["matchPreview"];
        summaries.push({
          id,
          title,
          primaryTypeTitle: await Promise.resolve(
            primaryTypeTitleForInstance(graphStore, id),
          ),
          ...(matchPreview ? { matchPreview } : {}),
          ...(await corpusMeta(id, options?.activeCorpus)),
        });
      }
      return summaries;
    },
    async isSearchAvailable(role?: "title" | "content") {
      return extensions.isSearchAvailable(role ?? "content");
    },
    async listRecent(limit?: number) {
      const cap = Math.max(1, Math.min(limit ?? 20, 100));
      const executed = await writeCtx.graphStore.executeImp(recentNodesGraph(cap));
      const rows = executed.rows;
      const summaries: NodeSummary[] = [];
      for (const row of rows) {
        const id = String(row.id);
        summaries.push({
          id,
          title: typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Untitled",
          primaryTypeTitle: await Promise.resolve(
            primaryTypeTitleForInstance(graphStore, id),
          ),
          ...(await corpusMeta(id)),
        });
      }
      return summaries;
    },
    async saveDocument(id: string, document: NodeBodyDocument) {
      return updateNodeBody(writeCtx, id, documentToStorageBody(document));
    },
    async saveTitle(id: string, title: string) {
      return updateNodeTitle(writeCtx, id, title);
    },
    async updateDatabaseRowProperty(
      databaseId: string,
      nodeId: string,
      propertyKey: string,
      value: string | null,
    ) {
      return Promise.resolve(
        updateDatabaseRowProperty(writeCtx, databaseId, nodeId, propertyKey, value),
      );
    },
    async updateOutgoingRelationshipProperty(
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
    async deleteNode(id: string) {
      return deleteNodeInDb(writeCtx, id);
    },
    async archiveNode(id: string) {
      return archiveNodeInDb(writeCtx, id);
    },
    async unarchiveNode(id: string) {
      return unarchiveNodeInDb(writeCtx, id);
    },
    async addQuickLink(id: string, options?: { label?: string }) {
      return Promise.resolve(addWorkspaceQuickLink(writeCtx, id, options));
    },
    async removeQuickLink(id: string) {
      return Promise.resolve(removeWorkspaceQuickLink(writeCtx, id));
    },
    async reorderQuickLinks(nodeIds: readonly string[]) {
      return Promise.resolve(reorderWorkspaceQuickLinks(writeCtx, nodeIds));
    },
    async createNode(input: CreateNodeInput) {
      return createNodeInDb(writeCtx, input);
    },
    async createRelationRow(
      sourceId: string,
      input: { type: string; title: string; properties?: Record<string, string> },
    ) {
      const registry = loadRelationshipTypesFromContent(contentPath);
      const rule = await Promise.resolve(
        relationshipTypeRuleContext(
          registry,
          graphStore,
          sourceId,
          input.type,
          contentPath,
        ),
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
    async linkOutgoingRelationship(
      sourceId: string,
      input: { type: string; targetId: string },
    ) {
      return linkOutgoingRelationship(writeCtx, {
        sourceId,
        targetId: input.targetId,
        type: input.type,
      });
    },
    async unlinkOutgoingRelationship(
      sourceId: string,
      type: string,
      targetId: string,
    ) {
      return unlinkOutgoingRelationship(writeCtx, sourceId, targetId, type);
    },
    async moveRelationshipConnection(input: {
      type: string;
      oldSourceId: string;
      oldTargetId: string;
      newSourceId: string;
      newTargetId: string;
    }) {
      return moveRelationshipConnection(writeCtx, {
        ...input,
      });
    },
    async getGraphFull() {
      return Promise.resolve(exportFullGraph(writeCtx.graphStore, contentPath));
    },
    async getGraphExplorerLod(options?: { anchorId?: string; layerCount?: number }) {
      return Promise.resolve(
        exportExplorerLodGraph(writeCtx.graphStore, { ...options, contentDir: contentPath }),
      );
    },
    async executeImp(graph, context) {
      return writeCtx.graphStore.executeImp(graph, context);
    },
    async getExtensionsManifest(): Promise<PublicExtensionsManifest> {
      await extensionsReady;
      await extensions.ensureLoaded();
      return extensions.getPublicManifest();
    },
    async prepareEditorBody(nodeId: string, markdown: string): Promise<string | null> {
      if (!(await graphStore.getNode(nodeId))) return null;
      await extensionsReady;
      await extensions.ensureLoaded();
      return extensions.prepareEditorBody(nodeId, markdown);
    },
    async invokeExtension(componentId, input, nodeId) {
      await extensionsReady;
      return extensions.invokeExtension(componentId, input, nodeId);
    },
    async bundleEditorExtension(extensionId) {
      await extensionsReady;
      return extensions.bundleEditorModule(extensionId);
    },
    async close() {
      await writeCtx.graphStore.close();
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
export async function openTomeGraphServices(
  args: OpenTomeGraphServicesArgs | string = resolveDbPath(),
  contentPath = resolveContentPath(),
): Promise<TomeGraphServices> {
  if (typeof args === "object" && args !== null && "store" in args && "cache" in args) {
    const writeCtx = await openTomeWriteContext(args.store as FlatfileStore, args.cache);
    return buildGraphServices(writeCtx, args.store.contentDir).services;
  }
  const writeCtx = await openContentGraph(contentPath, args);
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
 * Caller runs cache sync (`ensureReady` / SyncGraphWire.runInitialFull), then
 * `startWatching()`. When `skipStoreSyncSubscribe` is set, do not call
 * `finishDeferredWriteContextReady` — observers are already wired.
 */
export async function openTomeGraphServicesDeferred(
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
): Promise<DeferredTomeGraphServices> {
  const writeCtx =
    options?.writeContext ??
    (await openTomeWriteContext(args.store as FlatfileStore, args.cache, {
      deferReady: true,
      progress: options?.progress,
    }));
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
