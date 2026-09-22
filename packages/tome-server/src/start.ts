import type { Graph } from "imp-core-types";
import {
  composeSyncProgressReporters,
  createCacheSyncStatusTracker,
  createConsoleSyncProgressReporter,
} from "tome-db/content";
import { openDataStoreSession } from "tome-db/sync";
import { openTomeGraphServicesDeferred } from "./graph-services";
import {
  loadServerConfig,
  normalizeServerConfig,
  resolveServerConfigPath,
  startConfiguredServices,
} from "./load-services";
import { resolveContentPath, resolveDbPath } from "./paths";

export async function startTomeServer(options?: {
  dbPath?: string;
  contentPath?: string;
  configPath?: string;
}) {
  const contentPath = options?.contentPath ?? resolveContentPath();
  const dbPath = options?.dbPath ?? resolveDbPath();
  const configPath = options?.configPath ?? resolveServerConfigPath();
  const rawConfig = loadServerConfig(configPath);
  const config = normalizeServerConfig(rawConfig);

  console.log(`[tome-server] content=${contentPath}`);
  console.log(`[tome-server] db=${dbPath}`);
  console.log(`[tome-server] config=${configPath}`);
  console.log(
    `[tome-server] dataStores=${Object.keys(config.dataStores).join(",")}`,
  );

  // Inject default paths into store options when omitted (solo / env-driven).
  const dataStores = { ...config.dataStores };
  for (const [id, entry] of Object.entries(dataStores)) {
    if (entry.module.includes("flatfile")) {
      const opts =
        entry.options && typeof entry.options === "object"
          ? { ...(entry.options as Record<string, unknown>) }
          : {};
      if (typeof opts.contentPath !== "string" || !String(opts.contentPath).trim()) {
        opts.contentPath = contentPath;
        dataStores[id] = { ...entry, options: opts };
      }
    }
    if (entry.module.includes("sqlite") || entry.module.includes("search-sqlite")) {
      const opts =
        entry.options && typeof entry.options === "object"
          ? { ...(entry.options as Record<string, unknown>) }
          : {};
      if (typeof opts.dbPath !== "string" || !String(opts.dbPath).trim()) {
        if (entry.module.includes("search-sqlite")) {
          opts.dbPath = `${dbPath.replace(/\.sqlite$/, "")}-fts.sqlite`;
        } else {
          opts.dbPath = dbPath;
        }
        dataStores[id] = { ...entry, options: opts };
      }
    }
  }

  const syncStatus = createCacheSyncStatusTracker();
  const progress = composeSyncProgressReporters(
    createConsoleSyncProgressReporter(),
    syncStatus.report,
  );

  const syncGraph =
    config.sync.graph && typeof config.sync.graph === "object"
      ? (config.sync.graph as Graph)
      : undefined;

  console.log(
    "[tome-server] opening graph services (HTTP will listen during cache sync)…",
  );

  const session = await openDataStoreSession({
    dataStores,
    syncGraph,
    queryStoreId: config.sync.queryStoreId,
    defaultContentPath: contentPath,
    defaultDbPath: dbPath,
    progress,
    deferReady: true,
  });

  const store = session.writeContext.store;
  console.log(
    `[tome-server] corpora=${store
      .listCorpora()
      .map((c) => `${c.id}:${c.access}`)
      .join(",")}`,
  );

  const searchBackends = new Map<string, unknown>();
  for (const entry of session.registry.list()) {
    if (entry.kind === "fts") {
      searchBackends.set(entry.id, entry.search);
    }
  }

  const deferred = openTomeGraphServicesDeferred(
    { store: session.writeContext.store, cache: session.writeContext.cache },
    {
      progress,
      writeContext: session.writeContext,
      skipStoreSyncSubscribe: true,
      searchBackends,
    },
  );

  const started = await startConfiguredServices(deferred.services, rawConfig, {
    getCacheSyncStatus: () => syncStatus.getStatus(),
    cacheDbPath: dbPath,
  });

  const graphStartedAt = performance.now();
  console.log("[tome-server] cache sync starting…");
  await session.writeContext.sync.ensureReadyAsync();
  if (session.wire) {
    await session.wire.runInitialFull();
  }
  await deferred.extensionsReady;
  syncStatus.markReady();
  // Observers already installed by SyncGraphWire — do not subscribeStoreToCacheSync again.
  deferred.startWatching();
  console.log(
    `[tome-server] graph ready (${Math.round(performance.now() - graphStartedAt)}ms)`,
  );

  return {
    graph: deferred.services,
    services: started.modules,
    session,
    async stop() {
      await started.stop();
      session.dispose();
    },
  };
}
