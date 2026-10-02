import type {
  Node,
  Properties,
  Relationship,
  RelationshipRecordRef,
  TomeCorpusInfo,
  TomeGraphStoreBase,
  WorkspaceFile,
} from "tome-graph-interfaces";
import {
  connectsEndpoints,
  isSetTraitComposite,
  isSetTraitProjectionType,
  type RelationshipTypesFile,
} from "tome-flatfile";

/** Write store: graph store Base tier for domain mutations. */
export type GraphWriteStore = TomeGraphStoreBase;

export async function writeStoreGetNode(store: GraphWriteStore, id: string): Promise<Node | null> {
  return store.getNode(id);
}

export function writeStoreContentDir(store: GraphWriteStore): string {
  return store.contentDir;
}

export function writeStoreLocateNode(store: GraphWriteStore, id: string): string | null {
  return store.locateNode(id);
}

export function writeStoreListCorpora(store: GraphWriteStore): readonly TomeCorpusInfo[] {
  return store.listCorpora();
}

export async function writeStoreFindRelationship(
  store: GraphWriteStore,
  sourceId: string,
  targetId: string,
  type: string,
): Promise<Relationship | null> {
  return store.findRelationshipRecord(sourceId, targetId, type);
}

export async function writeStoreUpsertRelationship(
  store: GraphWriteStore,
  source: string,
  target: string,
  projectionType: string,
  properties?: Properties,
): Promise<void> {
  await store.upsertRelationship(source, target, projectionType, properties);
}

export async function writeStoreDeleteRelationship(
  store: GraphWriteStore,
  source: string,
  target: string,
  projectionType: string,
): Promise<boolean> {
  return store.deleteRelationship(source, target, projectionType);
}

export async function writeStoreMergeRelationshipProperties(
  store: GraphWriteStore,
  source: string,
  target: string,
  projectionType: string,
  patch: Properties,
): Promise<void> {
  await store.mergeRelationshipProperties(source, target, projectionType, patch);
}

export async function writeStoreReplaceRelationshipProperties(
  store: GraphWriteStore,
  source: string,
  target: string,
  projectionType: string,
  properties: Properties,
): Promise<boolean> {
  return store.replaceRelationshipProperties(source, target, projectionType, properties);
}

/** Scan canonical records for a set-trait edge connecting the same pair. */
export async function writeStoreFindSetTraitRelationship(
  store: GraphWriteStore,
  registry: RelationshipTypesFile,
  sourceId: string,
  targetId: string,
  projectionType: string,
): Promise<Relationship | null> {
  const found = await writeStoreFindRelationship(store, sourceId, targetId, projectionType);
  if (found) return found;
  if (!isSetTraitProjectionType(registry, projectionType)) return null;

  let match: Relationship | null = null;
  await store.forEachRelationshipRecord(async (entry) => {
    if (match) return;
    if (!connectsEndpoints(entry, sourceId, targetId)) return;
    if (!isSetTraitComposite(registry, entry.type)) return;
    match = await writeStoreFindRelationship(store, sourceId, targetId, entry.type);
  });
  return match;
}

export async function writeStoreUpsertNodeToCorpus(
  store: GraphWriteStore,
  corpusId: string,
  node: Node,
  body?: string,
): Promise<void> {
  await store.upsertNodeToCorpus(corpusId, node, body);
}

export async function writeStoreWriteWorkspaceForCorpus(
  store: GraphWriteStore,
  corpusId: string,
  file: WorkspaceFile,
): Promise<void> {
  await store.writeWorkspaceForCorpus(corpusId, file);
}

export async function writeStoreForEachRelationshipRecord(
  store: GraphWriteStore,
  fn: (entry: RelationshipRecordRef) => void | Promise<void>,
): Promise<void> {
  await store.forEachRelationshipRecord(fn);
}
