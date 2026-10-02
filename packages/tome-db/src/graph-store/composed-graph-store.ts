import {
  FlatfileGraphStore,
  openFlatfileGraphStore,
  type FlatfileStoreBackend,
} from "tome-flatfile";
import type {
  ExecuteImpContext,
  ImpCollectionResult,
  ImpGraph,
  Node,
  Properties,
  Relationship,
  RelationshipRecordRef,
  SchemaFile,
  StoreChangeListener,
  TableSchemasFile,
  TomeCorpusInfo,
  TomeGraphStoreQueryable,
  ViewsFile,
  WorkspaceFile,
  ListRelationshipProjectionsOptions,
  RelationshipTypesFile,
  DynamicPropertiesFile,
} from "tome-graph-interfaces";
import type { TomeQueryCache } from "tome-service-interfaces";
import type { CacheSync } from "../content/sync";
import { runExecuteImp, runExecuteImpSql } from "./execute-imp";

/** Queryable flatfile store — executeImp via imp-execution (no SQLite). */
export class FlatfileQueryableGraphStore
  extends FlatfileGraphStore
  implements TomeGraphStoreQueryable
{
  override readonly capabilities: TomeGraphStoreQueryable["capabilities"] = {
    queryable: true,
    impExecution: "execute",
  };

  constructor(backend: FlatfileStoreBackend) {
    super(backend);
  }

  async executeImp(
    graph: ImpGraph,
    context?: ExecuteImpContext,
  ): Promise<ImpCollectionResult> {
    return runExecuteImp({
      backend: "execute",
      store: this,
      graph,
      context,
    });
  }
}

/** Composed host store — Base on flatfile, executeImp via SQL cache. */
export class ComposedGraphStore implements TomeGraphStoreQueryable {
  readonly capabilities: TomeGraphStoreQueryable["capabilities"] = {
    queryable: true,
    impExecution: "sql",
  };

  #searchByRole: {
    title: import("tome-interfaces/search").TomeSearch | null;
    content: import("tome-interfaces/search").TomeSearch | null;
  } = { title: null, content: null };

  constructor(
    readonly flatfile: FlatfileGraphStore,
    private readonly cache: TomeQueryCache,
    readonly sync: CacheSync,
  ) {}

  get contentDir(): string {
    return this.flatfile.contentDir;
  }

  get flatfileBackend(): FlatfileStoreBackend {
    return this.flatfile.backend;
  }

  get queryCache(): TomeQueryCache {
    return this.cache;
  }

  async close(): Promise<void> {
    await this.flatfile.close();
    await this.cache.close();
  }

  subscribe(listener: StoreChangeListener): () => void {
    return this.flatfile.subscribe(listener);
  }

  startWatching(): void {
    this.flatfile.startWatching();
  }

  stopWatching(): void {
    this.flatfile.stopWatching();
  }

  listCorpora(): readonly TomeCorpusInfo[] {
    return this.flatfile.listCorpora();
  }

  locateNode(id: string): string | null {
    return this.flatfile.locateNode(id);
  }

  contentDirForNode(nodeId: string): string {
    return this.flatfile.contentDirForNode(nodeId);
  }

  listNodeIds(): Promise<string[]> {
    return this.flatfile.listNodeIds();
  }

  getNode(id: string): Promise<Node | null> {
    return this.cache.getNode(id);
  }

  upsertNode(node: Node, body?: string): Promise<void> {
    return this.flatfile.upsertNode(node, body);
  }

  upsertNodeToCorpus(corpusId: string, node: Node, body?: string): Promise<void> {
    return this.flatfile.upsertNodeToCorpus(corpusId, node, body);
  }

  mergeNodeProperties(id: string, patch: Properties): Promise<boolean> {
    return this.flatfile.mergeNodeProperties(id, patch);
  }

  deleteNode(id: string): Promise<void> {
    return this.flatfile.deleteNode(id);
  }

  archiveNodeFile(id: string): Promise<boolean> {
    return this.flatfile.archiveNodeFile(id);
  }

  unarchiveNodeFile(id: string): Promise<boolean> {
    return this.flatfile.unarchiveNodeFile(id);
  }

  getRelationshipRecord(a: string, b: string, type: string): Promise<RelationshipRecordRef | null> {
    return this.flatfile.getRelationshipRecord(a, b, type);
  }

  findRelationshipRecord(a: string, b: string, type: string): Promise<Relationship | null> {
    return this.flatfile.findRelationshipRecord(a, b, type);
  }

  upsertRelationshipRecord(entry: RelationshipRecordRef): Promise<void> {
    return this.flatfile.upsertRelationshipRecord(entry);
  }

  deleteRelationshipRecord(a: string, b: string, type: string): Promise<boolean> {
    return this.flatfile.deleteRelationshipRecord(a, b, type);
  }

  upsertRelationship(
    source: string,
    target: string,
    projectionType: string,
    properties?: Properties,
  ): Promise<void> {
    return this.flatfile.upsertRelationship(source, target, projectionType, properties);
  }

  deleteRelationship(source: string, target: string, projectionType: string): Promise<boolean> {
    return this.flatfile.deleteRelationship(source, target, projectionType);
  }

  mergeRelationshipProperties(
    source: string,
    target: string,
    projectionType: string,
    patch: Properties,
  ): Promise<void> {
    return this.flatfile.mergeRelationshipProperties(source, target, projectionType, patch);
  }

  replaceRelationshipProperties(
    source: string,
    target: string,
    projectionType: string,
    properties: Properties,
  ): Promise<boolean> {
    return this.flatfile.replaceRelationshipProperties(source, target, projectionType, properties);
  }

  readRelationshipTypes(): Promise<RelationshipTypesFile> {
    return this.flatfile.readRelationshipTypes();
  }

  writeRelationshipTypes(file: RelationshipTypesFile): Promise<void> {
    return this.flatfile.writeRelationshipTypes(file);
  }

  readSchema(): Promise<SchemaFile> {
    return this.flatfile.readSchema();
  }

  writeSchema(file: SchemaFile): Promise<void> {
    return this.flatfile.writeSchema(file);
  }

  readViews(): Promise<ViewsFile> {
    return this.flatfile.readViews();
  }

  writeViews(file: ViewsFile): Promise<void> {
    return this.flatfile.writeViews(file);
  }

  readTableSchemas(): Promise<TableSchemasFile> {
    return this.flatfile.readTableSchemas();
  }

  writeTableSchemas(file: TableSchemasFile): Promise<void> {
    return this.flatfile.writeTableSchemas(file);
  }

  readWorkspace(): Promise<WorkspaceFile> {
    return this.flatfile.readWorkspace();
  }

  writeWorkspace(file: WorkspaceFile): Promise<void> {
    return this.flatfile.writeWorkspace(file);
  }

  writeWorkspaceForCorpus(corpusId: string, file: WorkspaceFile): Promise<void> {
    return this.flatfile.writeWorkspaceForCorpus(corpusId, file);
  }

  readDynamicProperties(): Promise<DynamicPropertiesFile> {
    return this.flatfile.readDynamicProperties();
  }

  writeDynamicProperties(file: DynamicPropertiesFile): Promise<void> {
    return this.flatfile.writeDynamicProperties(file);
  }

  isNodeArchived(id: string): Promise<boolean> {
    return this.flatfile.isNodeArchived(id);
  }

  async forEachRelationshipRecord(
    fn: (entry: RelationshipRecordRef) => void | Promise<void>,
    options?: { includeArchived?: boolean },
  ): Promise<void> {
    // Live records live in the SQLite cache after sync. Archived edges are
    // flatfile-only — fall back when the caller asks for them.
    if (options?.includeArchived) {
      await this.flatfile.forEachRelationshipRecord(fn, options);
      return;
    }
    const rows = await this.cache.queryAll<{ id: string }>(
      `SELECT id FROM relationship_records ORDER BY id`,
    );
    for (const row of rows) {
      const record = await this.cache.getRelationshipRecord(row.id);
      if (!record) continue;
      await fn({
        a: record.nodeA,
        b: record.nodeB,
        type: record.compositeType,
        properties: record.properties,
      });
    }
  }

  async listRelationshipProjections(
    nodeId: string,
    options?: ListRelationshipProjectionsOptions,
  ): Promise<Relationship[]> {
    const direction = options?.direction ?? "both";
    const projectionType = options?.projectionType;
    if (direction === "from") {
      return this.cache.listRelationshipsFromSource(nodeId, projectionType);
    }
    if (direction === "to") {
      return this.cache.listRelationshipsToTarget(nodeId, projectionType);
    }
    const from = await this.cache.listRelationshipsFromSource(nodeId, projectionType);
    const to = await this.cache.listRelationshipsToTarget(nodeId, projectionType);
    if (to.length === 0) return from;
    if (from.length === 0) return to;
    const seen = new Set(from.map((rel) => rel.id));
    const merged = from.slice();
    for (const rel of to) {
      if (seen.has(rel.id)) continue;
      seen.add(rel.id);
      merged.push(rel);
    }
    return merged;
  }

  /** Body substring scan via SQLite (backlink discovery). */
  listNodesWithBodyLike(pattern: string): Promise<{ id: string; body: string }[]> {
    return this.cache.listNodesWithBodyLike(pattern);
  }

  getRelationship(id: string): Promise<Relationship | null> {
    return this.cache.getRelationship(id);
  }

  async executeImp(graph: ImpGraph, context?: ExecuteImpContext): Promise<ImpCollectionResult> {
    const role = context?.searchRole === "title" ? "title" : "content";
    return runExecuteImpSql(
      this.flatfile,
      this.cache,
      graph,
      context,
      this.#searchByRole[role],
    );
  }

  /** Bind a searcher to a use-case role (`title` or `content`). */
  setSearchForRole(
    role: "title" | "content",
    search: import("tome-interfaces/search").TomeSearch | null,
  ): void {
    this.#searchByRole[role] = search;
  }

  /** Bind both roles (same instance may fill both). */
  setSearchRoles(roles: {
    title?: import("tome-interfaces/search").TomeSearch | null;
    content?: import("tome-interfaces/search").TomeSearch | null;
  }): void {
    if (roles.title !== undefined) this.#searchByRole.title = roles.title;
    if (roles.content !== undefined) this.#searchByRole.content = roles.content;
  }

  /**
   * Resolve searcher for a role. Default `content` (table `q` / Imp search).
   * Passing a single searcher via {@link setSearch} dual-binds both roles.
   */
  getSearch(
    role: "title" | "content" = "content",
  ): import("tome-interfaces/search").TomeSearch | null {
    return this.#searchByRole[role];
  }

  /** Dual-bind both roles to one searcher (tests / single-searcher hosts). */
  setSearch(search: import("tome-interfaces/search").TomeSearch | null): void {
    this.#searchByRole.title = search;
    this.#searchByRole.content = search;
  }

  queryAll(sql: string, ...params: unknown[]): Promise<Record<string, unknown>[]> {
    return this.cache.queryAll(sql, ...params);
  }
}

export function openFlatfileQueryableGraphStore(
  ...args: Parameters<typeof openFlatfileGraphStore>
): FlatfileQueryableGraphStore {
  const base = openFlatfileGraphStore(...args);
  return new FlatfileQueryableGraphStore(base.backend);
}
