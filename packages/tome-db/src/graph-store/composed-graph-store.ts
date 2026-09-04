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
  AssociationsFile,
  DynamicPropertiesFile,
} from "tome-graph-interfaces";
import type { GraphDatabase } from "tome-sqlite";
import type { SQLQueryBindings } from "bun:sqlite";
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

  executeImp(
    graph: ImpGraph,
    context?: ExecuteImpContext,
  ): ImpCollectionResult | Promise<ImpCollectionResult> {
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

  constructor(
    readonly flatfile: FlatfileGraphStore,
    private readonly cache: GraphDatabase,
    readonly sync: CacheSync,
  ) {}

  get contentDir(): string {
    return this.flatfile.contentDir;
  }

  get flatfileBackend(): FlatfileStoreBackend {
    return this.flatfile.backend;
  }

  get queryCache(): GraphDatabase {
    return this.cache;
  }

  close(): void {
    this.flatfile.close();
    this.cache.close();
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

  listNodeIds(): string[] {
    return this.flatfile.listNodeIds();
  }

  getNode(id: string): Node | null {
    return this.flatfile.getNode(id);
  }

  upsertNode(node: Node, body?: string): void {
    this.flatfile.upsertNode(node, body);
  }

  upsertNodeToCorpus(corpusId: string, node: Node, body?: string): void {
    this.flatfile.upsertNodeToCorpus(corpusId, node, body);
  }

  mergeNodeProperties(id: string, patch: Properties): boolean {
    return this.flatfile.mergeNodeProperties(id, patch);
  }

  deleteNode(id: string): void {
    this.flatfile.deleteNode(id);
  }

  archiveNodeFile(id: string): boolean {
    return this.flatfile.archiveNodeFile(id);
  }

  unarchiveNodeFile(id: string): boolean {
    return this.flatfile.unarchiveNodeFile(id);
  }

  getRelationshipRecord(a: string, b: string, type: string): RelationshipRecordRef | null {
    return this.flatfile.getRelationshipRecord(a, b, type);
  }

  findRelationshipRecord(a: string, b: string, type: string): Relationship | null {
    return this.flatfile.findRelationshipRecord(a, b, type);
  }

  upsertRelationshipRecord(entry: RelationshipRecordRef): void {
    this.flatfile.upsertRelationshipRecord(entry);
  }

  deleteRelationshipRecord(a: string, b: string, type: string): boolean {
    return this.flatfile.deleteRelationshipRecord(a, b, type);
  }

  upsertRelationship(
    source: string,
    target: string,
    projectionType: string,
    properties?: Properties,
  ): void {
    this.flatfile.upsertRelationship(source, target, projectionType, properties);
  }

  deleteRelationship(source: string, target: string, projectionType: string): boolean {
    return this.flatfile.deleteRelationship(source, target, projectionType);
  }

  mergeRelationshipProperties(
    source: string,
    target: string,
    projectionType: string,
    patch: Properties,
  ): void {
    this.flatfile.mergeRelationshipProperties(source, target, projectionType, patch);
  }

  replaceRelationshipProperties(
    source: string,
    target: string,
    projectionType: string,
    properties: Properties,
  ): boolean {
    return this.flatfile.replaceRelationshipProperties(source, target, projectionType, properties);
  }

  readAssociations(): AssociationsFile {
    return this.flatfile.readAssociations();
  }

  writeAssociations(file: AssociationsFile): void {
    this.flatfile.writeAssociations(file);
  }

  readSchema(): SchemaFile {
    return this.flatfile.readSchema();
  }

  writeSchema(file: SchemaFile): void {
    this.flatfile.writeSchema(file);
  }

  readViews(): ViewsFile {
    return this.flatfile.readViews();
  }

  writeViews(file: ViewsFile): void {
    this.flatfile.writeViews(file);
  }

  readTableSchemas(): TableSchemasFile {
    return this.flatfile.readTableSchemas();
  }

  writeTableSchemas(file: TableSchemasFile): void {
    this.flatfile.writeTableSchemas(file);
  }

  readWorkspace(): WorkspaceFile {
    return this.flatfile.readWorkspace();
  }

  writeWorkspace(file: WorkspaceFile): void {
    this.flatfile.writeWorkspace(file);
  }

  writeWorkspaceForCorpus(corpusId: string, file: WorkspaceFile): void {
    this.flatfile.writeWorkspaceForCorpus(corpusId, file);
  }

  readDynamicProperties(): DynamicPropertiesFile {
    return this.flatfile.readDynamicProperties();
  }

  writeDynamicProperties(file: DynamicPropertiesFile): void {
    this.flatfile.writeDynamicProperties(file);
  }

  isNodeArchived(id: string): boolean {
    return this.flatfile.isNodeArchived(id);
  }

  forEachRelationshipRecord(
    fn: (entry: RelationshipRecordRef) => void,
    options?: { includeArchived?: boolean },
  ): void {
    // Live records live in the SQLite cache after sync. Archived edges are
    // flatfile-only — fall back when the caller asks for them.
    if (options?.includeArchived) {
      this.flatfile.forEachRelationshipRecord(fn, options);
      return;
    }
    const rows = this.cache.queryAll<{
      node_a: string;
      node_b: string;
      composite_type: string;
      properties: string;
    }>(
      `SELECT node_a, node_b, composite_type, properties
       FROM relationship_records
       ORDER BY id`,
    );
    for (const row of rows) {
      let properties: Properties = {};
      try {
        properties = JSON.parse(row.properties) as Properties;
      } catch {
        properties = {};
      }
      fn({
        a: row.node_a,
        b: row.node_b,
        type: row.composite_type,
        properties,
      });
    }
  }

  listRelationshipProjections(
    nodeId: string,
    options?: ListRelationshipProjectionsOptions,
  ): Relationship[] {
    const direction = options?.direction ?? "both";
    const projectionType = options?.projectionType;
    if (direction === "from") {
      return this.cache.listRelationshipsFromSource(nodeId, projectionType);
    }
    if (direction === "to") {
      return this.cache.listRelationshipsToTarget(nodeId, projectionType);
    }
    const from = this.cache.listRelationshipsFromSource(nodeId, projectionType);
    const to = this.cache.listRelationshipsToTarget(nodeId, projectionType);
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
  listNodesWithBodyLike(pattern: string): { id: string; body: string }[] {
    return this.cache.listNodesWithBodyLike(pattern);
  }

  executeImp(graph: ImpGraph, context?: ExecuteImpContext): ImpCollectionResult {
    return runExecuteImpSql(this.flatfile, this.cache, graph, context);
  }

  queryAll(sql: string, ...params: unknown[]): Record<string, unknown>[] {
    return this.cache.queryAll(sql, ...(params as SQLQueryBindings[]));
  }
}

export function openFlatfileQueryableGraphStore(
  ...args: Parameters<typeof openFlatfileGraphStore>
): FlatfileQueryableGraphStore {
  const base = openFlatfileGraphStore(...args);
  return new FlatfileQueryableGraphStore(base.backend);
}
