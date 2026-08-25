import {
  FlatfileGraphStore,
  openFlatfileGraphStore,
  type FlatfileStoreBackend,
} from "tome-flatfile";
import type {
  ExecuteImpContext,
  GraphStoreCapabilities,
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
  AssociationsFile,
  DynamicPropertiesFile,
} from "tome-graph-interfaces";
import type { GraphDatabase } from "tome-sqlite";
import type { CacheSync } from "../content/sync";
import { runExecuteImp, runExecuteImpSql } from "./execute-imp";

/** Queryable flatfile store — executeImp via imp-execution (no SQLite). */
export class FlatfileQueryableGraphStore
  extends FlatfileGraphStore
  implements TomeGraphStoreQueryable
{
  override readonly capabilities: GraphStoreCapabilities = {
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
  readonly capabilities: GraphStoreCapabilities = {
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

  mergeNodeProperties(id: string, patch: Properties): boolean {
    return this.flatfile.mergeNodeProperties(id, patch);
  }

  deleteNode(id: string): void {
    this.flatfile.deleteNode(id);
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
    this.flatfile.forEachRelationshipRecord(fn, options);
  }

  executeImp(graph: ImpGraph, context?: ExecuteImpContext): ImpCollectionResult {
    return runExecuteImpSql(this.flatfile, this.cache, graph, context);
  }

  queryAll(sql: string, ...params: unknown[]): Record<string, unknown>[] {
    return this.cache.queryAll(sql, ...params);
  }
}

export function openFlatfileQueryableGraphStore(
  ...args: Parameters<typeof openFlatfileGraphStore>
): FlatfileQueryableGraphStore {
  const base = openFlatfileGraphStore(...args);
  return new FlatfileQueryableGraphStore(base.backend);
}
