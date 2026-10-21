import type { Graph } from "imp-core-types";
import {
  composeSyncProgressReporters,
  createCacheSyncStatusTracker,
  createConsoleSyncProgressReporter,
} from "tome-db/content";
import { openDataStoreSession } from "tome-db/sync";
import {
  contentHasAuthorizationModelType,
  discoverAuthorizationModelInstanceIds,
} from "tome-flatfile";
import { InMemorySessionStore, sessionCookieHeader } from "tome-http";
import { createCanEditNodesEvaluator } from "./authorization/can-edit-nodes-policy";
import { AuthorizationRegistry } from "./authorization/registry";
import { openTomeGraphServicesDeferred } from "./graph-services";
import { createAccountNodeValidator } from "./identity/account-validation";
import {
  DEFAULT_USER_CORPUS_ID,
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

  // Inject default paths / URIs into store options when omitted.
  const dataStores = { ...config.dataStores };
  const postgresUri = process.env.POSTGRES_URI?.trim();
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
    if (
      entry.module.includes("tome-postgres") ||
      entry.export.includes("Postgres")
    ) {
      const opts =
        entry.options && typeof entry.options === "object"
          ? { ...(entry.options as Record<string, unknown>) }
          : {};
      const hasUri =
        (typeof opts.connectionString === "string" && opts.connectionString.trim()) ||
        (typeof opts.uri === "string" && opts.uri.trim());
      if (!hasUri && postgresUri) {
        opts.connectionString = postgresUri;
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

  const corpora = session.writeContext.graphStore.listCorpora();
  console.log(
    `[tome-server] corpora=${corpora.map((c) => `${c.id}:${c.access}`).join(",")}`,
  );

  const searchBackends = new Map<string, unknown>();
  for (const entry of session.registry.list()) {
    if (entry.kind === "fts") {
      searchBackends.set(entry.id, entry.search);
    }
  }

  const sessionStore = new InMemorySessionStore();
  const flatfileStore = session.writeContext.store;
  const hasUserCorpus = corpora.some((c) => c.id === DEFAULT_USER_CORPUS_ID);
  const evaluateModification =
    config.authorization.implementationId === "authorization-model" && hasUserCorpus
      ? createCanEditNodesEvaluator({
          queryAll: (sql, ...params) => session.writeContext.cache.queryAll(sql, ...params),
        })
      : undefined;
  const authorizationRegistry = new AuthorizationRegistry({
    listContentDirs: () =>
      flatfileStore
        ? flatfileStore.listCorpora().map((c) => c.contentDir)
        : corpora.map((c) => c.contentDir),
    discoverAuthorizationModelInstanceIds,
    contentHasAuthorizationModelType,
    evaluateModification,
  });
  authorizationRegistry.resetAndApplyBuiltIns(config.authorization);

  const deferred = await openTomeGraphServicesDeferred(
    flatfileStore
      ? { store: flatfileStore, cache: session.writeContext.cache }
      : { cache: session.writeContext.cache },
    {
      progress,
      writeContext: session.writeContext,
      skipStoreSyncSubscribe: true,
      searchBackends,
      authenticationHooks: {
        createSession: (input) => sessionStore.create(input),
        sessionCookieHeader,
      },
      authorization: {
        registry: authorizationRegistry,
        builtIns: config.authorization,
      },
    },
  );

  const validateAccountNodeId =
    hasUserCorpus && flatfileStore
      ? createAccountNodeValidator(flatfileStore)
      : undefined;

  const started = await startConfiguredServices(deferred.services, rawConfig, {
    getCacheSyncStatus: () => syncStatus.getStatus(),
    cacheDbPath: dbPath,
    sessionStore,
    getAuthenticationProvider: () => deferred.getAuthenticationProvider(),
    getAuthorizer: () => authorizationRegistry.getAuthorizer(),
    validateAccountNodeId,
  });

  const graphStartedAt = performance.now();
  if (session.writeContext.sync) {
    console.log("[tome-server] cache sync starting…");
    await session.writeContext.sync.ensureReady();
    if (session.wire) {
      await session.wire.runInitialFull();
    }
  } else {
    console.log("[tome-server] SoT-only session (no CacheSync)…");
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
