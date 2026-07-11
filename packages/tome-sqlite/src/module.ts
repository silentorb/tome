import type { TomeCacheModule } from "tome-service-interfaces";
import { GraphDatabase } from "./graph";

export function createSqliteModule(): TomeCacheModule {
  return {
    id: "tome-sqlite",
    open(options) {
      const dbPath = options?.dbPath;
      if (!dbPath) {
        throw new Error("tome-sqlite open() requires options.dbPath");
      }
      return new GraphDatabase(dbPath, {
        clean: options?.clean,
        propertyCodec: options?.propertyCodec,
        memberPerspectives: options?.memberPerspectives,
      });
    },
  };
}
