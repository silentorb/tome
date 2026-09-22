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
 * Public cache-sync readiness for HTTP health / gated routes during startup.
 * Populated from tome-db `CacheSync` progress events.
 */
export type CacheSyncPublicStatus = {
  ready: boolean;
  syncing: boolean;
  phase?: string;
  /** 0..1 when current+total are known. */
  progress?: number;
  current?: number;
  total?: number;
  message?: string;
};

/**
 * Host context passed into a service module when the server starts it.
 * `services` is the domain facade (`TomeGraphServices`), not a service module.
 */
export interface TomeServiceHost {
  services: TomeGraphServices;
  options: TomeServiceModuleOptions;
  /** Present while startup cache sync may still be running. */
  getCacheSyncStatus?: () => CacheSyncPublicStatus;
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
  /**
   * Heterogeneous data stores keyed by id (flatfile corpora, sqlite cache, …).
   * Preferred over singular `store` / `cache`.
   */
  dataStores?: Record<string, TomeServerModuleConfigEntry>;
  /**
   * Sync wiring: Imp graph + optional query store id and node libraries.
   * When omitted with dataStores, host synthesizes flatfile→sqlite observe edges.
   */
  sync?: {
    graph?: unknown;
    queryStoreId?: string;
    libraries?: TomeServerModuleConfigEntry[];
  };
  /**
   * @deprecated Prefer `dataStores`. Still accepted; migrated at parse time.
   */
  store?: TomeServerModuleConfigEntry;
  /**
   * @deprecated Prefer `dataStores`. Still accepted; migrated at parse time.
   */
  cache?: TomeServerModuleConfigEntry;
  /** Zero or more protocol adapters (e.g. HTTP). */
  services: TomeServerModuleConfigEntry[];
}

/** Normalized host config after legacy migrate. */
export interface NormalizedTomeServerConfig {
  version: number;
  dataStores: Record<string, TomeServerModuleConfigEntry>;
  sync: {
    graph?: unknown;
    queryStoreId?: string;
    libraries?: TomeServerModuleConfigEntry[];
  };
  services: TomeServerModuleConfigEntry[];
  /** Convenience: primary flatfile module entry (first flatfile in dataStores). */
  store: TomeServerModuleConfigEntry;
  /** Convenience: sqlite module entry. */
  cache: TomeServerModuleConfigEntry;
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

/** Sort key for {@link TomeQueryCache.listRelationshipsFromSourceWindow}. */
export interface RelationshipProjectionWindowSort {
  column: string;
  direction: "asc" | "desc";
}

/** Window + sort for outgoing projection listing (SQL ORDER BY / LIMIT / OFFSET). */
export interface RelationshipProjectionWindowQuery {
  sorts?: RelationshipProjectionWindowSort[];
  /** Omit or null → return the full ordered set (static export). */
  limit?: number | null;
  offset?: number;
}

export interface RelationshipProjectionWindowResult {
  relationships: Relationship[];
  total: number;
}

/** One set-trait composite's directed projections for membership listing. */
export interface SetMemberProjectionPair {
  setProjection: string;
  memberProjection: string;
}

/** Sort key for {@link TomeQueryCache.listSetMemberRowConnectionsWindow}. */
export interface SetMemberWindowSort {
  column: string;
  direction: "asc" | "desc";
}

/**
 * Relation-count ORDER BY: count outgoing projections of these types from the member.
 * Include both symmetric endpoints when the association is symmetric.
 */
export interface SetMemberRelationCountSort {
  column: string;
  projectionTypes: string[];
}

/** Window + sort for type-table set membership (SQL ORDER BY / LIMIT / OFFSET). */
export interface SetMemberWindowQuery {
  projections: SetMemberProjectionPair[];
  sorts?: SetMemberWindowSort[];
  /** Relation column → projection types for COUNT ORDER BY. */
  relationCounts?: SetMemberRelationCountSort[];
  /** When true and sorts empty, default ORDER BY edge `order` then member title. */
  defaultOrdered?: boolean;
  /** Omit or null → return the full ordered set (static export). */
  limit?: number | null;
  offset?: number;
}

export interface SetMemberWindowResult {
  /** Membership edges normalized with member as `sourceNodeId` and set as `targetNodeId`. */
  relationships: Relationship[];
  total: number;
}

/** Scope discovery among set members (composed table tabs). */
export interface DistinctSetMemberScopeQuery {
  projections: SetMemberProjectionPair[];
  /** Directed projection type from member → scope. */
  scopeProjectionType: string;
  /**
   * Member-side projection types used on scope nodes for ordered-set membership sort
   * (same role as JS `scopeMembershipSortKey`).
   */
  scopeOrderProjectionTypes?: string[];
}

export interface DistinctSetMemberScopeRow {
  id: string;
  title: string;
  sortKey: number;
}

/** Optional scope filter for composed membership windows. */
export interface ComposedMemberScopeFilter {
  projectionType: string;
  scopeNodeId: string;
}

/** Optional groups join / ORDER BY for composed membership windows. */
export interface ComposedMemberGroupsQuery {
  /** Directed projection type from member → group. */
  memberToGroupProjectionType: string;
  /** Group type-table id (set node for group headers). */
  groupTypeDatabaseId: string;
  /** Set-trait pairs for the group type table (membership edges). */
  groupSetProjections: SetMemberProjectionPair[];
  /** When set with scopeNodeId, only groups linked to that scope. */
  groupToScopeProjectionType?: string;
  scopeNodeId?: string;
  /** Remap duplicate group nodes by title within the scoped header set (default true). */
  canonicalGroupByTitle?: boolean;
}

/** Window + scope/group for composed / generated table presentations. */
export interface ComposedMemberWindowQuery {
  projections: SetMemberProjectionPair[];
  scope?: ComposedMemberScopeFilter;
  groups?: ComposedMemberGroupsQuery;
  /** When true, ORDER BY membership `order` (within group when groups set). */
  defaultOrdered?: boolean;
  /** Omit or null → return the full ordered set (static export). */
  limit?: number | null;
  offset?: number;
}

export interface ComposedMemberWindowResult {
  /** Membership edges normalized with member as `sourceNodeId` and set as `targetNodeId`. */
  relationships: Relationship[];
  /**
   * Parallel to `relationships`: resolved group id, or `null` for unassigned.
   * Empty array when `groups` was not requested.
   */
  groupIds: (string | null)[];
  total: number;
}

/** Group headers for a composed presentation (optional scope filter). */
export interface ComposedGroupHeadersQuery {
  groupTypeDatabaseId: string;
  groupSetProjections: SetMemberProjectionPair[];
  groupToScopeProjectionType?: string;
  scopeNodeId?: string;
}

export interface ComposedGroupHeaderRow {
  id: string;
  title: string;
  sortKey: number;
}

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
  /** Distinct node ids that participate in projections of the given type. */
  listNodeIdsForProjectionType(projectionType: string): string[];
  /** Distinct source node ids for projections of the given type. */
  listSourceNodeIdsForProjectionType(projectionType: string): string[];
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
  /**
   * Distinct projection `type` values for outgoing edges from `sourceNodeId`.
   * Used to discover relation sections without loading every projection row.
   */
  listOutgoingProjectionTypes(sourceNodeId: string): string[];
  /**
   * Distinct EAV property keys (plus promoted cell keys such as `priority` when set)
   * on outgoing projections of `type` from `sourceNodeId`.
   */
  listOutgoingProjectionPropertyKeys(sourceNodeId: string, type: string): string[];
  /**
   * Ordered window of outgoing projections for one type. Sort/limit/offset run in SQL.
   * `total` is the full matching count (before limit/offset).
   */
  listRelationshipsFromSourceWindow(
    sourceNodeId: string,
    type: string,
    query?: RelationshipProjectionWindowQuery,
  ): RelationshipProjectionWindowResult;
  /**
   * Ordered window of set membership edges for a type table.
   * Sort/limit/offset run in SQL. `total` is the full member count (before limit/offset).
   * Returned relationships are normalized (member as source, set as target).
   */
  listSetMemberRowConnectionsWindow(
    setId: string,
    query: SetMemberWindowQuery,
  ): SetMemberWindowResult;
  /**
   * Distinct scope node ids among set members (composed scope tabs).
   * Ordered by optional scope membership `order`, then title.
   */
  listDistinctSetMemberScopeIds(
    setId: string,
    query: DistinctSetMemberScopeQuery,
  ): DistinctSetMemberScopeRow[];
  /**
   * Ordered window of set members for a composed presentation.
   * Optional scope filter + group join/order run in SQL.
   */
  listComposedSetMemberRowConnectionsWindow(
    setId: string,
    query: ComposedMemberWindowQuery,
  ): ComposedMemberWindowResult;
  /** Group-type members for composed group headers (optional scope filter). */
  listComposedGroupHeaders(query: ComposedGroupHeadersQuery): ComposedGroupHeaderRow[];
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

export {
  BYTES_PER_SAMPLE_EST,
  DEFAULT_BATCH_DELETE_MB,
  DEFAULT_MAX_MB,
  DEFAULT_SLOW_MS,
  ProfilingStore,
  PROFILING_DB_FILENAME,
  SQL_TRUNCATE,
  configureProfiling,
  deriveRowCaps,
  ensureProfilingStore,
  getProfilingConfig,
  getProfilingStore,
  isProfilingEnabled,
  mbToRows,
  openProfilingStore,
  recordProfilingSample,
  resetProfilingForTests,
  resolveProfilingDbPath,
  resolveProfilingFromEnv,
  setProfilingStore,
  truncateSql,
  type ProfilingConfig,
  type ProfilingSample,
  type ProfilingSampleKind,
} from "./profiling";
