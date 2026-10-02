import { ContentStore, loadSchemaFromContent, loadRelationshipTypesFromContent, setTraitProjectionTypes } from "tome-flatfile";
import { FlatfileGraphStore } from "tome-flatfile";
import { GraphDatabase, wrapSyncGraphDatabase } from "tome-sqlite";
import { decodeEnumProperties, encodeEnumProperties } from "../enum-codec";
import {
  CacheSync,
  subscribeStoreToCacheSync,
} from "../content/sync";
import type { TomeWriteContext } from "../content/write-context";
import { ComposedGraphStore } from "./composed-graph-store";

/** Open composed graph store + write context (flatfile + SQLite + sync). */
export async function openComposedGraphStore(
  contentDir: string,
  dbPath: string,
  options?: { deferReady?: boolean },
): Promise<{
  graphStore: ComposedGraphStore;
  writeContext: TomeWriteContext;
}> {
  const flatfileBackend = new ContentStore(contentDir);
  const flatfile = new FlatfileGraphStore(flatfileBackend);
  const db = new GraphDatabase(dbPath, {
    propertyCodec: {
      encode: (properties) => encodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
      decode: (properties) => decodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
    },
    memberPerspectives: () =>
      setTraitProjectionTypes(loadRelationshipTypesFromContent(contentDir)),
  });
  const cache = wrapSyncGraphDatabase(db);
  const sync = new CacheSync(flatfileBackend, cache);
  if (!options?.deferReady) {
    await sync.ensureReady();
    subscribeStoreToCacheSync(flatfileBackend, sync);
  }
  const graphStore = new ComposedGraphStore(flatfile, cache, sync);
  return {
    graphStore,
    writeContext: {
      graphStore,
      store: flatfileBackend,
      sync,
      cache,
    },
  };
}
