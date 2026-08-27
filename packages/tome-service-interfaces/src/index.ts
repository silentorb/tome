import type { TomeGraphServices } from "tome-graph-interfaces";
import type {
  Node,
  Properties,
  Relationship,
  TableSchemasFile,
  ViewsFile,
  WorkspaceFile,
} from "tome-graph-interfaces";

export type { TableSchemasFile, ViewsFile, WorkspaceFile } from "tome-graph-interfaces";

/** Per-entry options from `tome-server.json` (module-specific). */
export type TomeServiceModuleOptions = unknown;

/**
 * Host context passed into a service module when the server starts it.
 * `services` is the domain facade (`TomeGraphServices`), not a service module.
 */
export interface TomeServiceHost {
  services: TomeGraphServices;
  options: TomeServiceModuleOptions;
}

/**
 * A service module the host starts (HTTP today; others later).
 * Must not encode URL paths or HTTP verbs in this package.
 */
export interface TomeServiceModule {
  readonly id: string;
  start(host: TomeServiceHost): void | Promise<void>;
  stop?(): void | Promise<void>;
}

/** Factory shape expected by `tome-server.json` `export` field for services. */
export type TomeServiceModuleFactory = () => TomeServiceModule;

/** Shared `{ id, module, export, options? }` entry for singular or array slots. */
export interface TomeServerModuleConfigEntry {
  id: string;
  module: string;
  export: string;
  options?: TomeServiceModuleOptions;
}

export interface TomeServerConfig {
  version: number;
  /** Singular data store (required). */
  store: TomeServerModuleConfigEntry;
  /** Singular query cache (required). */
  cache: TomeServerModuleConfigEntry;
  /** Zero or more protocol adapters (e.g. HTTP). */
  services: TomeServerModuleConfigEntry[];
}

// ---------------------------------------------------------------------------
// Store change events (store owns watching; domain subscribes)
// ---------------------------------------------------------------------------

export type StoreChangeKind =
  | "node"
  | "relationships"
  | "associations"
  | "schema"
  | "dynamic-properties"
  | "views"
  | "workspace"
  | "table-presentation"
  | "sequencing"
  | "extensions"
  | "table-schemas"
  | "unknown";

export interface StoreChangeEvent {
  /** Relative or basename hint suitable for sync routing (e.g. node file name). */
  path: string;
  kind: StoreChangeKind;
}

export type StoreChangeListener = (event: StoreChangeEvent) => void;

// ---------------------------------------------------------------------------
// Store / cache file + row shapes used by the runtime contracts
// ---------------------------------------------------------------------------

export interface RelationshipEntry {
  a: string;
  b: string;
  type: string;
  properties?: Properties;
}

export interface RelationshipsFile {
  version: number;
  relationships: RelationshipEntry[];
}

export type PerspectiveLabelConfig =
  | string
  | { title: string; linkAdd?: string; linkExisting?: boolean };

export type PerspectivePair = [PerspectiveLabelConfig, PerspectiveLabelConfig];

export interface TraitObjectEntry {
  key: string;
  [configKey: string]: unknown;
}

export type TraitEntry = string | TraitObjectEntry;

export interface AssociationEndpointConstraint {
  typeId: string;
}

export interface AssociationEndpoints {
  0: AssociationEndpointConstraint;
  1: AssociationEndpointConstraint;
}

export interface AssociationDefinition {
  perspectives: PerspectivePair;
  linkExisting?: boolean;
  traits?: TraitEntry[];
  endpoints?: AssociationEndpoints;
}

export interface AssociationsFile {
  version: number;
  associations: Record<string, AssociationDefinition>;
}

export interface DynamicPropertyFileEntry {
  id: string;
  owner: string;
  columnKey: string;
  columnName: string;
  columnType: string;
  resolverId: string;
  params?: Record<string, unknown>;
}

export interface DynamicColumnSetFileEntry {
  id: string;
  owner: string;
  columnKeyPattern: string;
  columnNamePattern: string;
  columnType: string;
  resolverId: string;
  params?: Record<string, unknown>;
}

export interface DynamicPropertiesFile {
  version: number;
  properties: DynamicPropertyFileEntry[];
  columnSets: DynamicColumnSetFileEntry[];
}

export interface RelationshipRecordRow {
  id: string;
  nodeA: string;
  nodeB: string;
  compositeType: string;
  properties: Properties;
}

export interface RelationshipProjectionRow {
  id: string;
  recordId: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: string;
  properties: Properties;
}

export interface GraphCounts {
  nodes: number;
  relationships: number;
}

/** Encode/decode relationship property bags for cache storage (e.g. enum indices). */
export interface RelationshipPropertyCodec {
  encode(properties: Properties): Properties;
  decode(properties: Properties): Properties;
}

export interface TomeQueryCacheOpenOptions {
  /** SQLite file path. */
  dbPath?: string;
  clean?: boolean;
  propertyCodec?: RelationshipPropertyCodec;
  /** Local perspective types for set-trait filtering (archive, type filters). */
  memberPerspectives?: () => readonly string[];
}

export type CorpusAccess = "readwrite" | "readonly";

export interface TomeCorpusConfig {
  /** Stable slug (e.g. `marloth`, `translucence`). */
  id: string;
  /** Content root (`content/`). */
  contentPath: string;
  /** Defaults to `readwrite`. */
  access?: CorpusAccess;
}

export interface TomeCorpusInfo {
  id: string;
  contentDir: string;
  access: CorpusAccess;
  workspace: WorkspaceFile;
}

export interface TomeDataStoreOpenOptions {
  /** Content root (`content/`) for a solo corpus. */
  contentPath?: string;
  /**
   * Two or more corpora for a composite session.
   * When set, `contentPath` is ignored (primary is `corpora[0]`).
   */
  corpora?: TomeCorpusConfig[];
}

/**
 * Canonical data store (flatfile today). Owns change notifications.
 * Solo stores expose a single corpus; composites front many.
 */
export interface TomeDataStore {
  /** Primary corpus content root (`content/`). */
  readonly contentDir: string;

  /** Resolve which corpus owns a node id, or null if unknown. */
  locateNode(id: string): string | null;
  /** Configured corpora (one entry for solo). */
  listCorpora(): readonly TomeCorpusInfo[];

  listNodeIds(): string[];
  readNode(id: string): Node | null;
  writeNode(node: Node, body?: string): void;
  deleteNodeFile(id: string): void;
  mergeNodeProperties(id: string, patch: Properties): boolean;

  readRelationshipsFile(): RelationshipsFile;
  writeRelationshipsFile(file: RelationshipsFile): void;
  readAssociationsFile(): AssociationsFile;
  writeAssociationsFile(file: AssociationsFile): void;

  findContentEntry(source: string, target: string, localType: string): RelationshipEntry | null;
  findRelationship(
    source: string,
    target: string,
    localType: string,
  ): {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    type: string;
    properties: Properties;
  } | null;
  upsertRelationship(
    source: string,
    target: string,
    localType: string,
    properties?: Properties,
  ): void;
  mergeRelationshipProperties(
    source: string,
    target: string,
    localType: string,
    patch: Properties,
  ): void;
  replaceRelationshipProperties(
    source: string,
    target: string,
    localType: string,
    properties: Properties,
  ): boolean;
  deleteRelationship(source: string, target: string, localType: string): boolean;
  removeIncidentRelationships(nodeId: string): void;

  readDynamicPropertiesFile(): DynamicPropertiesFile;
  writeDynamicPropertiesFile(file: DynamicPropertiesFile): void;
  readViewsFile(): ViewsFile;
  writeViewsFile(file: ViewsFile): void;
  readTableSchemasFile(): TableSchemasFile;
  writeTableSchemasFile(file: TableSchemasFile): void;
  readWorkspaceFile(): WorkspaceFile;
  writeWorkspaceFile(file: WorkspaceFile): void;

  /** Subscribe to store change events. Returns unsubscribe. */
  subscribe(listener: StoreChangeListener): () => void;
  startWatching(): void;
  stopWatching(): void;
  close(): void;
}

/**
 * Query cache (SQLite today). No content-path coupling.
 */
export interface TomeQueryCache {
  readonly path: string;

  setMeta(key: string, value: string): void;
  getMeta(key: string): string | null;

  upsertNode(id: string, properties?: Properties): void;
  mergeNodeProperties(id: string, properties: Properties): void;
  getNode(id: string): Node | null;
  deleteNode(id: string): boolean;
  isNodeArchived(id: string): boolean;

  clearRelationshipCache(): void;
  upsertRelationshipRecord(record: RelationshipRecordRow): void;
  upsertRelationshipProjection(projection: RelationshipProjectionRow): void;
  upsertRelationship(
    sourceNodeId: string,
    targetNodeId: string,
    type: string,
    properties?: Properties,
  ): void;
  mergeRelationshipProperties(id: string, properties: Properties): void;
  deleteRelationship(sourceNodeId: string, targetNodeId: string, type: string): boolean;
  getRelationshipRecord(id: string): RelationshipRecordRow | null;
  getRelationship(id: string): Relationship | null;

  listArchiveMemberIds(archiveId: string, memberPerspectives?: readonly string[]): string[];
  recomputeArchivedFlags(
    archiveId: string | readonly string[],
    memberPerspectives?: readonly string[],
  ): void;

  counts(): GraphCounts;
  searchNodesByTitle(
    pattern: string,
    limit: number,
    allowedTypeIds?: readonly string[],
  ): { id: string; title: string }[];
  searchNodesByBody(
    pattern: string,
    limit: number,
    allowedTypeIds?: readonly string[],
  ): { id: string; title: string }[];
  listNodesByTitle(
    limit: number,
    allowedTypeIds?: readonly string[],
  ): { id: string; title: string }[];
  listNodesByModifiedAt(
    limit: number,
    allowedTypeIds?: readonly string[],
  ): { id: string; title: string }[];
  listNodesWithBodyLike(pattern: string): { id: string; body: string }[];
  listNodesForGraphExport(): { id: string; title: string }[];
  listRelationshipsForGraphExport(): {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    type: string;
  }[];
  listRelationshipsFromSource(sourceNodeId: string, type?: string): Relationship[];
  listRelationshipsToTarget(targetNodeId: string, type?: string): Relationship[];
  countIncidentRelationships(nodeId: string): number;
  listDistinctRelationshipTypes(): string[];

  queryAll<T extends Record<string, unknown>>(sql: string, ...params: unknown[]): T[];
  runExec(sql: string, ...params: unknown[]): void;
  finalize(): void;
  close(): void;
}

export interface TomeStoreModule {
  readonly id: string;
  open(options?: TomeDataStoreOpenOptions): TomeDataStore;
}

export interface TomeCacheModule {
  readonly id: string;
  open(options?: TomeQueryCacheOpenOptions): TomeQueryCache;
}

export type TomeStoreModuleFactory = () => TomeStoreModule;
export type TomeCacheModuleFactory = () => TomeCacheModule;
