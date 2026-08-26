import type { ContentStore, CompositeStore } from "tome-flatfile";
import { FlatfileGraphStore, nodeRelativePath } from "tome-flatfile";
import type { TomeQueryCache } from "tome-service-interfaces";
import type { TomeGraphStoreBase, TomeGraphStoreQueryable } from "tome-graph-interfaces";
import type { GraphDatabase, Properties } from "tome-sqlite";
import { ComposedGraphStore } from "../graph-store/composed-graph-store";
import { CacheSync, subscribeStoreToCacheSync } from "./sync";

/** Solo or composite flatfile store used by domain write/sync paths. */
export type FlatfileStore = ContentStore | CompositeStore;

export interface TomeWriteContext {
  /** Unified graph store facade (Base + Queryable when composed). */
  graphStore: TomeGraphStoreQueryable;
  /** Flatfile backend for sync subscription wiring only — prefer graphStore for reads/writes. */
  store: FlatfileStore;
  sync: CacheSync;
  /** SQLite query cache — executeImp SQL backend and CacheSync target only. */
  cache: TomeQueryCache;
}

/**
 * Inject existing store + cache instances, create sync, and wire subscriptions.
 * Prefer {@link openContentGraph} or {@link openComposedGraphStore} when opening from paths.
 */
export function openTomeWriteContext(
  store: FlatfileStore,
  cache: TomeQueryCache,
  graphStore?: TomeGraphStoreQueryable,
): TomeWriteContext {
  const sync = new CacheSync(store, cache);
  sync.ensureReady();
  subscribeStoreToCacheSync(store, sync);
  const resolvedGraphStore =
    graphStore ??
    new ComposedGraphStore(new FlatfileGraphStore(store), cache as GraphDatabase, sync);
  return { graphStore: resolvedGraphStore, store, sync, cache };
}

export function syncAfterNodeWrite(ctx: TomeWriteContext, id: string): void {
  ctx.sync.syncAfterWrite(nodeRelativePath(id));
}

export function syncAfterRelationshipsWrite(ctx: TomeWriteContext): void {
  ctx.sync.syncAfterWrite("relationships");
}

export function mergeNodePropertiesOnContent(
  ctx: TomeWriteContext,
  id: string,
  patch: Properties,
): boolean {
  const ok = ctx.graphStore.mergeNodeProperties(id, patch);
  if (ok) syncAfterNodeWrite(ctx, id);
  return ok;
}

/** Flatfile store behind graphStore — for archive relationship moves not yet on Base tier. */
export function flatfileBackendFromContext(ctx: TomeWriteContext): FlatfileStore {
  const gs = ctx.graphStore;
  if (gs instanceof ComposedGraphStore) return gs.flatfileBackend;
  if (gs instanceof FlatfileGraphStore) return gs.backend;
  return ctx.store;
}

/** Content root for the corpus that owns `nodeId`, else primary. */
export function contentDirForGraphStore(store: TomeGraphStoreBase, nodeId: string): string {
  return store.contentDirForNode(nodeId);
}

/** Primary / first-listed corpus id. */
export function primaryCorpusIdFromGraphStore(store: TomeGraphStoreBase): string {
  return store.listCorpora()[0]?.id ?? "default";
}

/** Content root for the corpus that owns `nodeId`, else primary. */
export function contentDirForNode(store: FlatfileStore, nodeId: string): string {
  const corpusId = store.locateNode(nodeId);
  if (!corpusId) return store.contentDir;
  const match = store.listCorpora().find((c) => c.id === corpusId);
  return match?.contentDir ?? store.contentDir;
}

/** Primary / first-listed corpus id. */
export function primaryCorpusId(store: FlatfileStore): string {
  return store.listCorpora()[0]?.id ?? "default";
}
