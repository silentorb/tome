import {
  decodeEnumProperties,
  encodeEnumProperties,
  loadSchemaFromContent,
  setTraitProjectionTypes,
} from "tome-db";
import {
  composeSyncProgressReporters,
  createCacheSyncStatusTracker,
  createConsoleSyncProgressReporter,
  finishDeferredWriteContextReady,
} from "tome-db/content";
import { openTomeGraphServicesDeferred } from "./graph-services";
import {
  loadConfiguredCache,
  loadConfiguredStore,
  loadServerConfig,
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
  const config = loadServerConfig(configPath);

  console.log(`[tome-server] content=${contentPath}`);
  console.log(`[tome-server] db=${dbPath}`);
  console.log(`[tome-server] config=${configPath}`);

  const store = await loadConfiguredStore(config.store, contentPath);
  const contentDir = store.contentDir;
  console.log(
    `[tome-server] corpora=${store
      .listCorpora()
      .map((c) => `${c.id}:${c.access}`)
      .join(",")}`,
  );
  const propertyCodec = {
    encode: (properties: Parameters<typeof encodeEnumProperties>[0]) =>
      encodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
    decode: (properties: Parameters<typeof decodeEnumProperties>[0]) =>
      decodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
  };
  const memberPerspectives = () => setTraitProjectionTypes(store.readAssociationsFile());
  const cache = await loadConfiguredCache(config.cache, dbPath, {
    propertyCodec,
    memberPerspectives,
  });

  const syncStatus = createCacheSyncStatusTracker();
  const progress = composeSyncProgressReporters(
    createConsoleSyncProgressReporter(),
    syncStatus.report,
  );

  console.log(
    "[tome-server] opening graph services (HTTP will listen during cache sync)…",
  );
  const deferred = openTomeGraphServicesDeferred(
    { store, cache },
    { progress },
  );

  const started = await startConfiguredServices(deferred.services, config, {
    getCacheSyncStatus: () => syncStatus.getStatus(),
  });

  const graphStartedAt = performance.now();
  console.log("[tome-server] cache sync starting…");
  await deferred.writeCtx.sync.ensureReadyAsync();
  syncStatus.markReady();
  finishDeferredWriteContextReady(deferred.writeCtx);
  deferred.startWatching();
  console.log(
    `[tome-server] graph ready (${Math.round(performance.now() - graphStartedAt)}ms)`,
  );

  return {
    graph: deferred.services,
    services: started.modules,
    async stop() {
      await started.stop();
      deferred.services.close();
    },
  };
}
