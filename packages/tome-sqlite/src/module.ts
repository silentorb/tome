import type { TomeCacheModule } from "tome-service-interfaces";
import {
  configureProfiling,
  ensureProfilingStore,
  resolveProfilingFromEnv,
} from "tome-service-interfaces";
import { openWorkerSqliteCache } from "./async-cache";

export function createSqliteModule(): TomeCacheModule {
  return {
    id: "tome-sqlite",
    async open(options) {
      const dbPath = options?.dbPath;
      if (!dbPath) {
        throw new Error("tome-sqlite open() requires options.dbPath");
      }
      // Apply env early so sync SQL in the worker is covered before HTTP service starts.
      const profilingConfig = resolveProfilingFromEnv();
      configureProfiling(profilingConfig);
      if (profilingConfig.enabled) {
        ensureProfilingStore(dbPath);
      }
      return openWorkerSqliteCache({
        dbPath,
        clean: options?.clean,
        propertyCodec: options?.propertyCodec,
        memberPerspectives: options?.memberPerspectives,
      });
    },
  };
}
