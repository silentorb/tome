/**
 * Host sync-session entry (`tome-db/sync-session`).
 * Imp sync fabric lives in `tome-mir` — import wire/publish/registry from there.
 */
export {
  createFlatfileSyncEndpoint,
  createSqliteCacheSyncEndpoint,
} from "./adapters";

export { storeChangeEventToSyncScope } from "./scope-from-events";

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
