import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DynamicColumnSetRecord, DynamicFieldRecord } from "../dynamic-fields/overlay";
import { GraphDatabase } from "../graph";
import {
  columnSetRecordFromEntry,
  emptyDynamicFieldsFile,
  fieldRecordFromEntry,
  parseDynamicFieldsFile,
} from "./dynamic-fields-file";
import { bodyFromNode } from "./node-file";
import { ENUM_CONFIG_FINGERPRINT_META_KEY, enumConfigFingerprint } from "../enum-config-fingerprint";
import { invalidateSchemaCache, loadSchemaFromContent } from "../schema-rules/load";
import { invalidateViewsCache } from "../views/load";
import { invalidateTableSchemasCache } from "../table-schemas/load";
import { invalidateWorkspaceCache, loadWorkspaceFromContent } from "../workspace/load";
import { invalidateOrderedAssociationsCache } from "../ordered-associations-config/load";
import {
  RELATIONSHIPS_FILENAME,
  RELATIONSHIP_TYPES_FILENAME,
  DYNAMIC_FIELDS_FILENAME,
  SCHEMA_FILENAME,
  VIEWS_FILENAME,
  TABLE_SCHEMAS_FILENAME,
  WORKSPACE_FILENAME,
  ORDERED_ASSOCIATIONS_FILENAME,
  dynamicFieldsFilePath,
  NODE_FILE_PATTERN,
  contentDataDir,
  contentModelDir,
} from "./paths";
import { ContentStore } from "./store";
import { expandAllRelationships } from "./relationship-sync-expand";
import { filterEntriesForCacheSync } from "../relationship-archive";

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
    readonly db: GraphDatabase,
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
    const dataDir = contentDataDir(this.contentDir);
    const modelDir = contentModelDir(this.contentDir);
    scanFile(dataDir, RELATIONSHIPS_FILENAME);
    scanFile(modelDir, RELATIONSHIP_TYPES_FILENAME);
    scanFile(modelDir, DYNAMIC_FIELDS_FILENAME);
    scanFile(modelDir, SCHEMA_FILENAME);
    scanFile(modelDir, VIEWS_FILENAME);
    scanFile(modelDir, WORKSPACE_FILENAME);
    scanFile(modelDir, ORDERED_ASSOCIATIONS_FILENAME);
    try {
      for (const name of readdirSync(dataDir)) {
        if (NODE_FILE_PATTERN.test(name)) {
          max = Math.max(max, statSync(join(dataDir, name)).mtimeMs);
        }
      }
    } catch {
      /* empty dir */
    }
    return max;
  }

  cacheNeedsRebuild(): boolean {
    if (!existsSync(this.db.path)) return true;
    const cacheMarker = this.db.getMeta("content_mtime_ms");
    const contentMtime = String(this.contentSnapshotMtime());
    if (cacheMarker !== contentMtime) return true;
    const schema = loadSchemaFromContent(this.contentDir);
    const storedFingerprint = this.db.getMeta(ENUM_CONFIG_FINGERPRINT_META_KEY) ?? "";
    return enumConfigFingerprint(schema) !== storedFingerprint;
  }

  private updateCacheMarkers(): void {
    this.db.setMeta("content_mtime_ms", String(this.contentSnapshotMtime()));
    const schema = loadSchemaFromContent(this.contentDir);
    this.db.setMeta(ENUM_CONFIG_FINGERPRINT_META_KEY, enumConfigFingerprint(schema));
  }

  private expandRelationshipsToCache(): void {
    const allEntries = this.store.readRelationshipsFile().relationships;
    const entries = filterEntriesForCacheSync(allEntries);
    const registry = this.store.readRelationshipTypesFile();
    const { records, projections } = expandAllRelationships(entries, registry);

    this.db.runExec("BEGIN");
    try {
      this.db.clearRelationshipCache();
      for (let i = 0; i < records.length; i++) {
        const record = records[i]!;
        const entry = entries[i];
        this.db.upsertRelationshipRecord(record, entry?.directedFrom);
      }
      for (const projection of projections) {
        this.db.upsertRelationshipProjection(projection);
      }
      this.recomputeArchivedFlags();
      this.db.runExec("COMMIT");
    } catch (err) {
      this.db.runExec("ROLLBACK");
      throw err;
    }
  }

  recomputeArchivedFlags(): void {
    const archiveId = loadWorkspaceFromContent(this.contentDir).archiveNodeId;
    this.db.recomputeArchivedFlags(archiveId);
  }

  fullRebuild(): void {
    this.applying = true;
    try {
      this.db.runExec("DELETE FROM nodes");

      for (const id of this.store.listNodeIds()) {
        const node = this.store.readNode(id);
        if (!node) continue;
        const body = bodyFromNode(node);
        const props = { ...node.properties, body };
        this.db.upsertNode(node.id, props);
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
    }
  }

  syncNode(id: string): void {
    if (this.applying) return;
    this.applying = true;
    try {
      const node = this.store.readNode(id);
      if (!node) {
        this.db.deleteNode(id);
        return;
      }
      const body = bodyFromNode(node);
      this.db.upsertNode(node.id, { ...node.properties, body });
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
      relativeName === RELATIONSHIPS_FILENAME ||
      relativeName === RELATIONSHIP_TYPES_FILENAME
    ) {
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

    if (relativeName === ORDERED_ASSOCIATIONS_FILENAME) {
      invalidateOrderedAssociationsCache();
      this.updateCacheMarkers();
      return;
    }

    const match = NODE_FILE_PATTERN.exec(relativeName);
    if (match) {
      const id = relativeName.slice(0, 32);
      this.syncNode(id);
      this.updateCacheMarkers();
    }
  }

  syncAfterWrite(relativeName: string): void {
    this.syncFile(relativeName);
  }
}

export function openContentGraph(contentDir: string, dbPath: string): {
  store: ContentStore;
  sync: CacheSync;
  db: GraphDatabase;
} {
  const store = new ContentStore(contentDir);
  const db = new GraphDatabase(dbPath);
  const sync = new CacheSync(store, db);
  sync.ensureReady();
  return { store, sync, db };
}
