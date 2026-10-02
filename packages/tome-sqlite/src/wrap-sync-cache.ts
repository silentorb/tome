import type {
  RelationshipPropertyCodec,
  TomeQueryCache,
  TomeQueryCacheOpenOptions,
} from "tome-service-interfaces";
import { GraphDatabase } from "./graph";

/**
 * In-process async adapter over sync {@link GraphDatabase}.
 * Still blocks the event loop during SQL — use {@link openWorkerSqliteCache} for production.
 * `GraphDatabase` already applies `propertyCodec` / `memberPerspectives` from its constructor.
 */
export function wrapSyncGraphDatabase(db: GraphDatabase): TomeQueryCache {
  let exclusive: Promise<unknown> = Promise.resolve();

  const invoke = (method: string, args: unknown[]): unknown => {
    const fn = (db as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
    if (typeof fn !== "function") {
      throw new Error(`GraphDatabase has no method ${method}`);
    }
    return fn.apply(db, args);
  };

  const cache = new Proxy({} as TomeQueryCache, {
    get(_target, prop) {
      if (prop === "path") return db.path;
      if (prop === "then") return undefined;
      if (prop === "transaction") {
        return <T,>(fn: (c: TomeQueryCache) => Promise<T>): Promise<T> => {
          const run = exclusive.then(() => fn(cache));
          exclusive = run.then(
            () => undefined,
            () => undefined,
          );
          return run;
        };
      }
      if (typeof prop === "symbol") return undefined;
      const method = String(prop);
      const fn = (db as unknown as Record<string, unknown>)[method];
      if (typeof fn !== "function") return undefined;
      return (...args: unknown[]) => Promise.resolve().then(() => invoke(method, args));
    },
    has(_target, prop) {
      if (prop === "path" || prop === "transaction") return true;
      if (typeof prop === "symbol") return false;
      return typeof (db as unknown as Record<string, unknown>)[String(prop)] === "function";
    },
  });

  return cache;
}

/** Open an in-process async cache (blocks event loop during SQL). */
export function openInProcessAsyncSqliteCache(
  options: TomeQueryCacheOpenOptions & { dbPath: string },
): TomeQueryCache {
  const db = new GraphDatabase(options.dbPath, {
    clean: options.clean,
    propertyCodec: options.propertyCodec,
    memberPerspectives: options.memberPerspectives,
  });
  return wrapSyncGraphDatabase(db);
}

export type { RelationshipPropertyCodec };
