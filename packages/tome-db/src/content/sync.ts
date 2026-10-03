import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  ContentStore,
  bodyFromNode,
  columnSetRecordFromEntry,
  emptyDynamicPropertiesFile,
  propertyRecordFromEntry,
  parseDynamicPropertiesFile,
  invalidateSchemaCache,
  loadSchemaFromContent,
  invalidateViewsCache,
  invalidateTableSchemasCache,
  invalidateRelationshipTypesCache,
  invalidateWorkspaceCache,
  loadWorkspaceFromContent,
  invalidateExtensionsCache,
  loadRelationshipTypesFromContent,
  RELATIONSHIPS_SYNC_MARKER,
  ASSOCIATIONS_FILENAME,
  DYNAMIC_PROPERTIES_FILENAME,
  SCHEMA_FILENAME,
  VIEWS_FILENAME,
  TABLE_SCHEMAS_FILENAME,
  WORKSPACE_FILENAME,
  SEQUENCING_FILENAME,
  EXTENSIONS_FILENAME,
  RELATIONSHIP_FILE_PATTERN,
  dynamicPropertiesFilePath,
  NODE_FILE_PATTERN,
  contentModelDir,
  contentRelationshipsDir,
  contentRelationshipsArchiveDir,
  nodeFilePath,
  type DynamicColumnSetRecord,
  type DynamicPropertyRecord,
} from "tome-flatfile";
import type { TomeQueryCache } from "tome-sqlite";
import { ENUM_CONFIG_FINGERPRINT_META_KEY, enumConfigFingerprint } from "../enum-config-fingerprint";
import { decodeEnumProperties, encodeEnumProperties } from "../enum-codec";
import { expandAllRelationships } from "./relationship-sync-expand";
import { openComposedGraphStore } from "../graph-store/open-graph-store";
import type { TomeDataStore } from "tome-service-interfaces";
import type { FlatfileStore, TomeWriteContext } from "./write-context";

export type SyncProgressPhase =
  | "check"
  | "rebuild"
  | "rebuild_nodes"
  | "expand_relationships"
  | "reconcile"
  | "ready";

export type SyncProgressEvent = {
  phase: SyncProgressPhase;
  current?: number;
  total?: number;
  message?: string;
};

export type SyncProgressReporter = (event: SyncProgressEvent) => void;

/** Public readiness snapshot for HTTP health / gated API responses. */
export type CacheSyncPublicStatus = {
  ready: boolean;
  syncing: boolean;
  phase?: SyncProgressPhase;
  /** 0..1 when current+total are known. */
  progress?: number;
  current?: number;
  total?: number;
  message?: string;
};

export type CacheSyncStatusTracker = {
  report: SyncProgressReporter;
  getStatus: () => CacheSyncPublicStatus;
  markReady: () => void;
};

function progressFromEvent(event: SyncProgressEvent): number | undefined {
  if (
    event.current != null &&
    event.total != null &&
    event.total > 0 &&
    Number.isFinite(event.current) &&
    Number.isFinite(event.total)
  ) {
    return Math.min(1, Math.max(0, event.current / event.total));
  }
  return undefined;
}

/** Mutable status tracker that also acts as a `SyncProgressReporter`. */
export function createCacheSyncStatusTracker(
  initial?: Partial<CacheSyncPublicStatus>,
): CacheSyncStatusTracker {
  let status: CacheSyncPublicStatus = {
    ready: false,
    syncing: true,
    phase: "check",
    message: "checking cache freshness…",
    ...initial,
  };

  return {
    report(event) {
      const progress = progressFromEvent(event);
      status = {
        ready: event.phase === "ready",
        syncing: event.phase !== "ready",
        phase: event.phase,
        ...(progress != null ? { progress } : {}),
        ...(event.current != null ? { current: event.current } : {}),
        ...(event.total != null ? { total: event.total } : {}),
        ...(event.message != null ? { message: event.message } : {}),
      };
    },
    getStatus() {
      return { ...status };
    },
    markReady() {
      status = {
        ready: true,
        syncing: false,
        phase: "ready",
        progress: 1,
        message: status.message ?? "cache ready",
      };
    },
  };
}

/** Combine multiple progress reporters (e.g. console + status tracker). */
export function composeSyncProgressReporters(
  ...reporters: Array<SyncProgressReporter | undefined>
): SyncProgressReporter {
  const active = reporters.filter((r): r is SyncProgressReporter => r != null);
  if (active.length === 0) return () => {};
  if (active.length === 1) return active[0]!;
  return (event) => {
    for (const reporter of active) reporter(event);
  };
}

function formatSyncCount(n: number): string {
  return n.toLocaleString("en-US");
}

function formatSyncElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function shouldReportSyncProgress(current: number, total: number): boolean {
  if (total <= 100) return true;
  return current % 1000 === 0 || current === total;
}

/** Default stderr progress lines for startup cache sync (`[tome-sync]` prefix). */
export function createConsoleSyncProgressReporter(): SyncProgressReporter {
  return (event) => {
    const prefix = "[tome-sync]";
    switch (event.phase) {
      case "check":
        console.log(`${prefix} ${event.message ?? "checking cache freshness…"}`);
        break;
      case "rebuild":
        console.log(`${prefix} full rebuild: ${formatSyncCount(event.total ?? 0)} nodes`);
        break;
      case "rebuild_nodes":
        if (event.current != null && event.total != null) {
          console.log(
            `${prefix} nodes ${formatSyncCount(event.current)}/${formatSyncCount(event.total)}`,
          );
        }
        break;
      case "expand_relationships":
        if (event.message) {
          console.log(`${prefix} ${event.message}`);
        } else if (event.total != null) {
          console.log(`${prefix} expanding ${formatSyncCount(event.total)} relationships…`);
        }
        break;
      case "reconcile":
        if (event.current != null && event.total != null && event.current > 0) {
          console.log(
            `${prefix} reconciling ${formatSyncCount(event.current)}/${formatSyncCount(event.total)} node bodies…`,
          );
        } else if (event.total != null) {
          console.log(`${prefix} reconciling ${formatSyncCount(event.total)} node bodies…`);
        }
        break;
      case "ready":
        console.log(`${prefix} ${event.message ?? "cache ready"}`);
        break;
    }
  };
}

/** Wire store change notifications into cache sync (file watching / external edits). */
export function subscribeStoreToCacheSync(
  store: TomeDataStore,
  sync: CacheSync,
): () => void {
  return store.subscribe((event) => {
    // Queue behind in-flight applies (do not drop while applying — that left
    // SQLite stale after flatfile writes). StoreChangeListener is sync-void.
    void sync.syncFile(event.path).catch((err) => {
      console.error("[tome-sync] syncFile failed:", err);
    });
  });
}

let cachedDynamicConfig: {
  mtimeMs: number;
  propertiesByOwner: Map<string, DynamicPropertyRecord[]>;
  columnSetsByOwner: Map<string, DynamicColumnSetRecord[]>;
} | null = null;

export function invalidateDynamicPropertiesCache(): void {
  cachedDynamicConfig = null;
}

function loadDynamicConfigFromContent(contentDir: string): {
  propertiesByOwner: Map<string, DynamicPropertyRecord[]>;
  columnSetsByOwner: Map<string, DynamicColumnSetRecord[]>;
} {
  const path = dynamicPropertiesFilePath(contentDir);
  let mtimeMs = 0;
  if (existsSync(path)) {
    mtimeMs = statSync(path).mtimeMs;
  }

  if (cachedDynamicConfig && cachedDynamicConfig.mtimeMs === mtimeMs) {
    return {
      propertiesByOwner: cachedDynamicConfig.propertiesByOwner,
      columnSetsByOwner: cachedDynamicConfig.columnSetsByOwner,
    };
  }

  let file;
  try {
    file = parseDynamicPropertiesFile(readFileSync(path, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      file = emptyDynamicPropertiesFile();
    } else {
      throw err;
    }
  }

  const propertiesByOwner = new Map<string, DynamicPropertyRecord[]>();
  const columnSetsByOwner = new Map<string, DynamicColumnSetRecord[]>();

  for (const entry of file.properties) {
    const record = propertyRecordFromEntry(entry);
    const list = propertiesByOwner.get(record.owner) ?? [];
    list.push(record);
    propertiesByOwner.set(record.owner, list);
  }

  for (const entry of file.columnSets) {
    const record = columnSetRecordFromEntry(entry);
    const list = columnSetsByOwner.get(record.owner) ?? [];
    list.push(record);
    columnSetsByOwner.set(record.owner, list);
  }

  cachedDynamicConfig = { mtimeMs, propertiesByOwner, columnSetsByOwner };
  return { propertiesByOwner, columnSetsByOwner };
}

export function loadDynamicPropertiesFromContent(
  contentDir: string,
  owner: string,
): DynamicPropertyRecord[] {
  return loadDynamicConfigFromContent(contentDir).propertiesByOwner.get(owner) ?? [];
}

export function loadDynamicColumnSetsFromContent(
  contentDir: string,
  owner: string,
): DynamicColumnSetRecord[] {
  return loadDynamicConfigFromContent(contentDir).columnSetsByOwner.get(owner) ?? [];
}

export class CacheSync {
  private applying = false;
  /** Serializes cache applies so waiters re-run instead of silently no-oping. */
  private applyChain: Promise<void> = Promise.resolve();
  private startupSync = false;
  private readonly progress: SyncProgressReporter;

  constructor(
    readonly store: FlatfileStore,
    readonly cache: TomeQueryCache,
    progress?: SyncProgressReporter,
  ) {
    this.progress = progress ?? createConsoleSyncProgressReporter();
  }

  private report(event: SyncProgressEvent): void {
    if (!this.startupSync) return;
    this.progress(event);
  }

  get contentDir(): string {
    return this.store.contentDir;
  }

  isApplying(): boolean {
    return this.applying;
  }

  /**
   * Run exclusive cache-mutating work. Concurrent callers queue and each runs
   * after the previous finishes (never drop a post-write sync).
   */
  private exclusive(fn: () => Promise<void>): Promise<void> {
    const run = this.applyChain.then(async () => {
      this.applying = true;
      try {
        await fn();
      } finally {
        this.applying = false;
      }
    });
    this.applyChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private corpusContentDirs(): string[] {
    return this.store.listCorpora().map((c) => c.contentDir);
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
    for (const contentDir of this.corpusContentDirs()) {
      const modelDir = contentModelDir(contentDir);
      scanRelationshipTree(contentRelationshipsDir(contentDir));
      scanRelationshipTree(contentRelationshipsArchiveDir(contentDir));
      scanFile(modelDir, ASSOCIATIONS_FILENAME);
      scanFile(modelDir, DYNAMIC_PROPERTIES_FILENAME);
      scanFile(modelDir, SCHEMA_FILENAME);
      scanFile(modelDir, VIEWS_FILENAME);
      scanFile(modelDir, WORKSPACE_FILENAME);
      scanFile(modelDir, SEQUENCING_FILENAME);
      scanFile(modelDir, EXTENSIONS_FILENAME);
    }
    try {
      for (const id of this.store.listNodeIds()) {
        const corpusId = this.store.locateNode(id);
        const contentDir =
          this.store.listCorpora().find((c) => c.id === corpusId)?.contentDir ?? this.contentDir;
        const archived = this.store.isNodeFileArchived(id);
        max = Math.max(max, statSync(nodeFilePath(contentDir, id, archived)).mtimeMs);
      }
    } catch {
      /* empty dir */
    }
    return max;
  }

  async cacheNeedsRebuild(): Promise<boolean> {
    if (!existsSync(this.cache.path)) return true;
    const cacheMarker = await this.cache.getMeta("content_mtime_ms");
    const contentMtime = String(this.contentSnapshotMtime());
    if (cacheMarker !== contentMtime) return true;
    const schema = this.mergedSchemaForFingerprint();
    const storedFingerprint = (await this.cache.getMeta(ENUM_CONFIG_FINGERPRINT_META_KEY)) ?? "";
    return enumConfigFingerprint(schema) !== storedFingerprint;
  }

  private mergedSchemaForFingerprint() {
    // Fingerprint primary schema; conflicts across corpora fail at composite boot.
    return loadSchemaFromContent(this.contentDir);
  }

  private async updateCacheMarkers(): Promise<void> {
    await this.cache.setMeta("content_mtime_ms", String(this.contentSnapshotMtime()));
    const schema = this.mergedSchemaForFingerprint();
    await this.cache.setMeta(ENUM_CONFIG_FINGERPRINT_META_KEY, enumConfigFingerprint(schema));
  }

  private async expandRelationshipsToCache(): Promise<void> {
    // Live tree only — archived edges live under relationships/archive/.
    const entries = this.store.readRelationshipsFile().relationships;
    const registry = this.store.readRelationshipTypesFile();
    const expandStarted = performance.now();
    if (this.startupSync) {
      this.report({ phase: "expand_relationships", total: entries.length });
      await Bun.sleep(0);
    }
    const { records, projections } = expandAllRelationships(entries, registry);
    const archiveIds = this.store.listCorpora().map((c) => c.workspace.archiveNodeId);

    await this.cache.transaction(async (cache) => {
      await cache.runExec("BEGIN");
      try {
        await cache.clearRelationshipCache();
        for (const record of records) {
          await cache.upsertRelationshipRecord(record);
        }
        for (const projection of projections) {
          await cache.upsertRelationshipProjection(projection);
        }
        await cache.recomputeArchivedFlags(archiveIds);
        await cache.runExec("COMMIT");
      } catch (err) {
        await cache.runExec("ROLLBACK");
        throw err;
      }
    });

    if (this.startupSync) {
      this.report({
        phase: "expand_relationships",
        message: `relationships expanded (${formatSyncElapsed(performance.now() - expandStarted)})`,
      });
      await Bun.sleep(0);
    }
  }

  async recomputeArchivedFlags(): Promise<void> {
    const archiveIds = this.store.listCorpora().map((c) => c.workspace.archiveNodeId);
    await this.cache.recomputeArchivedFlags(archiveIds);
  }

  /**
   * Full cache rebuild from flatfile content. Yields on progress ticks during startup sync
   * so HTTP can answer gated syncing responses.
   */
  async fullRebuild(): Promise<void> {
    await this.exclusive(async () => {
      await this.cache.runExec("DELETE FROM nodes");

      const ids = this.store.listNodeIds();
      const total = ids.length;
      if (this.startupSync) {
        this.report({ phase: "rebuild", total });
        await Bun.sleep(0);
      }
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i]!;
        const node = this.store.readNode(id);
        if (!node) continue;
        const body = bodyFromNode(node);
        const props = { ...node.properties, body };
        await this.cache.upsertNode(node.id, props);
        if (this.startupSync && shouldReportSyncProgress(i + 1, total)) {
          this.report({ phase: "rebuild_nodes", current: i + 1, total });
          await Bun.sleep(0);
        }
      }

      await this.expandRelationshipsToCache();

      invalidateDynamicPropertiesCache();
      await this.updateCacheMarkers();
    });
  }

  /**
   * Cooperative startup sync: yields to the event loop on progress ticks so HTTP
   * can answer gated syncing responses while a long rebuild runs.
   */
  async ensureReady(): Promise<void> {
    this.startupSync = true;
    const startedAt = performance.now();
    try {
      this.report({ phase: "check", message: "checking cache freshness…" });
      await Bun.sleep(0);
      if (await this.cacheNeedsRebuild()) {
        await this.fullRebuild();
      } else {
        await this.reconcileNodeBodiesFromFiles();
      }
      this.report({
        phase: "ready",
        message: `cache ready (${formatSyncElapsed(performance.now() - startedAt)})`,
      });
    } finally {
      this.startupSync = false;
    }
  }

  /** @deprecated Prefer {@link ensureReady} — identical async API. */
  ensureReadyAsync(): Promise<void> {
    return this.ensureReady();
  }

  /** Repair SQLite bodies that drifted from git-tracked node files (e.g. after external edits). */
  private async reconcileNodeBodiesFromFiles(): Promise<void> {
    const ids = this.store.listNodeIds();
    const total = ids.length;
    if (this.startupSync) {
      this.report({ phase: "reconcile", total });
      await Bun.sleep(0);
    }
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i]!;
      const fileNode = this.store.readNode(id);
      if (!fileNode) continue;
      const fileBody = bodyFromNode(fileNode);
      const cacheNode = await this.cache.getNode(id);
      const cacheBody =
        typeof cacheNode?.properties.body === "string" ? cacheNode.properties.body : "";
      if (fileBody !== cacheBody) {
        await this.syncNode(id);
      }
      if (this.startupSync && shouldReportSyncProgress(i + 1, total)) {
        this.report({ phase: "reconcile", current: i + 1, total });
        await Bun.sleep(0);
      }
    }
  }

  private async syncNodeUnlocked(id: string): Promise<void> {
    const node = this.store.readNode(id);
    if (!node) {
      await this.cache.deleteNode(id);
      return;
    }
    const body = bodyFromNode(node);
    await this.cache.upsertNode(node.id, { ...node.properties, body });
  }

  async syncNode(id: string): Promise<void> {
    await this.exclusive(() => this.syncNodeUnlocked(id));
  }

  private async syncRelationshipsUnlocked(): Promise<void> {
    await this.expandRelationshipsToCache();
  }

  async syncRelationships(): Promise<void> {
    await this.exclusive(() => this.syncRelationshipsUnlocked());
  }

  private async syncFileUnlocked(relativeName: string): Promise<void> {
    if (
      relativeName === RELATIONSHIPS_SYNC_MARKER ||
      relativeName === ASSOCIATIONS_FILENAME
    ) {
      if (relativeName === ASSOCIATIONS_FILENAME) {
        invalidateRelationshipTypesCache();
      }
      await this.syncRelationshipsUnlocked();
      await this.updateCacheMarkers();
      return;
    }

    if (relativeName === DYNAMIC_PROPERTIES_FILENAME) {
      invalidateDynamicPropertiesCache();
      await this.updateCacheMarkers();
      return;
    }

    if (relativeName === SCHEMA_FILENAME) {
      invalidateSchemaCache();
      // Enum indices in SQLite depend on options order; re-encode from content labels.
      await this.syncRelationshipsUnlocked();
      await this.updateCacheMarkers();
      return;
    }

    if (relativeName === VIEWS_FILENAME) {
      invalidateViewsCache();
      await this.updateCacheMarkers();
      return;
    }

    if (relativeName === TABLE_SCHEMAS_FILENAME) {
      invalidateTableSchemasCache();
      await this.updateCacheMarkers();
      return;
    }

    if (relativeName === WORKSPACE_FILENAME) {
      invalidateWorkspaceCache();
      await this.recomputeArchivedFlags();
      await this.updateCacheMarkers();
      return;
    }

    if (relativeName === EXTENSIONS_FILENAME) {
      invalidateExtensionsCache();
      await this.updateCacheMarkers();
      return;
    }

    const base = basename(relativeName);
    const match = NODE_FILE_PATTERN.exec(base);
    if (match) {
      const id = base.slice(0, -3);
      await this.syncNodeUnlocked(id);
      await this.updateCacheMarkers();
    }
  }

  async syncFile(relativeName: string): Promise<void> {
    await this.exclusive(() => this.syncFileUnlocked(relativeName));
  }

  /**
   * Post-mutation barrier: wait for any in-flight apply, then refresh the cache
   * from current flatfile. Never silently skips when another expand is running.
   */
  async syncAfterWrite(relativeName: string): Promise<void> {
    await this.syncFile(relativeName);
  }
}

/**
 * Open flatfile ContentStore + sqlite GraphDatabase with enum codec and set-trait
 * perspectives, ensure the cache is ready, and wire store→sync subscriptions.
 */
export async function openContentGraph(
  contentDir: string,
  dbPath: string,
  options?: { deferReady?: boolean },
): Promise<TomeWriteContext> {
  const { writeContext } = await openComposedGraphStore(contentDir, dbPath, options);
  return writeContext;
}
