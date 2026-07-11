import type { ContentStore } from "tome-flatfile";
import { nodeRelativePath } from "tome-flatfile";
import type { TomeQueryCache } from "tome-service-interfaces";
import type { Properties } from "tome-sqlite";
import { CacheSync, subscribeStoreToCacheSync } from "./sync";

export interface TomeWriteContext {
  store: ContentStore;
  sync: CacheSync;
  cache: TomeQueryCache;
}

/**
 * Inject existing store + cache instances, create sync, and wire subscriptions.
 * Prefer {@link openContentGraph} when opening from content/db paths.
 */
export function openTomeWriteContext(
  store: ContentStore,
  cache: TomeQueryCache,
): TomeWriteContext {
  const sync = new CacheSync(store, cache);
  sync.ensureReady();
  subscribeStoreToCacheSync(store, sync);
  return { store, sync, cache };
}

export function syncAfterNodeWrite(ctx: TomeWriteContext, id: string): void {
  ctx.sync.syncAfterWrite(nodeRelativePath(id));
}

export function syncAfterRelationshipsWrite(ctx: TomeWriteContext): void {
  ctx.sync.syncAfterWrite("relationships.json");
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
