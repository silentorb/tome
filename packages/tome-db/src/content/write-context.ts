import type { ContentStore, CompositeStore } from "tome-flatfile";
import { FlatfileGraphStore, nodeRelativePath } from "tome-flatfile";
import type { TomeQueryCache } from "tome-service-interfaces";
import type { Properties, TomeGraphStoreBase, TomeGraphStoreQueryable } from "tome-graph-interfaces";
import { ComposedGraphStore } from "../graph-store/composed-graph-store";
import {
  CacheSync,
  subscribeStoreToCacheSync,
  type SyncProgressReporter,
} from "./sync";

/** Solo or composite flatfile store used by domain write/sync paths. */
export type FlatfileStore = ContentStore | CompositeStore;

export interface OpenTomeWriteContextOptions {
  graphStore?: TomeGraphStoreQueryable;
  progress?: SyncProgressReporter;
  /**
   * When true, skip `ensureReady()` and store→sync subscription.
   * Caller must `await sync.ensureReady()` then
   * {@link finishDeferredWriteContextReady}.
   */
  deferReady?: boolean;
}

export interface TomeWriteContext {
  /** Unified graph store facade (Base + Queryable when composed). */
  graphStore: TomeGraphStoreQueryable;
  /**
   * Flatfile backend when a CacheSync / file-SoT topology is active.
   * Absent for Queryable SoT-only sessions (e.g. Postgres).
   */
  store?: FlatfileStore;
  /**
   * CacheSync when flatfile sources observe a query sink.
   * Absent for SoT-only sessions — sync helpers no-op.
   */
  sync?: CacheSync;
  /** Query cache / thin SQL surface (executeImp, product windows, auth SQL). */
  cache: TomeQueryCache;
}

/**
 * Inject existing store + cache instances, create sync, and wire subscriptions.
 * Prefer {@link openContentGraph} or {@link openComposedGraphStore} when opening from paths.
 */
export async function openTomeWriteContext(
  store: FlatfileStore,
  cache: TomeQueryCache,
  graphStoreOrOptions?: TomeGraphStoreQueryable | OpenTomeWriteContextOptions,
): Promise<TomeWriteContext> {
  const options: OpenTomeWriteContextOptions =
    graphStoreOrOptions &&
    typeof graphStoreOrOptions === "object" &&
    ("progress" in graphStoreOrOptions ||
      "graphStore" in graphStoreOrOptions ||
      "deferReady" in graphStoreOrOptions)
      ? graphStoreOrOptions
      : { graphStore: graphStoreOrOptions as TomeGraphStoreQueryable | undefined };
  const sync = new CacheSync(store, cache, options.progress);
  if (!options.deferReady) {
    await sync.ensureReady();
    subscribeStoreToCacheSync(store, sync);
  }
  const resolvedGraphStore =
    options.graphStore ?? new ComposedGraphStore(new FlatfileGraphStore(store), cache, sync);
  return { graphStore: resolvedGraphStore, store, sync, cache };
}

/** After deferred `ensureReady`, wire store→cache subscriptions. */
export function finishDeferredWriteContextReady(ctx: TomeWriteContext): () => void {
  if (!ctx.store || !ctx.sync) return () => {};
  return subscribeStoreToCacheSync(ctx.store, ctx.sync);
}

export async function syncAfterNodeWrite(ctx: TomeWriteContext, id: string): Promise<void> {
  if (!ctx.sync) return;
  await ctx.sync.syncAfterWrite(nodeRelativePath(id));
}

export async function syncAfterRelationshipsWrite(ctx: TomeWriteContext): Promise<void> {
  if (!ctx.sync) return;
  await ctx.sync.syncAfterWrite("relationships");
}

/** Sync a model/config file when CacheSync is present; no-op otherwise. */
export async function syncFileOnContext(
  ctx: TomeWriteContext,
  relativeName: string,
): Promise<void> {
  if (!ctx.sync) return;
  await ctx.sync.syncFile(relativeName);
}

/** Sync a node into the query cache when CacheSync is present; no-op otherwise. */
export async function syncNodeOnContext(
  ctx: TomeWriteContext,
  id: string,
): Promise<void> {
  if (!ctx.sync) return;
  await ctx.sync.syncNode(id);
}

export async function mergeNodePropertiesOnContent(
  ctx: TomeWriteContext,
  id: string,
  patch: Properties,
): Promise<boolean> {
  const ok = await ctx.graphStore.mergeNodeProperties(id, patch);
  if (ok) await syncAfterNodeWrite(ctx, id);
  return ok;
}

/** Flatfile store behind graphStore — for archive relationship moves not yet on Base tier. */
export function flatfileBackendFromContext(ctx: TomeWriteContext): FlatfileStore {
  const gs = ctx.graphStore;
  if (gs instanceof ComposedGraphStore) return gs.flatfileBackend;
  if (gs instanceof FlatfileGraphStore) return gs.backend;
  if (ctx.store) return ctx.store;
  throw new Error(
    "flatfileBackendFromContext: no flatfile store (Queryable SoT-only session)",
  );
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
