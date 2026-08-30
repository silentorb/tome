import type { Node, Properties, Relationship } from "./graph";
import type {
  AssociationsFile,
  DynamicPropertiesFile,
} from "./model-config";
import type { SchemaFile } from "./schema";
import type { StoreChangeEvent, StoreChangeListener } from "./store-events";
import type { TableSchemasFile } from "./table-schemas";
import type { ViewsFile } from "./views";
import type { WorkspaceFile } from "./workspace";

/** Structural Imp graph — compatible with imp-core-types `Graph`. */
export interface ImpGraph {
  nodes: Record<
    string,
    {
      id: string;
      type: string;
      inputs: Partial<Record<string, string | number | boolean | null>>;
    }
  >;
  edges: Record<
    string,
    {
      from: { node: string; port: string };
      to: { node: string; port: string };
    }
  >;
}

export type ImpExecutionBackend = "sql" | "execute";

export type GraphStoreCapabilities =
  | { queryable: false }
  | {
      queryable: true;
      impExecution: ImpExecutionBackend | ImpExecutionBackend[];
    };

export interface ImpCollectionResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface ExecuteImpContext {
  pageNodeId?: string;
  parameters?: Record<string, unknown>;
  allowedTypeIds?: readonly string[];
}

export interface TomeCorpusInfo {
  id: string;
  contentDir: string;
  access: "readwrite" | "readonly";
  workspace: WorkspaceFile;
}

export interface RelationshipRecordRef {
  a: string;
  b: string;
  type: string;
  properties?: Properties;
}

export interface ListRelationshipProjectionsOptions {
  projectionType?: string;
  direction?: "from" | "to" | "both";
}

export interface TomeGraphStoreBase {
  readonly capabilities: GraphStoreCapabilities;
  readonly contentDir: string;

  close(): void;
  subscribe(listener: StoreChangeListener): () => void;
  startWatching(): void;
  stopWatching(): void;

  listCorpora(): readonly TomeCorpusInfo[];
  locateNode(id: string): string | null;
  contentDirForNode(nodeId: string): string;

  listNodeIds(): string[];
  getNode(id: string): Node | null;
  upsertNode(node: Node, body?: string): void;
  /** Write a node into a specific corpus (multi-corpus hosts). */
  upsertNodeToCorpus(corpusId: string, node: Node, body?: string): void;
  mergeNodeProperties(id: string, patch: Properties): boolean;
  deleteNode(id: string): void;
  /** Move node markdown from live tree to archive tree. */
  archiveNodeFile(id: string): boolean;
  /** Move node markdown from archive tree back to live tree. */
  unarchiveNodeFile(id: string): boolean;

  getRelationshipRecord(a: string, b: string, type: string): RelationshipRecordRef | null;
  findRelationshipRecord(a: string, b: string, type: string): Relationship | null;
  upsertRelationshipRecord(entry: RelationshipRecordRef): void;
  deleteRelationshipRecord(a: string, b: string, type: string): boolean;

  upsertRelationship(
    source: string,
    target: string,
    projectionType: string,
    properties?: Properties,
  ): void;
  deleteRelationship(source: string, target: string, projectionType: string): boolean;
  mergeRelationshipProperties(
    source: string,
    target: string,
    projectionType: string,
    patch: Properties,
  ): void;
  replaceRelationshipProperties(
    source: string,
    target: string,
    projectionType: string,
    properties: Properties,
  ): boolean;

  readAssociations(): AssociationsFile;
  writeAssociations(file: AssociationsFile): void;
  readSchema(): SchemaFile;
  writeSchema(file: SchemaFile): void;
  readViews(): ViewsFile;
  writeViews(file: ViewsFile): void;
  readTableSchemas(): TableSchemasFile;
  writeTableSchemas(file: TableSchemasFile): void;
  readWorkspace(): WorkspaceFile;
  writeWorkspace(file: WorkspaceFile): void;
  /** Write workspace JSON for a specific corpus (quick links, etc.). */
  writeWorkspaceForCorpus(corpusId: string, file: WorkspaceFile): void;
  readDynamicProperties(): DynamicPropertiesFile;
  writeDynamicProperties(file: DynamicPropertiesFile): void;

  isNodeArchived(id: string): boolean;
  forEachRelationshipRecord(
    fn: (entry: RelationshipRecordRef) => void,
    options?: { includeArchived?: boolean },
  ): void;

  /** Directed projections incident to `nodeId`, expanded from canonical relationship records. */
  listRelationshipProjections(
    nodeId: string,
    options?: ListRelationshipProjectionsOptions,
  ): Relationship[];
}

export interface TomeGraphStoreQueryable extends TomeGraphStoreBase {
  capabilities: Extract<GraphStoreCapabilities, { queryable: true }>;

  executeImp(graph: ImpGraph, context?: ExecuteImpContext): ImpCollectionResult | Promise<ImpCollectionResult>;

  /** Imp-compiled SQL only — available when `impExecution` includes `"sql"`. */
  queryAll?(sql: string, ...params: unknown[]): Record<string, unknown>[];
}

export function isQueryableGraphStore(
  store: TomeGraphStoreBase,
): store is TomeGraphStoreQueryable {
  return store.capabilities.queryable === true;
}

export type { StoreChangeEvent, StoreChangeListener };
