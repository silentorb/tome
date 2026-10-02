import type { Node, Properties, Relationship } from "./graph";
import type {
  RelationshipTypesFile,
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
  /**
   * Searcher role for Imp `type: "search"` graphs (`title` | `content`).
   * Default `content`.
   */
  searchRole?: "title" | "content";
  /**
   * Selected projection for Only-active filtering (see SearchNodesOptions).
   * Resolved to opposite-host sources when picking a target.
   */
  participatesInProjectionType?: string;
  onlyActivePickingRole?: "source" | "target";
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

  close(): Promise<void>;
  subscribe(listener: StoreChangeListener): () => void;
  startWatching(): void;
  stopWatching(): void;

  listCorpora(): readonly TomeCorpusInfo[];
  locateNode(id: string): string | null;
  contentDirForNode(nodeId: string): string;

  listNodeIds(): Promise<string[]>;
  getNode(id: string): Promise<Node | null>;
  upsertNode(node: Node, body?: string): Promise<void>;
  /** Write a node into a specific corpus (multi-corpus hosts). */
  upsertNodeToCorpus(corpusId: string, node: Node, body?: string): Promise<void>;
  mergeNodeProperties(id: string, patch: Properties): Promise<boolean>;
  deleteNode(id: string): Promise<void>;
  /** Move node markdown from live tree to archive tree. */
  archiveNodeFile(id: string): Promise<boolean>;
  /** Move node markdown from archive tree back to live tree. */
  unarchiveNodeFile(id: string): Promise<boolean>;

  getRelationshipRecord(a: string, b: string, type: string): Promise<RelationshipRecordRef | null>;
  findRelationshipRecord(a: string, b: string, type: string): Promise<Relationship | null>;
  upsertRelationshipRecord(entry: RelationshipRecordRef): Promise<void>;
  deleteRelationshipRecord(a: string, b: string, type: string): Promise<boolean>;

  upsertRelationship(
    source: string,
    target: string,
    projectionType: string,
    properties?: Properties,
  ): Promise<void>;
  deleteRelationship(source: string, target: string, projectionType: string): Promise<boolean>;
  mergeRelationshipProperties(
    source: string,
    target: string,
    projectionType: string,
    patch: Properties,
  ): Promise<void>;
  replaceRelationshipProperties(
    source: string,
    target: string,
    projectionType: string,
    properties: Properties,
  ): Promise<boolean>;

  readRelationshipTypes(): Promise<RelationshipTypesFile>;
  writeRelationshipTypes(file: RelationshipTypesFile): Promise<void>;
  readSchema(): Promise<SchemaFile>;
  writeSchema(file: SchemaFile): Promise<void>;
  readViews(): Promise<ViewsFile>;
  writeViews(file: ViewsFile): Promise<void>;
  readTableSchemas(): Promise<TableSchemasFile>;
  writeTableSchemas(file: TableSchemasFile): Promise<void>;
  readWorkspace(): Promise<WorkspaceFile>;
  writeWorkspace(file: WorkspaceFile): Promise<void>;
  /** Write workspace JSON for a specific corpus (quick links, etc.). */
  writeWorkspaceForCorpus(corpusId: string, file: WorkspaceFile): Promise<void>;
  readDynamicProperties(): Promise<DynamicPropertiesFile>;
  writeDynamicProperties(file: DynamicPropertiesFile): Promise<void>;

  isNodeArchived(id: string): Promise<boolean>;
  forEachRelationshipRecord(
    fn: (entry: RelationshipRecordRef) => void | Promise<void>,
    options?: { includeArchived?: boolean },
  ): Promise<void>;

  /** Directed projections incident to `nodeId`, expanded from canonical relationship records. */
  listRelationshipProjections(
    nodeId: string,
    options?: ListRelationshipProjectionsOptions,
  ): Promise<Relationship[]>;
}

export interface TomeGraphStoreQueryable extends TomeGraphStoreBase {
  capabilities: Extract<GraphStoreCapabilities, { queryable: true }>;

  executeImp(graph: ImpGraph, context?: ExecuteImpContext): Promise<ImpCollectionResult>;

  /** Imp-compiled SQL only — available when `impExecution` includes `"sql"`. */
  queryAll?(sql: string, ...params: unknown[]): Promise<Record<string, unknown>[]>;
}

export function isQueryableGraphStore(
  store: TomeGraphStoreBase,
): store is TomeGraphStoreQueryable {
  return store.capabilities.queryable === true;
}

export type { StoreChangeEvent, StoreChangeListener };
