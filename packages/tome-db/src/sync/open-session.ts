import type { Graph } from "imp-core-types";
import type { TomeGraphStoreQueryable } from "tome-graph-interfaces";
import type { TomeSearch, TomeSearchBackend } from "tome-interfaces/search";
import {
  ContentStore,
  CompositeStore,
  FlatfileGraphStore,
  loadSchemaFromContent,
  loadRelationshipTypesFromContent,
  setTraitProjectionTypes,
} from "tome-flatfile";
import type {
  TomeCorpusConfig,
  TomeQueryCache,
  TomeQueryCacheOpenOptions,
  TomeServerModuleConfigEntry,
} from "tome-service-interfaces";
import { openWorkerSqliteCache } from "tome-sqlite";
import { FlatfileQueryableGraphStore, ComposedGraphStore } from "../graph-store/composed-graph-store";
import { CacheSync, type SyncProgressReporter } from "../content/sync";
import { decodeEnumProperties, encodeEnumProperties } from "../enum-codec";
import type { FlatfileStore, TomeWriteContext } from "../content/write-context";
import { DataStoreRegistry, type SyncEndpoint } from "./registry";
import {
  createDefaultSyncNodeTypeRegistry,
  type SyncNodeTypeRegistry,
} from "./node-registry";
import {
  createFlatfileSyncEndpoint,
  createSqliteCacheSyncEndpoint,
  syncSourceFromQueryable,
} from "./adapters";
import { buildDefaultSyncGraph, ensureFtsObserveEdges, wireSyncGraph, type SyncGraphWireResult } from "./wire";

export type OpenDataStoreSessionOptions = {
  /** Normalized data store module entries keyed by id. */
  dataStores: Record<string, TomeServerModuleConfigEntry>;
  /** Imp sync wiring graph; default synthesizes flatfile→query edges when sources exist. */
  syncGraph?: Graph;
  queryStoreId?: string;
  /** Defaults when entry options omit paths. */
  defaultContentPath?: string;
  defaultDbPath?: string;
  progress?: SyncProgressReporter;
  /** Skip ensureReady + wire observers (caller runs runInitialFull / wire). */
  deferReady?: boolean;
  nodeTypes?: SyncNodeTypeRegistry;
  propertyCodec?: TomeQueryCacheOpenOptions["propertyCodec"];
  memberPerspectives?: TomeQueryCacheOpenOptions["memberPerspectives"];
};

export type DataStoreSession = {
  registry: DataStoreRegistry;
  writeContext: TomeWriteContext;
  wire: SyncGraphWireResult | null;
  queryStoreId: string;
  flatfileStoreIds: string[];
  dispose: () => void;
};

type ModuleFactory = () => { open: (opts?: Record<string, unknown>) => unknown };

function optionsRecord(options: unknown): Record<string, unknown> {
  if (options && typeof options === "object" && !Array.isArray(options)) {
    return options as Record<string, unknown>;
  }
  return {};
}

function isFlatfileEntry(entry: TomeServerModuleConfigEntry): boolean {
  return entry.module === "tome-flatfile" || entry.export.includes("Flatfile");
}

function isSqliteCacheEntry(entry: TomeServerModuleConfigEntry): boolean {
  return entry.module === "tome-sqlite" || entry.export === "createSqliteModule";
}

/** Sync-fed or same-DB search backend modules (heuristic). */
function isSearchBackendEntry(entry: TomeServerModuleConfigEntry): boolean {
  return (
    entry.module === "tome-search-sqlite" ||
    entry.export.includes("SearchSqlite") ||
    entry.export.includes("createSearchSqliteModule") ||
    entry.export.includes("createPostgresFtsModule") ||
    entry.export.includes("FtsModule")
  );
}

/** Queryable SoT modules that return `{ graphStore, cache }` (heuristic). */
function isQueryableSoTEntry(entry: TomeServerModuleConfigEntry): boolean {
  return (
    entry.export === "createPostgresStoreModule" ||
    entry.export.includes("StoreModule")
  );
}

function isSearchBackendHandle(value: unknown): value is TomeSearchBackend & {
  endpoint?: SyncEndpoint;
} {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.search != null &&
    typeof v.search === "object" &&
    typeof v.close === "function"
  );
}

function isQueryableSoTHandle(value: unknown): value is {
  graphStore: TomeGraphStoreQueryable;
  cache: TomeQueryCache;
  close: () => void | Promise<void>;
} {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.graphStore != null &&
    typeof v.graphStore === "object" &&
    v.cache != null &&
    typeof v.cache === "object" &&
    typeof v.close === "function"
  );
}

async function loadModuleFactory(
  id: string,
  entry: TomeServerModuleConfigEntry,
): Promise<ModuleFactory> {
  const mod = (await import(entry.module)) as Record<string, unknown>;
  const factory = mod[entry.export];
  if (typeof factory !== "function") {
    throw new Error(
      `dataStores.${id}: ${entry.module} export "${entry.export}" is not a function`,
    );
  }
  return factory as ModuleFactory;
}

async function openSearchBackend(
  id: string,
  entry: TomeServerModuleConfigEntry,
  options: OpenDataStoreSessionOptions,
): Promise<TomeSearchBackend & { endpoint?: SyncEndpoint }> {
  const factory = await loadModuleFactory(id, entry);
  const created = factory();
  if (!created || typeof created.open !== "function") {
    throw new Error(`dataStores.${id}: module factory must return { open() }`);
  }
  const opts = optionsRecord(entry.options);
  const opened = await Promise.resolve(
    created.open({
      ...opts,
      dbPath:
        typeof opts.dbPath === "string" && opts.dbPath.trim()
          ? opts.dbPath.trim()
          : options.defaultDbPath
            ? `${options.defaultDbPath.replace(/\.sqlite$/, "")}-fts.sqlite`
            : undefined,
    }),
  );
  if (!isSearchBackendHandle(opened)) {
    throw new Error(
      `dataStores.${id}: search module open() must return { search, close }`,
    );
  }
  return opened;
}

/**
 * Open heterogeneous dataStores, wire Imp sync.graph observers, and derive
 * write-context (CacheSync composition or Queryable SoT-only).
 */
export async function openDataStoreSession(
  options: OpenDataStoreSessionOptions,
): Promise<DataStoreSession> {
  const registry = new DataStoreRegistry();
  const nodeTypes = options.nodeTypes ?? createDefaultSyncNodeTypeRegistry();
  const entries = Object.entries(options.dataStores);
  if (entries.length === 0) {
    throw new Error("openDataStoreSession: dataStores must not be empty");
  }

  const flatfileConfigs: TomeCorpusConfig[] = [];
  const flatfileIds: string[] = [];
  let sqliteEntry: { id: string; entry: TomeServerModuleConfigEntry } | null = null;
  let sotEntry: { id: string; entry: TomeServerModuleConfigEntry } | null = null;
  const searchEntries: Array<{ id: string; entry: TomeServerModuleConfigEntry }> = [];

  for (const [id, entry] of entries) {
    if (isSearchBackendEntry(entry)) {
      searchEntries.push({ id, entry });
      continue;
    }
    if (isQueryableSoTEntry(entry)) {
      if (sotEntry) {
        throw new Error(
          "openDataStoreSession: multiple Queryable SoT dataStores not supported yet",
        );
      }
      sotEntry = { id, entry };
      continue;
    }
    if (isSqliteCacheEntry(entry)) {
      if (sqliteEntry) {
        throw new Error("openDataStoreSession: multiple sqlite dataStores not supported yet");
      }
      sqliteEntry = { id, entry };
      continue;
    }
    if (isFlatfileEntry(entry)) {
      const opts = optionsRecord(entry.options);
      const contentPath =
        typeof opts.contentPath === "string" && opts.contentPath.trim()
          ? opts.contentPath.trim()
          : options.defaultContentPath;
      if (!contentPath) {
        throw new Error(`dataStores.${id}: contentPath required`);
      }
      flatfileIds.push(id);
      flatfileConfigs.push({
        id,
        contentPath,
        access: opts.access === "readonly" ? "readonly" : "readwrite",
      });
      continue;
    }
    throw new Error(`dataStores.${id}: unsupported module "${entry.module}" / "${entry.export}"`);
  }

  if (sqliteEntry && sotEntry) {
    throw new Error(
      "openDataStoreSession: cannot combine sqlite cache and Queryable SoT query stores",
    );
  }
  if (flatfileConfigs.length > 0 && sotEntry) {
    throw new Error(
      "openDataStoreSession: flatfile + Queryable SoT without CacheSync is not supported yet " +
        "(configure flatfile→sqlite observe graph, or SoT-only with no flatfile)",
    );
  }
  if (flatfileConfigs.length === 0 && !sotEntry) {
    throw new Error(
      "openDataStoreSession: need flatfile sources + query cache, or a Queryable SoT dataStore",
    );
  }
  if (flatfileConfigs.length > 0 && !sqliteEntry) {
    throw new Error(
      "openDataStoreSession: flatfile sources require a sqlite (or CacheSync-capable) query dataStore",
    );
  }

  const queryStoreId =
    options.queryStoreId ?? sotEntry?.id ?? sqliteEntry?.id;
  if (!queryStoreId) {
    throw new Error("openDataStoreSession: queryStoreId could not be resolved");
  }

  const ftsClosers: Array<() => void> = [];
  const otherClosers: Array<() => void | Promise<void>> = [];
  let writeContext: TomeWriteContext;
  let composedClose: (() => void | Promise<void>) | null = null;

  if (sotEntry) {
    const factory = await loadModuleFactory(sotEntry.id, sotEntry.entry);
    const created = factory();
    if (!created || typeof created.open !== "function") {
      throw new Error(`dataStores.${sotEntry.id}: module factory must return { open() }`);
    }
    const opened = await Promise.resolve(
      created.open(optionsRecord(sotEntry.entry.options)),
    );
    if (!isQueryableSoTHandle(opened)) {
      throw new Error(
        `dataStores.${sotEntry.id}: SoT module open() must return { graphStore, cache, close }`,
      );
    }
    registry.set({
      id: sotEntry.id,
      kind: "queryable",
      graphStore: opened.graphStore,
      cache: opened.cache,
      close: opened.close,
    });
    otherClosers.push(opened.close);
    writeContext = {
      graphStore: opened.graphStore,
      cache: opened.cache,
    };
  } else {
    const unionStore: FlatfileStore =
      flatfileConfigs.length >= 2
        ? new CompositeStore(flatfileConfigs)
        : new ContentStore(flatfileConfigs[0]!.contentPath, {
            corpusId: flatfileConfigs[0]!.id,
            access: flatfileConfigs[0]!.access === "readonly" ? "readonly" : "readwrite",
          });

    const contentDir = unionStore.contentDir;
    const propertyCodec = options.propertyCodec ?? {
      encode: (properties: Parameters<typeof encodeEnumProperties>[0]) =>
        encodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
      decode: (properties: Parameters<typeof decodeEnumProperties>[0]) =>
        decodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
    };
    const memberPerspectives =
      options.memberPerspectives ??
      (() => setTraitProjectionTypes(loadRelationshipTypesFromContent(contentDir)));

    const sqliteOpts = optionsRecord(sqliteEntry!.entry.options);
    const dbPath =
      typeof sqliteOpts.dbPath === "string" && sqliteOpts.dbPath.trim()
        ? sqliteOpts.dbPath.trim()
        : options.defaultDbPath;
    if (!dbPath) {
      throw new Error(`dataStores.${sqliteEntry!.id}: dbPath required`);
    }

    const cache = await openWorkerSqliteCache({
      dbPath,
      clean: sqliteOpts.clean === true,
      propertyCodec,
      memberPerspectives,
    });

    const sync = new CacheSync(unionStore, cache, options.progress);
    const composed = new ComposedGraphStore(
      new FlatfileGraphStore(unionStore),
      cache,
      sync,
    );
    composedClose = () => composed.close();

    const childStores =
      unionStore instanceof CompositeStore
        ? unionStore.corpusStores()
        : [unionStore as ContentStore];

    for (const child of childStores) {
      const q = new FlatfileQueryableGraphStore(child);
      const endpoint = createFlatfileSyncEndpoint({
        id: child.corpusId,
        dataStore: child,
        queryable: q,
      });
      registry.set({
        id: child.corpusId,
        kind: "flatfile",
        store: child,
        queryable: q,
        endpoint,
      });
    }

    const sqliteEndpoint = createSqliteCacheSyncEndpoint({
      id: queryStoreId,
      sync,
    });
    registry.set({
      id: queryStoreId,
      kind: "sqlite",
      cache,
      endpoint: sqliteEndpoint,
    });

    writeContext = {
      graphStore: composed,
      store: unionStore,
      sync,
      cache,
    };
  }

  for (const { id, entry } of searchEntries) {
    const opened = await openSearchBackend(id, entry, options);
    const rawEndpoint = opened.syncEndpoint ?? opened.endpoint;
    const endpoint = rawEndpoint
      ? {
          ...rawEndpoint,
          id,
          capabilities: {
            ...rawEndpoint.capabilities,
            kind: "fts" as const,
          },
        }
      : undefined;
    registry.set({
      id,
      kind: "fts",
      endpoint,
      search: opened.search as TomeSearch,
      close: opened.close,
    });
    ftsClosers.push(opened.close);
  }

  // Only wire observe edges into sync-fed FTS sinks (same-DB FTS omits endpoint).
  const ftsStoreIds = registry.ftsStoreIdsWithSync();
  const baseGraph =
    options.syncGraph ?? buildDefaultSyncGraph(flatfileIds, queryStoreId, ftsStoreIds);
  const graph = ensureFtsObserveEdges(baseGraph, flatfileIds, ftsStoreIds);

  const hasObserveEdges = Object.keys(graph.edges).length > 0;
  let wire: SyncGraphWireResult | null = null;
  if (hasObserveEdges || Object.keys(graph.nodes).length > 0) {
    wire = wireSyncGraph({ graph, registry, nodeTypes });
    if (!options.deferReady && hasObserveEdges) {
      await wire.runInitialFull();
    }
  }

  return {
    registry,
    writeContext,
    wire,
    queryStoreId,
    flatfileStoreIds: flatfileIds,
    dispose() {
      wire?.dispose();
      for (const close of ftsClosers) close();
      for (const close of otherClosers) void close();
      void composedClose?.();
    },
  };
}

/** Re-export helper for adapters that need a SyncSourceRead over the union queryable. */
export function unionSyncSource(session: DataStoreSession): ReturnType<typeof syncSourceFromQueryable> {
  return syncSourceFromQueryable(session.writeContext.graphStore);
}
