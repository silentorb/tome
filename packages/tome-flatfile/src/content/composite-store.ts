import { resolve } from "node:path";
import type { Node, Properties } from "tome-graph-interfaces";
import type {
  CorpusAccess,
  DynamicPropertiesFile,
  RelationshipEntry,
  RelationshipsFile,
  StoreChangeListener,
  TableSchemasFile,
  TomeCorpusConfig,
  TomeCorpusInfo,
  TomeDataStore,
  ViewsFile,
} from "tome-service-interfaces";
import type { WorkspaceFile } from "../workspace/workspace-file";
import { RELATIONSHIPS_FILE_VERSION, relationshipRecordId } from "./relationships-file";
import {
  emptyAssociationsFile,
  normalizeAssociationId,
  type AssociationsFile,
} from "./associations-file";
import { emptyDynamicPropertiesFile } from "./dynamic-properties-file";
import { emptyViewsFile } from "./views-file";
import { emptyTableSchemasFile } from "./table-schemas-file";
import { ContentStore } from "./store";

export class CorpusReadonlyError extends Error {
  readonly code = "corpus_readonly" as const;
  readonly corpusId: string;

  constructor(corpusId: string, action = "write") {
    super(`Corpus "${corpusId}" is readonly; cannot ${action}`);
    this.name = "CorpusReadonlyError";
    this.corpusId = corpusId;
  }
}

export class CorpusConflictError extends Error {
  readonly code = "corpus_conflict" as const;

  constructor(message: string) {
    super(message);
    this.name = "CorpusConflictError";
  }
}

function stablePropsKey(properties: Properties | undefined): string {
  const props = properties ?? {};
  const keys = Object.keys(props).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    normalized[key] = props[key];
  }
  return JSON.stringify(normalized);
}

function relationshipIdentity(entry: RelationshipEntry): string {
  return relationshipRecordId(entry.a, entry.b, entry.type);
}

function accessOf(config: TomeCorpusConfig): CorpusAccess {
  return config.access === "readonly" ? "readonly" : "readwrite";
}

/**
 * Flatfile store that unions multiple content roots behind one `TomeDataStore`.
 * Node writes go to the owning corpus; cross-corpus edges dual-write identical files.
 */
export class CompositeStore implements TomeDataStore {
  readonly contentDir: string;
  private readonly stores: ContentStore[];
  private readonly byId = new Map<string, ContentStore>();
  private readonly nodeRoute = new Map<string, string>();
  private readonly unsubscribes: Array<() => void> = [];
  private closed = false;

  constructor(corpora: readonly TomeCorpusConfig[], options?: { onWatchError?: (err: Error) => void }) {
    if (corpora.length < 2) {
      throw new Error("CompositeStore requires at least two corpora");
    }
    const seenIds = new Set<string>();
    this.stores = corpora.map((entry) => {
      const id = entry.id.trim();
      if (!id) throw new Error("Corpus id must be non-empty");
      if (seenIds.has(id)) {
        throw new CorpusConflictError(`Duplicate corpus id "${id}"`);
      }
      seenIds.add(id);
      const contentPath = resolve(entry.contentPath);
      return new ContentStore(contentPath, {
        corpusId: id,
        access: accessOf(entry),
        onWatchError: options?.onWatchError,
      });
    });
    for (const store of this.stores) {
      this.byId.set(store.corpusId, store);
    }
    this.contentDir = this.stores[0]!.contentDir;
    this.rebuildRoutingMap();
    this.validateModelUnions();
    this.healOrValidateCrossEdges();
  }

  private rebuildRoutingMap(): void {
    this.nodeRoute.clear();
    for (const store of this.stores) {
      for (const id of store.listNodeIds()) {
        const existing = this.nodeRoute.get(id);
        if (existing && existing !== store.corpusId) {
          throw new CorpusConflictError(
            `Duplicate node id "${id}" in corpora "${existing}" and "${store.corpusId}"`,
          );
        }
        this.nodeRoute.set(id, store.corpusId);
      }
    }
  }

  private validateModelUnions(): void {
    const seenAssociations = new Map<string, { corpusId: string; def: string }>();
    for (const store of this.stores) {
      const file = store.readAssociationsFile();
      for (const [assocId, def] of Object.entries(file.associations)) {
        const serialized = JSON.stringify(def);
        const prior = seenAssociations.get(assocId);
        if (prior && prior.def !== serialized) {
          throw new CorpusConflictError(
            `Association "${assocId}" differs between corpora "${prior.corpusId}" and "${store.corpusId}"`,
          );
        }
        seenAssociations.set(assocId, { corpusId: store.corpusId, def: serialized });
      }
    }
  }

  private healOrValidateCrossEdges(): void {
    type Seen = { entry: RelationshipEntry; corpora: Set<string> };
    const byIdentity = new Map<string, Seen>();

    for (const store of this.stores) {
      for (const entry of store.readRelationshipsFile().relationships) {
        const aCorpus = this.nodeRoute.get(entry.a);
        const bCorpus = this.nodeRoute.get(entry.b);
        if (!aCorpus || !bCorpus || aCorpus === bCorpus) continue;
        const id = relationshipIdentity(entry);
        const prior = byIdentity.get(id);
        if (!prior) {
          byIdentity.set(id, { entry, corpora: new Set([store.corpusId]) });
          continue;
        }
        if (stablePropsKey(prior.entry.properties) !== stablePropsKey(entry.properties)) {
          throw new CorpusConflictError(
            `Cross-corpus relationship ${id} has conflicting properties across corpora`,
          );
        }
        prior.corpora.add(store.corpusId);
      }
    }

    for (const { entry, corpora } of byIdentity.values()) {
      const aCorpus = this.nodeRoute.get(entry.a)!;
      const bCorpus = this.nodeRoute.get(entry.b)!;
      for (const corpusId of [aCorpus, bCorpus]) {
        if (corpora.has(corpusId)) continue;
        const store = this.requireStore(corpusId);
        if (store.access === "readonly") continue;
        store.writeRelationshipEntry(
          {
            a: entry.a,
            b: entry.b,
            type: normalizeAssociationId(entry.type),
            properties: entry.properties ?? {},
          },
          false,
        );
        corpora.add(corpusId);
      }
    }
  }

  locateNode(id: string): string | null {
    return this.nodeRoute.get(id) ?? null;
  }

  listCorpora(): readonly TomeCorpusInfo[] {
    return this.stores.map((store) => ({
      id: store.corpusId,
      contentDir: store.contentDir,
      access: store.access,
      workspace: store.readWorkspaceFile(),
    }));
  }

  private requireStore(corpusId: string): ContentStore {
    const store = this.byId.get(corpusId);
    if (!store) throw new Error(`Unknown corpus "${corpusId}"`);
    return store;
  }

  private storeForNode(id: string): ContentStore | null {
    const corpusId = this.locateNode(id);
    return corpusId ? this.requireStore(corpusId) : null;
  }

  private assertWritable(store: ContentStore, action: string): void {
    if (store.access === "readonly") {
      throw new CorpusReadonlyError(store.corpusId, action);
    }
  }

  /** Create a node in a specific corpus (used when id is not yet routed). */
  writeNodeToCorpus(corpusId: string, node: Node, body?: string): void {
    const store = this.requireStore(corpusId);
    this.assertWritable(store, "write node");
    const existing = this.locateNode(node.id);
    if (existing && existing !== corpusId) {
      throw new CorpusConflictError(
        `Node "${node.id}" already belongs to corpus "${existing}"`,
      );
    }
    store.writeNode(node, body);
    this.nodeRoute.set(node.id, corpusId);
  }

  listNodeIds(): string[] {
    return [...this.nodeRoute.keys()];
  }

  readNode(id: string): Node | null {
    return this.storeForNode(id)?.readNode(id) ?? null;
  }

  writeNode(node: Node, body?: string): void {
    const store = this.storeForNode(node.id);
    if (!store) {
      // New node without prior route: write to primary corpus.
      this.writeNodeToCorpus(this.stores[0]!.corpusId, node, body);
      return;
    }
    this.assertWritable(store, "write node");
    store.writeNode(node, body);
  }

  deleteNodeFile(id: string): void {
    const store = this.storeForNode(id);
    if (!store) return;
    this.assertWritable(store, "delete node");
    store.deleteNodeFile(id);
    this.nodeRoute.delete(id);
  }

  mergeNodeProperties(id: string, patch: Properties): boolean {
    const store = this.storeForNode(id);
    if (!store) return false;
    this.assertWritable(store, "merge node properties");
    return store.mergeNodeProperties(id, patch);
  }

  isNodeFileArchived(id: string): boolean {
    return this.storeForNode(id)?.isNodeFileArchived(id) ?? false;
  }

  moveNodeToArchive(id: string): boolean {
    const store = this.storeForNode(id);
    if (!store) return false;
    this.assertWritable(store, "archive node");
    return store.moveNodeToArchive(id);
  }

  moveNodeFromArchive(id: string): boolean {
    const store = this.storeForNode(id);
    if (!store) return false;
    this.assertWritable(store, "unarchive node");
    return store.moveNodeFromArchive(id);
  }

  readRelationshipsFile(): RelationshipsFile {
    const byId = new Map<string, RelationshipEntry>();
    for (const store of this.stores) {
      for (const entry of store.readRelationshipsFile().relationships) {
        const id = relationshipIdentity(entry);
        const prior = byId.get(id);
        if (prior) {
          if (stablePropsKey(prior.properties) !== stablePropsKey(entry.properties)) {
            throw new CorpusConflictError(
              `Cross-corpus relationship ${id} has conflicting properties`,
            );
          }
          continue;
        }
        byId.set(id, entry);
      }
    }
    return {
      version: RELATIONSHIPS_FILE_VERSION,
      relationships: [...byId.values()],
    };
  }

  writeRelationshipsFile(
    file: RelationshipsFile,
    options?: { archivedEntries?: readonly RelationshipEntry[] },
  ): void {
    // Full replace is only safe for solo stores; composite refuses bulk replace.
    if (options?.archivedEntries) {
      throw new Error("CompositeStore does not support bulk archived relationship replace");
    }
    for (const store of this.stores) {
      this.assertWritable(store, "replace relationships");
    }
    // Clear and rewrite per corpus ownership of endpoints.
    for (const store of this.stores) {
      store.writeRelationshipsFile({ version: RELATIONSHIPS_FILE_VERSION, relationships: [] });
    }
    for (const entry of file.relationships) {
      this.writeRelationshipEntryRouted(entry);
    }
  }

  readArchivedRelationships(): RelationshipEntry[] {
    const byId = new Map<string, RelationshipEntry>();
    for (const store of this.stores) {
      for (const entry of store.readArchivedRelationships()) {
        byId.set(relationshipIdentity(entry), entry);
      }
    }
    return [...byId.values()];
  }

  writeArchivedRelationships(entries: readonly RelationshipEntry[]): void {
    throw new Error("CompositeStore does not support bulk archived relationship replace");
  }

  writeRelationshipEntry(entry: RelationshipEntry, archived = false): void {
    this.writeRelationshipEntryRouted(entry, archived);
  }

  private writeRelationshipEntryRouted(entry: RelationshipEntry, archived = false): void {
    const aCorpus = this.locateNode(entry.a);
    const bCorpus = this.locateNode(entry.b);
    if (!aCorpus || !bCorpus) {
      // Incomplete edge (solo dangling): write to whichever endpoint exists.
      const corpusId = aCorpus ?? bCorpus;
      if (!corpusId) {
        throw new Error(
          `Cannot write relationship ${relationshipIdentity(entry)}: neither endpoint is known`,
        );
      }
      const store = this.requireStore(corpusId);
      this.assertWritable(store, "write relationship");
      store.writeRelationshipEntry(entry, archived);
      return;
    }
    if (aCorpus === bCorpus) {
      const store = this.requireStore(aCorpus);
      this.assertWritable(store, "write relationship");
      store.writeRelationshipEntry(entry, archived);
      return;
    }
    const storeA = this.requireStore(aCorpus);
    const storeB = this.requireStore(bCorpus);
    this.assertWritable(storeA, "write cross-corpus relationship");
    this.assertWritable(storeB, "write cross-corpus relationship");
    const normalized: RelationshipEntry = {
      a: entry.a,
      b: entry.b,
      type: normalizeAssociationId(entry.type),
      properties: entry.properties ?? {},
    };
    storeA.writeRelationshipEntry(normalized, archived);
    storeB.writeRelationshipEntry(normalized, archived);
  }

  isRelationshipArchived(a: string, b: string, type: string): boolean {
    for (const store of this.stores) {
      if (store.isRelationshipArchived(a, b, type)) return true;
    }
    return false;
  }

  moveRelationshipToArchive(a: string, b: string, type: string): boolean {
    let moved = false;
    for (const store of this.stores) {
      if (store.findContentEntry(a, b, type) || store.isRelationshipArchived(a, b, type)) {
        this.assertWritable(store, "archive relationship");
        if (store.moveRelationshipToArchive(a, b, type)) moved = true;
      }
    }
    return moved;
  }

  moveRelationshipFromArchive(a: string, b: string, type: string): boolean {
    let moved = false;
    for (const store of this.stores) {
      if (store.isRelationshipArchived(a, b, type)) {
        this.assertWritable(store, "unarchive relationship");
        if (store.moveRelationshipFromArchive(a, b, type)) moved = true;
      }
    }
    return moved;
  }

  readAssociationsFile(): AssociationsFile {
    const merged = emptyAssociationsFile();
    for (const store of this.stores) {
      const file = store.readAssociationsFile();
      for (const [id, def] of Object.entries(file.associations)) {
        merged.associations[id] = def;
      }
    }
    return merged;
  }

  writeAssociationsFile(file: AssociationsFile): void {
    // Write only keys that already live on a corpus; new keys go to primary.
    const owned = new Map<string, string>();
    for (const store of this.stores) {
      for (const id of Object.keys(store.readAssociationsFile().associations)) {
        owned.set(id, store.corpusId);
      }
    }
    const byCorpus = new Map<string, AssociationsFile>();
    for (const store of this.stores) {
      byCorpus.set(store.corpusId, emptyAssociationsFile());
    }
    for (const [id, def] of Object.entries(file.associations)) {
      const corpusId = owned.get(id) ?? this.stores[0]!.corpusId;
      const target = byCorpus.get(corpusId)!;
      target.associations[id] = def;
    }
    for (const store of this.stores) {
      this.assertWritable(store, "write associations");
      store.writeAssociationsFile(byCorpus.get(store.corpusId)!);
    }
  }

  findContentEntry(source: string, target: string, localType: string): RelationshipEntry | null {
    for (const store of this.stores) {
      const found = store.findContentEntry(source, target, localType);
      if (found) return found;
    }
    return null;
  }

  findRelationship(source: string, target: string, localType: string) {
    for (const store of this.stores) {
      const found = store.findRelationship(source, target, localType);
      if (found) return found;
    }
    return null;
  }

  upsertRelationship(
    source: string,
    target: string,
    localType: string,
    properties: Properties = {},
  ): void {
    const aCorpus = this.locateNode(source);
    const bCorpus = this.locateNode(target);
    if (!aCorpus || !bCorpus) {
      throw new Error("upsertRelationship requires both endpoints to exist");
    }
    if (aCorpus === bCorpus) {
      const store = this.requireStore(aCorpus);
      this.assertWritable(store, "upsert relationship");
      store.upsertRelationship(source, target, localType, properties);
      return;
    }
    const storeA = this.requireStore(aCorpus);
    const storeB = this.requireStore(bCorpus);
    this.assertWritable(storeA, "upsert cross-corpus relationship");
    this.assertWritable(storeB, "upsert cross-corpus relationship");
    // Author on A, then copy exact entry to B so tuple order matches.
    storeA.upsertRelationship(source, target, localType, properties);
    const entry = storeA.findContentEntry(source, target, localType);
    if (!entry) {
      throw new Error("Failed to read relationship after upsert on primary corpus");
    }
    storeB.writeRelationshipEntry(
      {
        a: entry.a,
        b: entry.b,
        type: normalizeAssociationId(entry.type),
        properties: entry.properties ?? {},
      },
      false,
    );
  }

  mergeRelationshipProperties(
    source: string,
    target: string,
    localType: string,
    patch: Properties,
  ): void {
    const existing = this.findRelationship(source, target, localType);
    if (!existing) {
      this.upsertRelationship(source, target, localType, patch);
      return;
    }
    const merged = { ...existing.properties };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      merged[k] = v;
    }
    this.upsertRelationship(source, target, localType, merged);
  }

  replaceRelationshipProperties(
    source: string,
    target: string,
    localType: string,
    properties: Properties,
  ): boolean {
    if (!this.findContentEntry(source, target, localType)) return false;
    this.upsertRelationship(source, target, localType, properties);
    // upsert merges; for exact replace, rewrite both copies from authored entry after clear.
    const entry = this.findContentEntry(source, target, localType);
    if (!entry) return false;
    const aCorpus = this.locateNode(entry.a);
    const bCorpus = this.locateNode(entry.b);
    if (!aCorpus || !bCorpus) return false;
    const next: RelationshipEntry = {
      a: entry.a,
      b: entry.b,
      type: normalizeAssociationId(entry.type),
      properties,
    };
    if (aCorpus === bCorpus) {
      const store = this.requireStore(aCorpus);
      this.assertWritable(store, "replace relationship properties");
      store.deleteRelationship(source, target, localType);
      store.writeRelationshipEntry(next, false);
      return true;
    }
    const storeA = this.requireStore(aCorpus);
    const storeB = this.requireStore(bCorpus);
    this.assertWritable(storeA, "replace cross-corpus relationship properties");
    this.assertWritable(storeB, "replace cross-corpus relationship properties");
    storeA.deleteRelationship(source, target, localType);
    storeB.deleteRelationship(source, target, localType);
    storeA.writeRelationshipEntry(next, false);
    storeB.writeRelationshipEntry(next, false);
    return true;
  }

  deleteRelationship(source: string, target: string, localType: string): boolean {
    let deleted = false;
    const aCorpus = this.locateNode(source);
    const bCorpus = this.locateNode(target);
    if (aCorpus && bCorpus && aCorpus !== bCorpus) {
      const storeA = this.requireStore(aCorpus);
      const storeB = this.requireStore(bCorpus);
      this.assertWritable(storeA, "delete cross-corpus relationship");
      this.assertWritable(storeB, "delete cross-corpus relationship");
      if (storeA.deleteRelationship(source, target, localType)) deleted = true;
      if (storeB.deleteRelationship(source, target, localType)) deleted = true;
      return deleted;
    }
    for (const store of this.stores) {
      if (store.findContentEntry(source, target, localType)) {
        this.assertWritable(store, "delete relationship");
        if (store.deleteRelationship(source, target, localType)) deleted = true;
      }
    }
    return deleted;
  }

  removeIncidentRelationships(nodeId: string): void {
    const store = this.storeForNode(nodeId);
    if (!store) return;
    this.assertWritable(store, "remove incident relationships");
    // Also remove dual copies from other corpora.
    const live = this.readRelationshipsFile().relationships.filter(
      (e) => e.a === nodeId || e.b === nodeId,
    );
    for (const entry of live) {
      this.deleteRelationship(entry.a, entry.b, entry.type);
    }
  }

  readDynamicPropertiesFile(): DynamicPropertiesFile {
    const merged = emptyDynamicPropertiesFile();
    for (const store of this.stores) {
      const file = store.readDynamicPropertiesFile();
      merged.properties.push(...file.properties);
      merged.columnSets.push(...file.columnSets);
    }
    return merged;
  }

  writeDynamicPropertiesFile(file: DynamicPropertiesFile): void {
    // Primary owns dynamic properties in v1 composite writes.
    const primary = this.stores[0]!;
    this.assertWritable(primary, "write dynamic properties");
    primary.writeDynamicPropertiesFile(file);
  }

  readViewsFile(): ViewsFile {
    const merged = emptyViewsFile();
    const seen = new Set<string>();
    for (const store of this.stores) {
      for (const view of store.readViewsFile().views) {
        const key =
          "id" in view && typeof view.id === "string"
            ? view.id
            : "generator" in view
              ? `gen:${(view as { generator: string }).generator}`
              : JSON.stringify(view);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.views.push(view);
      }
    }
    return merged;
  }

  writeViewsFile(file: ViewsFile): void {
    const primary = this.stores[0]!;
    this.assertWritable(primary, "write views");
    primary.writeViewsFile(file);
  }

  readTableSchemasFile(): TableSchemasFile {
    const merged = emptyTableSchemasFile();
    for (const store of this.stores) {
      const file = store.readTableSchemasFile();
      Object.assign(merged.tables, file.tables);
    }
    return merged;
  }

  writeTableSchemasFile(file: TableSchemasFile): void {
    const owned = new Map<string, string>();
    for (const store of this.stores) {
      for (const id of Object.keys(store.readTableSchemasFile().tables)) {
        owned.set(id, store.corpusId);
      }
    }
    const byCorpus = new Map<string, TableSchemasFile>();
    for (const store of this.stores) {
      byCorpus.set(store.corpusId, emptyTableSchemasFile());
    }
    for (const [id, table] of Object.entries(file.tables)) {
      const corpusId = owned.get(id) ?? this.stores[0]!.corpusId;
      byCorpus.get(corpusId)!.tables[id] = table;
    }
    for (const store of this.stores) {
      this.assertWritable(store, "write table schemas");
      store.writeTableSchemasFile(byCorpus.get(store.corpusId)!);
    }
  }

  readWorkspaceFile(): WorkspaceFile {
    return this.stores[0]!.readWorkspaceFile();
  }

  writeWorkspaceFile(file: WorkspaceFile): void {
    const primary = this.stores[0]!;
    this.assertWritable(primary, "write workspace");
    primary.writeWorkspaceFile(file);
  }

  /** Write workspace for a specific corpus (quick links, etc.). */
  writeWorkspaceFileForCorpus(corpusId: string, file: WorkspaceFile): void {
    const store = this.requireStore(corpusId);
    this.assertWritable(store, "write workspace");
    store.writeWorkspaceFile(file);
  }

  subscribe(listener: StoreChangeListener): () => void {
    const unsubs = this.stores.map((store) => store.subscribe(listener));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }

  startWatching(): void {
    if (this.closed) return;
    for (const store of this.stores) {
      store.startWatching();
    }
  }

  stopWatching(): void {
    for (const store of this.stores) {
      store.stopWatching();
    }
  }

  close(): void {
    this.closed = true;
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes.length = 0;
    for (const store of this.stores) {
      store.close();
    }
  }
}
