import type { GraphDatabase } from "../graph";
import { nodeRelativePath } from "./paths";
import type { CacheSync } from "./sync";
import type { ContentStore } from "./store";
import { openContentGraph } from "./sync";
import type { Properties } from "../graph";

export interface TomeWriteContext {
  store: ContentStore;
  sync: CacheSync;
  db: GraphDatabase;
}

export function openTomeWriteContext(
  contentDir: string,
  dbPath: string,
): TomeWriteContext {
  return openContentGraph(contentDir, dbPath);
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
