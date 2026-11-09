export type {
  SyncIdSet,
  SyncEntityOps,
  SyncPartialScope,
  SyncScope,
  SyncSourceRead,
  SyncSignal,
  SyncMutationPreview,
  DataStoreKind,
  DataStoreCapabilities,
} from "tome-service-interfaces/sync";
export {
  emptySyncEntityOps,
  emptySyncPartialScope,
  mergeSyncPartialScope,
  isSyncPartialScopeEmpty,
} from "tome-service-interfaces/sync";

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
export type { SyncEndpoint, OpenedSyncStore } from "./registry";

export { syncSourceFromQueryable } from "./source-read";
export { createStubSyncEndpointRecording } from "./stub-endpoint";

export {
  syncScopeForNodeUpsert,
  syncScopeForNodeDelete,
  syncScopeForRelationshipUpsert,
  syncScopeForRelationshipDelete,
} from "./partial-scope";

export { wireSyncGraph, buildDefaultSyncGraph, ensureFtsObserveEdges } from "./wire";
export type { WiredObserveEdge, SyncGraphWireResult, WireSyncGraphOptions } from "./wire";

export { publishMutation, sinkStoreIdsForSource } from "./publish-mutation";
export type { PublishMutationOptions } from "./publish-mutation";
