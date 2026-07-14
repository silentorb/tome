import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  ContentStore,
  bodyFromNode,
  columnSetRecordFromEntry,
  emptyDynamicFieldsFile,
  fieldRecordFromEntry,
  parseDynamicFieldsFile,
  invalidateSchemaCache,
  loadSchemaFromContent,
  invalidateViewsCache,
  invalidateTableSchemasCache,
  invalidateAssociationsCache,
  invalidateWorkspaceCache,
  loadWorkspaceFromContent,
  invalidateOrderedCollectionsCache,
  invalidateExtensionsCache,
  loadAssociationsFromContent,
  setTraitProjectionTypes,
  RELATIONSHIPS_SYNC_MARKER,
  ASSOCIATIONS_FILENAME,
  DYNAMIC_FIELDS_FILENAME,
  SCHEMA_FILENAME,
  VIEWS_FILENAME,
  TABLE_SCHEMAS_FILENAME,
  WORKSPACE_FILENAME,
  ORDERED_COLLECTIONS_FILENAME,
  EXTENSIONS_FILENAME,
  RELATIONSHIP_FILE_PATTERN,
  dynamicFieldsFilePath,
  NODE_FILE_PATTERN,
  contentModelDir,
  contentRelationshipsDir,
  contentRelationshipsArchiveDir,
  nodeFilePath,
  type DynamicColumnSetRecord,
  type DynamicFieldRecord,
} from "tome-flatfile";
import { GraphDatabase, type TomeQueryCache } from "tome-sqlite";
import { ENUM_CONFIG_FINGERPRINT_META_KEY, enumConfigFingerprint } from "../enum-config-fingerprint";
import { decodeEnumProperties, encodeEnumProperties } from "../enum-codec";
import { expandAllRelationships } from "./relationship-sync-expand";
import type { TomeDataStore } from "tome-service-interfaces";
import type { TomeWriteContext } from "./write-context";

/** Wire store change notifications into cache sync (file watching / external edits). */
export function subscribeStoreToCacheSync(
  store: TomeDataStore,
  sync: CacheSync,
): () => void {
  return store.subscribe((event) => {
    if (sync.isApplying()) return;
    sync.syncFile(event.path);
  });
}

let cachedDynamicConfig: {
  mtimeMs: number;
  fieldsByDatabase: Map<string, DynamicFieldRecord[]>;
  columnSetsByDatabase: Map<string, DynamicColumnSetRecord[]>;
} | null = null;

export function invalidateDynamicFieldsCache(): void {
  cachedDynamicConfig = null;
}

function loadDynamicConfigFromContent(contentDir: string): {
  fieldsByDatabase: Map<string, DynamicFieldRecord[]>;
  columnSetsByDatabase: Map<string, DynamicColumnSetRecord[]>;
} {
  const path = dynamicFieldsFilePath(contentDir);
  let mtimeMs = 0;
  if (existsSync(path)) {
    mtimeMs = statSync(path).mtimeMs;
  }

  if (cachedDynamicConfig && cachedDynamicConfig.mtimeMs === mtimeMs) {
    return {
      fieldsByDatabase: cachedDynamicConfig.fieldsByDatabase,
      columnSetsByDatabase: cachedDynamicConfig.columnSetsByDatabase,
    };
  }

  let file;
  try {
    file = parseDynamicFieldsFile(readFileSync(path, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      file = emptyDynamicFieldsFile();
    } else {
      throw err;
    }
  }

  const fieldsByDatabase = new Map<string, DynamicFieldRecord[]>();
  const columnSetsByDatabase = new Map<string, DynamicColumnSetRecord[]>();

  for (const entry of file.fields) {
    if (!entry.enabled) continue;
    const record = fieldRecordFromEntry(entry);
    const list = fieldsByDatabase.get(record.databaseId) ?? [];
    list.push(record);
    fieldsByDatabase.set(record.databaseId, list);
  }

  for (const entry of file.columnSets) {
    if (!entry.enabled) continue;
    const record = columnSetRecordFromEntry(entry);
    const list = columnSetsByDatabase.get(record.databaseId) ?? [];
    list.push(record);
    columnSetsByDatabase.set(record.databaseId, list);
  }

  cachedDynamicConfig = { mtimeMs, fieldsByDatabase, columnSetsByDatabase };
  return { fieldsByDatabase, columnSetsByDatabase };
}

export function loadDynamicFieldsFromContent(
  contentDir: string,
  databaseId: string,
): DynamicFieldRecord[] {
  return loadDynamicConfigFromContent(contentDir).fieldsByDatabase.get(databaseId) ?? [];
}

export function loadDynamicColumnSetsFromContent(
  contentDir: string,
  databaseId: string,
): DynamicColumnSetRecord[] {
  return loadDynamicConfigFromContent(contentDir).columnSetsByDatabase.get(databaseId) ?? [];
}

export class CacheSync {
  private applying = false;

  constructor(
    readonly store: ContentStore,
    readonly cache: TomeQueryCache,
  ) {}

  get contentDir(): string {
    return this.store.contentDir;
  }

  isApplying(): boolean {
    return this.applying;
  }

  contentSnapshotMtime(): number {
    let max = 0;
    const scanFile = (dir: string, name: string) => {
      const path = join(dir, name);
      if (!existsSync(path)) return;
      max = Math.max(max, statSync(path).mtimeMs);
    };
    const scanRelationshipTree = (rootDir: string) => {
      if (!existsSync(rootDir)) return;
      for (const shardEntry of readdirSync(rootDir, { withFileTypes: true })) {
        if (!shardEntry.isDirectory()) continue;
        if (!/^[0-9A-F]{2}$/.test(shardEntry.name)) continue;
        const shardDir = resolve(rootDir, shardEntry.name);
        for (const name of readdirSync(shardDir)) {
          if (!RELATIONSHIP_FILE_PATTERN.test(name)) continue;
          max = Math.max(max, statSync(resolve(shardDir, name)).mtimeMs);
        }
      }
    };
    const modelDir = contentModelDir(this.contentDir);
    scanRelationshipTree(contentRelationshipsDir(this.contentDir));
    scanRelationshipTree(contentRelationshipsArchiveDir(this.contentDir));
    scanFile(modelDir, ASSOCIATIONS_FILENAME);
    scanFile(modelDir, DYNAMIC_FIELDS_FILENAME);
    scanFile(modelDir, SCHEMA_FILENAME);
    scanFile(modelDir, VIEWS_FILENAME);
    scanFile(modelDir, WORKSPACE_FILENAME);
    scanFile(modelDir, ORDERED_COLLECTIONS_FILENAME);
    scanFile(modelDir, EXTENSIONS_FILENAME);
    try {
      for (const id of this.store.listNodeIds()) {
        const archived = this.store.isNodeFileArchived(id);
        max = Math.max(max, statSync(nodeFilePath(this.contentDir, id, archived)).mtimeMs);
      }
    } catch {
      /* empty dir */
    }
    return max;
  }

  cacheNeedsRebuild(): boolean {
    if (!existsSync(this.cache.path)) return true;
    const cacheMarker = this.cache.getMeta("content_mtime_ms");
    const contentMtime = String(this.contentSnapshotMtime());
    if (cacheMarker !== contentMtime) return true;
    const schema = loadSchemaFromContent(this.contentDir);
    const storedFingerprint = this.cache.getMeta(ENUM_CONFIG_FINGERPRINT_META_KEY) ?? "";
    return enumConfigFingerprint(schema) !== storedFingerprint;
  }

  private updateCacheMarkers(): void {
    this.cache.setMeta("content_mtime_ms", String(this.contentSnapshotMtime()));
    const schema = loadSchemaFromContent(this.contentDir);
    this.cache.setMeta(ENUM_CONFIG_FINGERPRINT_META_KEY, enumConfigFingerprint(schema));
  }

  private expandRelationshipsToCache(): void {
    // Live tree only — archived edges live under relationships/archive/.
    const entries = this.store.readRelationshipsFile().relationships;
    const registry = this.store.readAssociationsFile();
    const { records, projections } = expandAllRelationships(entries, registry);

    this.cache.runExec("BEGIN");
    try {
      this.cache.clearRelationshipCache();
      for (const record of records) {
        this.cache.upsertRelationshipRecord(record);
      }
      for (const projection of projections) {
        this.cache.upsertRelationshipProjection(projection);
      }
      this.recomputeArchivedFlags();
      this.cache.runExec("COMMIT");
    } catch (err) {
      this.cache.runExec("ROLLBACK");
      throw err;
    }
  }

  recomputeArchivedFlags(): void {
    const archiveId = loadWorkspaceFromContent(this.contentDir).archiveNodeId;
    this.cache.recomputeArchivedFlags(archiveId);
  }

  fullRebuild(): void {
    this.applying = true;
    try {
      this.cache.runExec("DELETE FROM nodes");

      for (const id of this.store.listNodeIds()) {
        const node = this.store.readNode(id);
        if (!node) continue;
        const body = bodyFromNode(node);
        const props = { ...node.properties, body };
        this.cache.upsertNode(node.id, props);
      }

      this.expandRelationshipsToCache();

      invalidateDynamicFieldsCache();
      this.updateCacheMarkers();
    } finally {
      this.applying = false;
    }
  }

  ensureReady(): void {
    if (this.cacheNeedsRebuild()) {
      this.fullRebuild();
      return;
    }
    this.reconcileNodeBodiesFromFiles();
  }

  /** Repair SQLite bodies that drifted from git-tracked node files (e.g. after external edits). */
  private reconcileNodeBodiesFromFiles(): void {
    for (const id of this.store.listNodeIds()) {
      const fileNode = this.store.readNode(id);
      if (!fileNode) continue;
      const fileBody = bodyFromNode(fileNode);
      const cacheNode = this.cache.getNode(id);
      const cacheBody =
        typeof cacheNode?.properties.body === "string" ? cacheNode.properties.body : "";
      if (fileBody !== cacheBody) {
        this.syncNode(id);
      }
    }
  }

  syncNode(id: string): void {
    if (this.applying) return;
    this.applying = true;
    try {
      const node = this.store.readNode(id);
      if (!node) {
        this.cache.deleteNode(id);
        return;
      }
      const body = bodyFromNode(node);
      this.cache.upsertNode(node.id, { ...node.properties, body });
    } finally {
      this.applying = false;
    }
  }

  syncRelationships(): void {
    if (this.applying) return;
    this.applying = true;
    try {
      this.expandRelationshipsToCache();
    } finally {
      this.applying = false;
    }
  }

  syncFile(relativeName: string): void {
    if (this.applying) return;

    if (
      relativeName === RELATIONSHIPS_SYNC_MARKER ||
      relativeName === ASSOCIATIONS_FILENAME
    ) {
      if (relativeName === ASSOCIATIONS_FILENAME) {
        invalidateAssociationsCache();
      }
      this.syncRelationships();
      this.updateCacheMarkers();
      return;
    }

    if (relativeName === DYNAMIC_FIELDS_FILENAME) {
      invalidateDynamicFieldsCache();
      this.updateCacheMarkers();
      return;
    }

    if (relativeName === SCHEMA_FILENAME) {
      invalidateSchemaCache();
      // Enum indices in SQLite depend on options order; re-encode from content labels.
      this.syncRelationships();
      this.updateCacheMarkers();
      return;
    }

    if (relativeName === VIEWS_FILENAME) {
      invalidateViewsCache();
      this.updateCacheMarkers();
      return;
    }

    if (relativeName === TABLE_SCHEMAS_FILENAME) {
      invalidateTableSchemasCache();
      this.updateCacheMarkers();
      return;
    }

    if (relativeName === WORKSPACE_FILENAME) {
      invalidateWorkspaceCache();
      this.recomputeArchivedFlags();
      this.updateCacheMarkers();
      return;
    }

    if (relativeName === ORDERED_COLLECTIONS_FILENAME) {
      invalidateOrderedCollectionsCache();
      this.updateCacheMarkers();
      return;
    }

    if (relativeName === EXTENSIONS_FILENAME) {
      invalidateExtensionsCache();
      this.updateCacheMarkers();
      return;
    }

    const base = basename(relativeName);
    const match = NODE_FILE_PATTERN.exec(base);
    if (match) {
      const id = base.slice(0, -3);
      this.syncNode(id);
      this.updateCacheMarkers();
    }
  }

  syncAfterWrite(relativeName: string): void {
    this.syncFile(relativeName);
  }
}

/**
 * Open flatfile ContentStore + sqlite GraphDatabase with enum codec and set-trait
 * perspectives, ensure the cache is ready, and wire store→sync subscriptions.
 */
export function openContentGraph(contentDir: string, dbPath: string): TomeWriteContext {
  const store = new ContentStore(contentDir);
  const cache = new GraphDatabase(dbPath, {
    propertyCodec: {
      encode: (properties) => encodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
      decode: (properties) => decodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
    },
    memberPerspectives: () =>
      setTraitProjectionTypes(loadAssociationsFromContent(contentDir)),
  });
  const sync = new CacheSync(store, cache);
  sync.ensureReady();
  subscribeStoreToCacheSync(store, sync);
  return { store, sync, cache };
}
