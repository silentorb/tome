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
  type AssociationsFile,
} from "tome-flatfile";

/** Write store: graph store Base tier for domain mutations. */
export type GraphWriteStore = TomeGraphStoreBase;

export function writeStoreGetNode(store: GraphWriteStore, id: string): Node | null {
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

export function writeStoreFindRelationship(
  store: GraphWriteStore,
  sourceId: string,
  targetId: string,
  type: string,
): Relationship | null {
  return store.findRelationshipRecord(sourceId, targetId, type);
}

export function writeStoreUpsertRelationship(
  store: GraphWriteStore,
  source: string,
  target: string,
  projectionType: string,
  properties?: Properties,
): void {
  store.upsertRelationship(source, target, projectionType, properties);
}

export function writeStoreDeleteRelationship(
  store: GraphWriteStore,
  source: string,
  target: string,
  projectionType: string,
): boolean {
  return store.deleteRelationship(source, target, projectionType);
}

export function writeStoreMergeRelationshipProperties(
  store: GraphWriteStore,
  source: string,
  target: string,
  projectionType: string,
  patch: Properties,
): void {
  store.mergeRelationshipProperties(source, target, projectionType, patch);
}

export function writeStoreReplaceRelationshipProperties(
  store: GraphWriteStore,
  source: string,
  target: string,
  projectionType: string,
  properties: Properties,
): boolean {
  return store.replaceRelationshipProperties(source, target, projectionType, properties);
}

/** Scan canonical records for a set-trait edge connecting the same pair. */
export function writeStoreFindSetTraitRelationship(
  store: GraphWriteStore,
  registry: AssociationsFile,
  sourceId: string,
  targetId: string,
  projectionType: string,
): Relationship | null {
  const found = writeStoreFindRelationship(store, sourceId, targetId, projectionType);
  if (found) return found;
  if (!isSetTraitProjectionType(registry, projectionType)) return null;

  let match: Relationship | null = null;
  store.forEachRelationshipRecord((entry) => {
    if (match) return;
    if (!connectsEndpoints(entry, sourceId, targetId)) return;
    if (!isSetTraitComposite(registry, entry.type)) return;
    match = writeStoreFindRelationship(store, sourceId, targetId, entry.type);
  });
  return match;
}

export function writeStoreUpsertNodeToCorpus(
  store: GraphWriteStore,
  corpusId: string,
  node: Node,
  body?: string,
): void {
  store.upsertNodeToCorpus(corpusId, node, body);
}

export function writeStoreWriteWorkspaceForCorpus(
  store: GraphWriteStore,
  corpusId: string,
  file: WorkspaceFile,
): void {
  store.writeWorkspaceForCorpus(corpusId, file);
}

export function writeStoreForEachRelationshipRecord(
  store: GraphWriteStore,
  fn: (entry: RelationshipRecordRef) => void,
): void {
  store.forEachRelationshipRecord(fn);
}
