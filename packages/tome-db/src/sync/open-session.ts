import type { Graph } from "imp-core-types";
import {
  ContentStore,
  CompositeStore,
  FlatfileGraphStore,
  loadSchemaFromContent,
  loadAssociationsFromContent,
  setTraitProjectionTypes,
} from "tome-flatfile";
import type {
  TomeCorpusConfig,
  TomeQueryCache,
  TomeQueryCacheOpenOptions,
  TomeServerModuleConfigEntry,
} from "tome-service-interfaces";
import { GraphDatabase } from "tome-sqlite";
import { FlatfileQueryableGraphStore, ComposedGraphStore } from "../graph-store/composed-graph-store";
import { CacheSync, type SyncProgressReporter } from "../content/sync";
import { decodeEnumProperties, encodeEnumProperties } from "../enum-codec";
import type { FlatfileStore, TomeWriteContext } from "../content/write-context";
import { DataStoreRegistry } from "./registry";
import {
  createDefaultSyncNodeTypeRegistry,
  type SyncNodeTypeRegistry,
} from "./node-registry";
import {
  createFlatfileSyncEndpoint,
  createSqliteCacheSyncEndpoint,
  syncSourceFromQueryable,
} from "./adapters";
import { buildDefaultSyncGraph, wireSyncGraph, type SyncGraphWireResult } from "./wire";

export type OpenDataStoreSessionOptions = {
  /** Normalized data store module entries keyed by id. */
  dataStores: Record<string, TomeServerModuleConfigEntry>;
  /** Imp sync wiring graph; default synthesizes flatfile→query edges. */
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

function optionsRecord(options: unknown): Record<string, unknown> {
  if (options && typeof options === "object" && !Array.isArray(options)) {
    return options as Record<string, unknown>;
  }
  return {};
}

function isFlatfileEntry(entry: TomeServerModuleConfigEntry): boolean {
  return entry.module === "tome-flatfile" || entry.export.includes("Flatfile");
}

function isSqliteEntry(entry: TomeServerModuleConfigEntry): boolean {
  return entry.module === "tome-sqlite" || entry.export.includes("Sqlite");
}

/**
 * Open heterogeneous dataStores, build editor union + CacheSync, wire sync observers.
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

  for (const [id, entry] of entries) {
    if (isSqliteEntry(entry)) {
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
    throw new Error(`dataStores.${id}: unsupported module "${entry.module}"`);
  }

  if (flatfileConfigs.length === 0) {
    throw new Error("openDataStoreSession: at least one flatfile dataStore is required");
  }
  if (!sqliteEntry) {
    throw new Error("openDataStoreSession: a sqlite dataStore is required");
  }

  const queryStoreId = options.queryStoreId ?? sqliteEntry.id;

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
    (() => setTraitProjectionTypes(loadAssociationsFromContent(contentDir)));

  const sqliteOpts = optionsRecord(sqliteEntry.entry.options);
  const dbPath =
    typeof sqliteOpts.dbPath === "string" && sqliteOpts.dbPath.trim()
      ? sqliteOpts.dbPath.trim()
      : options.defaultDbPath;
  if (!dbPath) {
    throw new Error(`dataStores.${sqliteEntry.id}: dbPath required`);
  }

  const cache = new GraphDatabase(dbPath, {
    clean: sqliteOpts.clean === true,
    propertyCodec,
    memberPerspectives,
  }) as unknown as TomeQueryCache;

  const sync = new CacheSync(unionStore, cache, options.progress);
  const composed = new ComposedGraphStore(
    new FlatfileGraphStore(unionStore),
    cache as unknown as GraphDatabase,
    sync,
  );

  // Per-corpus flatfile endpoints (subscribe on child stores when composite).
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

  const graph =
    options.syncGraph ?? buildDefaultSyncGraph(flatfileIds, queryStoreId);

  let wire: SyncGraphWireResult | null = null;
  if (!options.deferReady) {
    wire = wireSyncGraph({ graph, registry, nodeTypes });
    await wire.runInitialFull();
  } else {
    // Validate + install observers, but defer initial full to caller.
    wire = wireSyncGraph({ graph, registry, nodeTypes });
  }

  const writeContext: TomeWriteContext = {
    graphStore: composed,
    store: unionStore,
    sync,
    cache,
  };

  return {
    registry,
    writeContext,
    wire,
    queryStoreId,
    flatfileStoreIds: flatfileIds,
    dispose() {
      wire?.dispose();
      composed.close();
    },
  };
}

/** Re-export helper for adapters that need a SyncSourceRead over the union queryable. */
export function unionSyncSource(session: DataStoreSession): ReturnType<typeof syncSourceFromQueryable> {
  return syncSourceFromQueryable(session.writeContext.graphStore);
}
