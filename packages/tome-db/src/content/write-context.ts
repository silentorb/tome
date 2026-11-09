import type { ContentStore, CompositeStore } from "tome-flatfile";
import {
  FlatfileGraphStore,
  bodyFromNode,
  nodeRelativePath,
  RELATIONSHIPS_SYNC_MARKER,
  relationshipRecordId,
} from "tome-flatfile";
import type { RelationshipEntry, TomeQueryCache } from "tome-service-interfaces";
import type { Properties, TomeGraphStoreBase, TomeGraphStoreQueryable } from "tome-graph-interfaces";
import { ComposedGraphStore } from "../graph-store/composed-graph-store";
import {
  CacheSync,
  subscribeStoreToCacheSync,
  type SyncProgressReporter,
} from "./sync";
import type {
  SyncEndpoint,
  SyncMutationPreview,
  SyncScope,
  SyncSourceRead,
  WiredObserveEdge,
} from "tome-mir";
import {
  publishMutation,
  syncScopeForNodeDelete,
  syncScopeForNodeUpsert,
  syncScopeForRelationshipDelete,
  syncScopeForRelationshipUpsert,
  syncSourceFromQueryable,
} from "tome-mir";

/** Solo or composite flatfile store used by domain write/sync paths. */
export type FlatfileStore = ContentStore | CompositeStore;

export type MutationPublisher = {
  /** Primary flatfile corpus storeId for observe-edge sink discovery. */
  defaultStoreId: string;
  edges: readonly WiredObserveEdge[];
  endpoint: (storeId: string) => SyncEndpoint;
  sourceForStore: (storeId: string) => SyncSourceRead;
};

export interface OpenTomeWriteContextOptions {
  graphStore?: TomeGraphStoreQueryable;
  progress?: SyncProgressReporter;
  /**
   * When true, skip `ensureReady()` and store→sync subscription.
   * Caller must `await sync.ensureReady()` then
   * {@link finishDeferredWriteContextReady}.
   */
  deferReady?: boolean;
  /** Imp wire-edge mutation publisher (session open). */
  publisher?: MutationPublisher;
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
  /** Imp-topology mutation fan-out when a sync graph is wired. */
  publisher?: MutationPublisher;
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
      "deferReady" in graphStoreOrOptions ||
      "publisher" in graphStoreOrOptions)
      ? graphStoreOrOptions
      : { graphStore: graphStoreOrOptions as TomeGraphStoreQueryable | undefined };
  const sync = new CacheSync(store, cache, options.progress);
  if (!options.deferReady) {
    await sync.ensureReady();
    subscribeStoreToCacheSync(store, sync);
  }
  const resolvedGraphStore =
    options.graphStore ?? new ComposedGraphStore(new FlatfileGraphStore(store), cache, sync);

  let publisher = options.publisher;
  if (!publisher) {
    // Synthetic single edge so syncAfter* helpers fan out through CacheSync when
    // no Imp wire is present (tests / openTomeWriteContext).
    const fallbackEndpoint: SyncEndpoint = {
      id: "session-cache",
      capabilities: { kind: "sqlite", canBeObserved: false, canObserve: true },
      asSource() {
        throw new Error("fallback cache endpoint is not a sync source");
      },
      async apply(signal) {
        if (signal.scope.mode === "full") {
          await sync.ensureReady();
          return;
        }
        if (signal.scope.mode === "content") {
          await sync.syncFile(signal.scope.relativeName);
          return;
        }
        const { nodes, relationships } = signal.scope.changes;
        for (const id of nodes.deleted) {
          await sync.syncNode(id, { previewProps: null });
        }
        for (const id of [...nodes.created, ...nodes.modified]) {
          const previewProps = signal.preview?.nodes?.[id];
          await sync.syncNode(id, {
            previewProps: previewProps === undefined ? undefined : previewProps,
            corpusId: signal.preview?.nodeCorpusIds?.[id],
          });
        }
        const relTouched =
          relationships.created.length +
            relationships.modified.length +
            relationships.deleted.length >
          0;
        if (relTouched) {
          await sync.syncRelationshipsPartial(
            relationships,
            signal.preview?.relationships,
          );
        }
      },
    };
    publisher = {
      defaultStoreId: "default",
      edges: [
        {
          fromStoreId: "default",
          toStoreId: "session-cache",
          fromNodeId: "src:default",
          toNodeId: "sink:session-cache",
          fromKind: "store",
        },
      ],
      endpoint: () => fallbackEndpoint,
      sourceForStore: () => syncSourceFromQueryable(resolvedGraphStore),
    };
  }

  return {
    graphStore: resolvedGraphStore,
    store,
    sync,
    cache,
    publisher,
  };
}

/** After deferred `ensureReady`, wire store→cache subscriptions. */
export function finishDeferredWriteContextReady(ctx: TomeWriteContext): () => void {
  if (!ctx.store || !ctx.sync) return () => {};
  return subscribeStoreToCacheSync(ctx.store, ctx.sync);
}

/** Apply a sync scope to CacheSync when no Imp publisher is wired (test / openContentGraph). */
async function applyScopeViaCacheSync(
  sync: CacheSync,
  scope: SyncScope,
  preview?: SyncMutationPreview,
): Promise<void> {
  if (scope.mode === "full") {
    await sync.ensureReady();
    return;
  }
  if (scope.mode === "content") {
    await sync.syncFile(scope.relativeName);
    return;
  }
  const { nodes, relationships } = scope.changes;
  for (const id of nodes.deleted) {
    await sync.syncNode(id, { previewProps: null });
  }
  for (const id of [...nodes.created, ...nodes.modified]) {
    const previewProps = preview?.nodes?.[id];
    await sync.syncNode(id, {
      previewProps: previewProps === undefined ? undefined : previewProps,
      corpusId: preview?.nodeCorpusIds?.[id],
    });
  }
  const relTouched =
    relationships.created.length +
      relationships.modified.length +
      relationships.deleted.length >
    0;
  if (relTouched) {
    await sync.syncRelationshipsPartial(relationships, preview?.relationships);
  }
}

export async function publishGraphMutation(
  ctx: TomeWriteContext,
  options: {
    write: () => void | Promise<void>;
    scope: SyncScope;
    preview?: SyncMutationPreview;
    storeId?: string;
    /** Default true; set false to write then apply (e.g. relationship content scopes). */
    parallel?: boolean;
  },
): Promise<void> {
  const publisher = ctx.publisher;
  if (!publisher) {
    if (!ctx.sync) {
      await options.write();
      return;
    }
    const parallel = options.parallel !== false;
    if (!parallel) {
      await options.write();
      await applyScopeViaCacheSync(ctx.sync, options.scope, options.preview);
      return;
    }
    await Promise.all([
      Promise.resolve(options.write()),
      applyScopeViaCacheSync(ctx.sync, options.scope, options.preview),
    ]);
    return;
  }
  const storeId = options.storeId ?? publisher.defaultStoreId;
  await publishMutation({
    storeId,
    write: options.write,
    scope: options.scope,
    preview: options.preview,
    source: publisher.sourceForStore(storeId),
    edges: publisher.edges,
    endpoint: publisher.endpoint,
    parallel: options.parallel,
  });
}

function nodePreviewFromStore(
  ctx: TomeWriteContext,
  id: string,
): SyncMutationPreview | undefined {
  if (!ctx.store) return undefined;
  const node = ctx.store.readNode(id);
  if (!node) {
    return { nodes: { [id]: null } };
  }
  const body = bodyFromNode(node);
  return {
    nodes: { [id]: { ...node.properties, body } },
    nodeCorpusIds: { [id]: ctx.store.locateNode(id) },
  };
}

export async function syncAfterNodeWrite(ctx: TomeWriteContext, id: string): Promise<void> {
  if (ctx.publisher) {
    await publishGraphMutation(ctx, {
      write: async () => {},
      scope: syncScopeForNodeUpsert(id, true),
      preview: nodePreviewFromStore(ctx, id),
    });
    return;
  }
  if (!ctx.sync) return;
  await ctx.sync.syncAfterWrite(nodeRelativePath(id));
}

export async function syncAfterRelationshipsWrite(ctx: TomeWriteContext): Promise<void> {
  if (ctx.publisher) {
    await publishGraphMutation(ctx, {
      write: async () => {},
      scope: { mode: "content", relativeName: RELATIONSHIPS_SYNC_MARKER },
    });
    return;
  }
  if (!ctx.sync) return;
  await ctx.sync.syncAfterWrite(RELATIONSHIPS_SYNC_MARKER);
}

/** Incremental relationship upsert/delete fan-out (preferred over full expand). */
export async function syncAfterRelationshipChange(
  ctx: TomeWriteContext,
  options: {
    write: () => void | Promise<void>;
    a: string;
    b: string;
    /** Composite relationship type id (not a projection `type:0` / `type:1`). */
    type: string;
    /**
     * Canonical `{a}:{b}:{compositeType}` when already known (e.g. from a
     * Relationship.recordId). Prefer this over deriving from `type` when the
     * caller holds a projection-typed Relationship.
     */
    recordId?: string;
    /** When deleting, pass null entry. */
    entry: RelationshipEntry | null;
    existed: boolean;
    storeId?: string;
  },
): Promise<void> {
  const recordId =
    options.recordId ?? relationshipRecordId(options.a, options.b, options.type);
  const scope =
    options.entry == null
      ? syncScopeForRelationshipDelete(recordId)
      : syncScopeForRelationshipUpsert(recordId, options.existed);
  const preview: SyncMutationPreview = {
    relationships: { [recordId]: options.entry },
  };
  await publishGraphMutation(ctx, {
    write: options.write,
    scope,
    preview,
    storeId: options.storeId,
    // Relationship expand/delete must see durable endpoint ordering on disk when
    // previews omit projections; write first, then fan out.
    parallel: false,
  });
}

/** Sync a model/config file when CacheSync is present; no-op otherwise. */
export async function syncFileOnContext(
  ctx: TomeWriteContext,
  relativeName: string,
): Promise<void> {
  if (ctx.publisher) {
    await publishGraphMutation(ctx, {
      write: async () => {},
      scope: { mode: "content", relativeName },
    });
    return;
  }
  if (!ctx.sync) return;
  await ctx.sync.syncFile(relativeName);
}

/** Sync a node into the query cache when CacheSync is present; no-op otherwise. */
export async function syncNodeOnContext(
  ctx: TomeWriteContext,
  id: string,
): Promise<void> {
  if (ctx.publisher) {
    const node = ctx.store?.readNode(id) ?? null;
    await publishGraphMutation(ctx, {
      write: async () => {},
      scope: node ? syncScopeForNodeUpsert(id, true) : syncScopeForNodeDelete(id),
      preview: nodePreviewFromStore(ctx, id),
    });
    return;
  }
  if (!ctx.sync) return;
  await ctx.sync.syncNode(id);
}

/**
 * Merge node properties with parallel Imp fan-out using a preview built from
 * the prior node plus the patch (so sinks need not wait on disk).
 */
export async function mergeNodePropertiesOnContent(
  ctx: TomeWriteContext,
  id: string,
  patch: Properties,
): Promise<boolean> {
  const store = ctx.store;
  if (!store) {
    const ok = await ctx.graphStore.mergeNodeProperties(id, patch);
    if (ok) await syncAfterNodeWrite(ctx, id);
    return ok;
  }
  const prior = store.readNode(id);
  if (!prior) return false;
  const body = bodyFromNode(prior);
  const previewProps = { ...prior.properties, body, ...patch };
  let ok = false;
  const corpusId = store.locateNode(id);
  await publishGraphMutation(ctx, {
    write: async () => {
      ok = await ctx.graphStore.mergeNodeProperties(id, patch);
      if (!ok) throw new Error(`mergeNodeProperties failed for ${id}`);
    },
    scope: syncScopeForNodeUpsert(id, true),
    preview: {
      nodes: { [id]: previewProps },
      nodeCorpusIds: { [id]: corpusId },
    },
  });
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
