import type { SyncMutationPreview, SyncScope, SyncSourceRead } from "./types";
import type { SyncEndpoint } from "./registry";
import type { WiredObserveEdge } from "./wire";

export type PublishMutationOptions = {
  /** Flatfile corpus storeId whose observe edges define the sink set. */
  storeId: string;
  write: () => void | Promise<void>;
  scope: SyncScope;
  preview?: SyncMutationPreview;
  source: SyncSourceRead;
  /** Observe edges from the wired sync graph. */
  edges: readonly WiredObserveEdge[];
  /** Resolve a sink endpoint by store id. */
  endpoint: (storeId: string) => SyncEndpoint;
  /**
   * When true (default), run write and sink applies concurrently.
   * Set false when apply must observe durable flatfile state (no/partial preview).
   */
  parallel?: boolean;
};

/**
 * Persist the canonical write and apply the same signal to all Imp-wired sinks
 * for `storeId`. Default: write ∥ apply (preview-bearing API path). On write
 * failure after sinks may have applied, heal sinks by re-applying the same
 * scope without preview (pull from durable source).
 */
export async function publishMutation(options: PublishMutationOptions): Promise<void> {
  const sinkIds = [
    ...new Set(
      options.edges
        .filter((e) => e.fromStoreId === options.storeId)
        .map((e) => e.toStoreId),
    ),
  ];
  const sinks = sinkIds.map((id) => options.endpoint(id));
  const signal = {
    source: options.source,
    scope: options.scope,
    preview: options.preview,
  };
  const parallel = options.parallel !== false;

  if (!parallel) {
    await options.write();
    await Promise.all(sinks.map((ep) => Promise.resolve(ep.apply(signal))));
    return;
  }

  let writeFailed = false;
  try {
    await Promise.all([
      Promise.resolve(options.write()).catch((err) => {
        writeFailed = true;
        throw err;
      }),
      ...sinks.map((ep) => Promise.resolve(ep.apply(signal))),
    ]);
  } catch (err) {
    if (writeFailed && sinks.length > 0) {
      const heal = { source: options.source, scope: options.scope };
      await Promise.allSettled(sinks.map((ep) => Promise.resolve(ep.apply(heal))));
    }
    throw err;
  }
}

/** Sinks that observe `storeId` via store or gitWatch observe edges. */
export function sinkStoreIdsForSource(
  edges: readonly WiredObserveEdge[],
  storeId: string,
): string[] {
  return [
    ...new Set(edges.filter((e) => e.fromStoreId === storeId).map((e) => e.toStoreId)),
  ];
}
