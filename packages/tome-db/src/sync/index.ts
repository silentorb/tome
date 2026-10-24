export type {
  SyncIdSet,
  SyncEntityOps,
  SyncPartialScope,
  SyncScope,
  SyncSourceRead,
  SyncSignal,
  SyncMutationPreview,
} from "./types";
export {
  emptySyncEntityOps,
  emptySyncPartialScope,
  mergeSyncPartialScope,
  isSyncPartialScopeEmpty,
} from "./types";

export {
  SYNC_SIGNAL_TYPE_ID,
  SYNC_STORE_NODE_TYPE,
  SYNC_GIT_WATCH_NODE_TYPE,
  SYNC_OBSERVE_OUT_PORT,
  SYNC_OBSERVE_IN_PORT,
  SYNC_STORE_ID_INPUT,
  createTomeSyncNodeLibrary,
  SyncNodeTypeRegistry,
  createDefaultSyncNodeTypeRegistry,
} from "./node-registry";
export type { SyncNodeLibrary } from "./node-registry";

export { DataStoreRegistry } from "./registry";
export type {
  DataStoreKind,
  DataStoreCapabilities,
  SyncEndpoint,
  OpenedDataStore,
} from "./registry";

export {
  syncSourceFromQueryable,
  createFlatfileSyncEndpoint,
  createSqliteCacheSyncEndpoint,
  createStubSyncEndpointRecording,
} from "./adapters";

export {
  storeChangeEventToSyncScope,
  syncScopeForNodeUpsert,
  syncScopeForNodeDelete,
  syncScopeForRelationshipUpsert,
  syncScopeForRelationshipDelete,
} from "./scope-from-events";

export { wireSyncGraph, buildDefaultSyncGraph, ensureFtsObserveEdges } from "./wire";
export type { WiredObserveEdge, SyncGraphWireResult, WireSyncGraphOptions } from "./wire";

export { publishMutation, sinkStoreIdsForSource } from "./publish-mutation";
export type { PublishMutationOptions } from "./publish-mutation";

export {
  createGitWatchSyncEndpoint,
  findGitDir,
  findRepoRoot,
  gitWatchCommitMetaKey,
  gitPathsToSyncScopes,
  resolveGitHead,
  GIT_WATCH_COMMIT_META_PREFIX,
} from "./git-watch";

export {
  openDataStoreSession,
  unionSyncSource,
  type OpenDataStoreSessionOptions,
  type DataStoreSession,
} from "./open-session";
