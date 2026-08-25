import type { ContentStore, CompositeStore } from "tome-flatfile";
import { FlatfileGraphStore, nodeRelativePath } from "tome-flatfile";
import type { TomeQueryCache } from "tome-service-interfaces";
import type { TomeGraphStoreQueryable } from "tome-graph-interfaces";
import type { GraphDatabase, Properties } from "tome-sqlite";
import { ComposedGraphStore } from "../graph-store/composed-graph-store";
import { CacheSync, subscribeStoreToCacheSync } from "./sync";

/** Solo or composite flatfile store used by domain write/sync paths. */
export type FlatfileStore = ContentStore | CompositeStore;

export interface TomeWriteContext {
  /** Unified graph store facade (Base + Queryable when composed). */
  graphStore: TomeGraphStoreQueryable;
  /** Flatfile backend for sync and legacy callers. */
  store: FlatfileStore;
  sync: CacheSync;
  /** SQLite query cache — prefer graphStore.executeImp for reads. */
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
  const ok = ctx.store.mergeNodeProperties(id, patch);
  if (ok) syncAfterNodeWrite(ctx, id);
  return ok;
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
