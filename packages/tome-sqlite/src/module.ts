import type { TomeCacheModule } from "tome-service-interfaces";
import { configureProfiler, resolveProfilerFromEnv } from "tome-service-interfaces";
import { GraphDatabase } from "./graph";

export function createSqliteModule(): TomeCacheModule {
  return {
    id: "tome-sqlite",
    open(options) {
      const dbPath = options?.dbPath;
      if (!dbPath) {
        throw new Error("tome-sqlite open() requires options.dbPath");
      }
      // Apply env early so sync SQL is covered before HTTP service starts.
      configureProfiler(resolveProfilerFromEnv());
      return new GraphDatabase(dbPath, {
        clean: options?.clean,
        propertyCodec: options?.propertyCodec,
        memberPerspectives: options?.memberPerspectives,
      });
    },
  };
}
