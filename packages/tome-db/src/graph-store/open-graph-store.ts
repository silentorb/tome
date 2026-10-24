import { ContentStore, loadSchemaFromContent, loadRelationshipTypesFromContent, setTraitProjectionTypes } from "tome-flatfile";
import { GraphDatabase, wrapSyncGraphDatabase } from "tome-sqlite";
import { decodeEnumProperties, encodeEnumProperties } from "../enum-codec";
import type { TomeWriteContext } from "../content/write-context";
import { openTomeWriteContext } from "../content/write-context";
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
  const db = new GraphDatabase(dbPath, {
    propertyCodec: {
      encode: (properties) => encodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
      decode: (properties) => decodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
    },
    memberPerspectives: () =>
      setTraitProjectionTypes(loadRelationshipTypesFromContent(contentDir)),
  });
  const cache = wrapSyncGraphDatabase(db);
  const writeContext = await openTomeWriteContext(flatfileBackend, cache, {
    deferReady: options?.deferReady,
  });
  const graphStore = writeContext.graphStore;
  if (!(graphStore instanceof ComposedGraphStore)) {
    throw new Error("openComposedGraphStore: expected ComposedGraphStore");
  }
  return { graphStore, writeContext };
}
