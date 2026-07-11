import type { TomeCacheModule } from "tome-service-interfaces";
import { GraphDatabase } from "./graph";

export function createSqliteCacheModule(): TomeCacheModule {
  return {
    id: "tome-cache-sqlite",
    open(options) {
      const dbPath = options?.dbPath;
      if (!dbPath) {
        throw new Error("tome-cache-sqlite open() requires options.dbPath");
      }
      return new GraphDatabase(dbPath, {
        clean: options?.clean,
        propertyCodec: options?.propertyCodec,
        memberPerspectives: options?.memberPerspectives,
      });
    },
  };
}
