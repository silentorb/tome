import { ContentStore, loadSchemaFromContent, loadAssociationsFromContent, setTraitProjectionTypes } from "tome-flatfile";
import { FlatfileGraphStore } from "tome-flatfile";
import { GraphDatabase } from "tome-sqlite";
import { decodeEnumProperties, encodeEnumProperties } from "../enum-codec";
import {
  CacheSync,
  subscribeStoreToCacheSync,
} from "../content/sync";
import type { TomeWriteContext } from "../content/write-context";
import { ComposedGraphStore } from "./composed-graph-store";

/** Open composed graph store + write context (flatfile + SQLite + sync). */
export function openComposedGraphStore(contentDir: string, dbPath: string): {
  graphStore: ComposedGraphStore;
  writeContext: TomeWriteContext;
} {
  const flatfileBackend = new ContentStore(contentDir);
  const flatfile = new FlatfileGraphStore(flatfileBackend);
  const cache = new GraphDatabase(dbPath, {
    propertyCodec: {
      encode: (properties) => encodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
      decode: (properties) => decodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
    },
    memberPerspectives: () =>
      setTraitProjectionTypes(loadAssociationsFromContent(contentDir)),
  });
  const sync = new CacheSync(flatfileBackend, cache);
  sync.ensureReady();
  subscribeStoreToCacheSync(flatfileBackend, sync);
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
