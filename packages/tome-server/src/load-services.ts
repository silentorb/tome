import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  TomeServerConfig,
  TomeServerModuleConfigEntry,
  TomeServiceModule,
  TomeServiceModuleFactory,
  TomeStoreModule,
  TomeStoreModuleFactory,
  TomeCacheModule,
  TomeCacheModuleFactory,
  TomeDataStore,
  TomeQueryCache,
  TomeQueryCacheOpenOptions,
  TomeCorpusConfig,
  CacheSyncPublicStatus,
  NormalizedTomeServerConfig,
} from "tome-service-interfaces";
import type { TomeGraphServices } from "tome-graph-interfaces";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = resolve(moduleDir, "../config/tome-server.json");

function readEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function resolveServerConfigPath(): string {
  const fromEnv = readEnv("TOME_SERVER_CONFIG");
  if (fromEnv) return resolve(fromEnv);
  return DEFAULT_CONFIG_PATH;
}

function parseModuleEntry(entry: unknown, label: string): TomeServerModuleConfigEntry {
  if (!entry || typeof entry !== "object") {
    throw new Error(`tome-server config: ${label} must be an object`);
  }
  const e = entry as Record<string, unknown>;
  if (typeof e.id !== "string" || !e.id.trim()) {
    throw new Error(`tome-server config: ${label}.id required`);
  }
  if (typeof e.module !== "string" || !e.module.trim()) {
    throw new Error(`tome-server config: ${label}.module required`);
  }
  if (typeof e.export !== "string" || !e.export.trim()) {
    throw new Error(`tome-server config: ${label}.export required`);
  }
  return {
    id: e.id.trim(),
    module: e.module.trim(),
    export: e.export.trim(),
    options: e.options,
  };
}

function optionsRecord(options: unknown): Record<string, unknown> {
  if (options && typeof options === "object" && !Array.isArray(options)) {
    return options as Record<string, unknown>;
  }
  return {};
}

function parseDataStoresMap(raw: unknown): Record<string, TomeServerModuleConfigEntry> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("tome-server config: dataStores must be an object");
  }
  const out: Record<string, TomeServerModuleConfigEntry> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = parseModuleEntry(value, `dataStores.${key}`);
    out[key] = { ...entry, id: key };
  }
  if (Object.keys(out).length === 0) {
    throw new Error("tome-server config: dataStores must not be empty");
  }
  return out;
}

function parseSyncBlock(raw: unknown): TomeServerConfig["sync"] {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("tome-server config: sync must be an object");
  }
  const s = raw as Record<string, unknown>;
  const libraries = Array.isArray(s.libraries)
    ? s.libraries.map((entry, i) => parseModuleEntry(entry, `sync.libraries[${i}]`))
    : undefined;
  return {
    graph: s.graph,
    queryStoreId: typeof s.queryStoreId === "string" ? s.queryStoreId.trim() : undefined,
    libraries,
  };
}

function isSearchSqliteModule(entry: TomeServerModuleConfigEntry): boolean {
  return (
    entry.module.includes("search-sqlite") ||
    entry.export.includes("SearchSqlite") ||
    entry.export.includes("createSearchSqliteModule")
  );
}

function isQuerySqliteModule(entry: TomeServerModuleConfigEntry): boolean {
  if (isSearchSqliteModule(entry)) return false;
  return entry.module.includes("sqlite") || entry.export.includes("Sqlite");
}

/** Ensure an FTS5 sink exists so the default searcher can open via getSearcherBackend("fts"). */
function ensureFtsDataStore(
  dataStores: Record<string, TomeServerModuleConfigEntry>,
): Record<string, TomeServerModuleConfigEntry> {
  if (Object.values(dataStores).some(isSearchSqliteModule)) return dataStores;
  const id = dataStores.fts ? "fts-index" : "fts";
  return {
    ...dataStores,
    [id]: {
      id,
      module: "tome-search-sqlite",
      export: "createSearchSqliteModule",
      options: {},
    },
  };
}

/**
 * Migrate legacy store+cache(+corpora) into dataStores + sync.
 * Prefer explicit dataStores when present.
 * Always ensures an FTS sink so typed node search (including editor @ mentions) works
 * without requiring every host config to list tome-search-sqlite by hand.
 */
export function normalizeServerConfig(config: TomeServerConfig): NormalizedTomeServerConfig {
  let dataStores = config.dataStores ? { ...config.dataStores } : {};

  if (Object.keys(dataStores).length === 0) {
    if (!config.store || !config.cache) {
      throw new Error("tome-server config: dataStores or store+cache required");
    }
    const storeOpts = optionsRecord(config.store.options);
    const corporaFromOptions = parseCorporaOption(storeOpts.corpora);
    const corporaFromEnv = parseTomeCorporaEnv(readEnv("TOME_CORPORA"));
    const corpora = corporaFromOptions ?? corporaFromEnv;

    if (corpora && corpora.length > 0) {
      for (const corpus of corpora) {
        dataStores[corpus.id] = {
          id: corpus.id,
          module: config.store.module,
          export: config.store.export,
          options: {
            contentPath: corpus.contentPath,
            access: corpus.access ?? "readwrite",
          },
        };
      }
    } else {
      const contentPath =
        typeof storeOpts.contentPath === "string" && storeOpts.contentPath.trim()
          ? storeOpts.contentPath.trim()
          : undefined;
      dataStores[config.store.id] = {
        ...config.store,
        options: {
          ...storeOpts,
          ...(contentPath ? { contentPath } : {}),
        },
      };
    }

    dataStores[config.cache.id] = { ...config.cache };
  }

  dataStores = ensureFtsDataStore(dataStores);

  const flatfileIds = Object.entries(dataStores)
    .filter(([, e]) => e.module.includes("flatfile") || e.export.includes("Flatfile"))
    .map(([id]) => id);
  const sqliteIds = Object.entries(dataStores)
    .filter(([, e]) => isQuerySqliteModule(e))
    .map(([id]) => id);

  if (flatfileIds.length === 0) {
    throw new Error("tome-server config: at least one flatfile dataStore required");
  }
  if (sqliteIds.length === 0) {
    throw new Error("tome-server config: at least one sqlite dataStore required");
  }

  const queryStoreId = config.sync?.queryStoreId ?? sqliteIds[0]!;
  const store = dataStores[flatfileIds[0]!]!;
  const cache = dataStores[queryStoreId] ?? dataStores[sqliteIds[0]!]!;

  return {
    version: config.version,
    dataStores,
    sync: {
      graph: config.sync?.graph,
      queryStoreId,
      libraries: config.sync?.libraries,
    },
    services: config.services,
    store,
    cache,
  };
}

export function parseServerConfig(raw: unknown): TomeServerConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("tome-server config: root must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const version = obj.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new Error("tome-server config: version must be a positive integer");
  }

  const servicesRaw = obj.services;
  if (!Array.isArray(servicesRaw)) {
    throw new Error("tome-server config: services must be an array");
  }
  const services: TomeServerModuleConfigEntry[] = servicesRaw.map((entry, index) =>
    parseModuleEntry(entry, `services[${index}]`),
  );

  const hasDataStores = obj.dataStores != null;
  const hasLegacy = obj.store != null || obj.cache != null;

  if (hasDataStores) {
    const dataStores = parseDataStoresMap(obj.dataStores);
    const sync = parseSyncBlock(obj.sync);
    // Keep legacy fields when present for older callers; normalize fills convenience.
    const store =
      obj.store != null ? parseModuleEntry(obj.store, "store") : undefined;
    const cache =
      obj.cache != null ? parseModuleEntry(obj.cache, "cache") : undefined;
    return { version, dataStores, sync, store, cache, services };
  }

  if (!hasLegacy) {
    throw new Error("tome-server config: dataStores or store+cache required");
  }
  const store = parseModuleEntry(obj.store, "store");
  const cache = parseModuleEntry(obj.cache, "cache");
  const sync = obj.sync != null ? parseSyncBlock(obj.sync) : undefined;
  return { version, store, cache, sync, services };
}

export function loadServerConfig(path = resolveServerConfigPath()): TomeServerConfig {
  if (!existsSync(path)) {
    throw new Error(`tome-server config not found: ${path}`);
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parseServerConfig(raw);
}

export function loadNormalizedServerConfig(
  path = resolveServerConfigPath(),
): NormalizedTomeServerConfig {
  return normalizeServerConfig(loadServerConfig(path));
}

async function loadServiceModule(entry: TomeServerModuleConfigEntry): Promise<TomeServiceModule> {
  const mod = (await import(entry.module)) as Record<string, unknown>;
  const factory = mod[entry.export];
  if (typeof factory !== "function") {
    throw new Error(
      `tome-server: ${entry.module} export "${entry.export}" is not a function`,
    );
  }
  const created = (factory as TomeServiceModuleFactory)();
  if (!created || typeof created.start !== "function") {
    throw new Error(
      `tome-server: ${entry.module}.${entry.export}() did not return a TomeServiceModule`,
    );
  }
  return { ...created, id: entry.id || created.id };
}

export async function loadConfiguredStore(
  entry: TomeServerModuleConfigEntry,
  defaultContentPath: string,
): Promise<TomeDataStore> {
  const mod = (await import(entry.module)) as Record<string, unknown>;
  const factory = mod[entry.export];
  if (typeof factory !== "function") {
    throw new Error(
      `tome-server: ${entry.module} export "${entry.export}" is not a function`,
    );
  }
  const created = (factory as TomeStoreModuleFactory)();
  if (!created || typeof created.open !== "function") {
    throw new Error(
      `tome-server: ${entry.module}.${entry.export}() did not return a TomeStoreModule`,
    );
  }
  const storeModule: TomeStoreModule = { ...created, id: entry.id || created.id };
  const opts = optionsRecord(entry.options);
  const corporaFromOptions = parseCorporaOption(opts.corpora);
  const corporaFromEnv = parseTomeCorporaEnv(readEnv("TOME_CORPORA"));
  const corpora = corporaFromOptions ?? corporaFromEnv;
  if (corpora && corpora.length > 0) {
    return storeModule.open({ corpora });
  }
  const contentPath =
    typeof opts.contentPath === "string" && opts.contentPath.trim()
      ? opts.contentPath.trim()
      : defaultContentPath;
  return storeModule.open({ contentPath });
}

function parseCorporaOption(raw: unknown): TomeCorpusConfig[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: TomeCorpusConfig[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id.trim()) continue;
    if (typeof e.contentPath !== "string" || !e.contentPath.trim()) continue;
    out.push({
      id: e.id.trim(),
      contentPath: e.contentPath.trim(),
      access: e.access === "readonly" ? "readonly" : "readwrite",
    });
  }
  return out.length > 0 ? out : undefined;
}

/** Parse `id=/abs/path[:readonly]` pairs separated by commas. */
export function parseTomeCorporaEnv(raw: string | undefined): TomeCorpusConfig[] | undefined {
  if (!raw?.trim()) return undefined;
  const out: TomeCorpusConfig[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const id = trimmed.slice(0, eq).trim();
    let pathPart = trimmed.slice(eq + 1).trim();
    let access: "readwrite" | "readonly" = "readwrite";
    if (pathPart.endsWith(":readonly")) {
      access = "readonly";
      pathPart = pathPart.slice(0, -":readonly".length);
    }
    if (!id || !pathPart) continue;
    out.push({ id, contentPath: pathPart, access });
  }
  return out.length > 0 ? out : undefined;
}

export async function loadConfiguredCache(
  entry: TomeServerModuleConfigEntry,
  defaultDbPath: string,
  extras?: Pick<TomeQueryCacheOpenOptions, "propertyCodec" | "memberPerspectives">,
): Promise<TomeQueryCache> {
  const mod = (await import(entry.module)) as Record<string, unknown>;
  const factory = mod[entry.export];
  if (typeof factory !== "function") {
    throw new Error(
      `tome-server: ${entry.module} export "${entry.export}" is not a function`,
    );
  }
  const created = (factory as TomeCacheModuleFactory)();
  if (!created || typeof created.open !== "function") {
    throw new Error(
      `tome-server: ${entry.module}.${entry.export}() did not return a TomeCacheModule`,
    );
  }
  const cacheModule: TomeCacheModule = { ...created, id: entry.id || created.id };
  const opts = optionsRecord(entry.options);
  const dbPath =
    typeof opts.dbPath === "string" && opts.dbPath.trim()
      ? opts.dbPath.trim()
      : defaultDbPath;
  return cacheModule.open({
    dbPath,
    propertyCodec: extras?.propertyCodec,
    memberPerspectives: extras?.memberPerspectives,
  });
}

export interface StartedServices {
  modules: TomeServiceModule[];
  stop(): Promise<void>;
}

export async function startConfiguredServices(
  graph: TomeGraphServices,
  config: TomeServerConfig = loadServerConfig(),
  hostExtras?: {
    getCacheSyncStatus?: () => CacheSyncPublicStatus;
    /** Cache SQLite path — forwarded into HTTP options for profiling DB neighbor derivation. */
    cacheDbPath?: string;
  },
): Promise<StartedServices> {
  if (config.services.length === 0) {
    console.warn(
      "[tome-server] no service modules configured (services: []); host is running without remotes",
    );
  }

  const modules: TomeServiceModule[] = [];
  for (const entry of config.services) {
    const service = await loadServiceModule(entry);
    const options: Record<string, unknown> = {
      ...(entry.options && typeof entry.options === "object"
        ? (entry.options as Record<string, unknown>)
        : {}),
    };
    if (hostExtras?.cacheDbPath && options.cacheDbPath == null) {
      options.cacheDbPath = hostExtras.cacheDbPath;
    }
    await service.start({
      services: graph,
      options,
      getCacheSyncStatus: hostExtras?.getCacheSyncStatus,
    });
    modules.push(service);
    console.log(`[tome-server] started service "${service.id}" from ${entry.module}`);
  }

  return {
    modules,
    async stop() {
      for (const mod of [...modules].reverse()) {
        await mod.stop?.();
      }
    },
  };
}
