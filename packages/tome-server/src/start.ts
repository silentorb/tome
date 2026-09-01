import {
  decodeEnumProperties,
  encodeEnumProperties,
  loadSchemaFromContent,
  setTraitProjectionTypes,
} from "tome-db";
import { openTomeGraphServices } from "./graph-services";
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

  console.log(
    "[tome-server] opening graph services (cache sync may take a while on large corpora)…",
  );
  const graphStartedAt = performance.now();
  const graph = openTomeGraphServices({ store, cache });
  console.log(`[tome-server] graph ready (${Math.round(performance.now() - graphStartedAt)}ms)`);

  const started = await startConfiguredServices(graph, config);

  return {
    graph,
    services: started.modules,
    async stop() {
      await started.stop();
      graph.close();
    },
  };
}
