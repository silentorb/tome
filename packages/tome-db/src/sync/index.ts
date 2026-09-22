export type {
  SyncIdSet,
  SyncEntityOps,
  SyncPartialScope,
  SyncScope,
  SyncSourceRead,
  SyncSignal,
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

export { wireSyncGraph, buildDefaultSyncGraph } from "./wire";
export type { WiredObserveEdge, SyncGraphWireResult, WireSyncGraphOptions } from "./wire";

export {
  openDataStoreSession,
  unionSyncSource,
  type OpenDataStoreSessionOptions,
  type DataStoreSession,
} from "./open-session";
