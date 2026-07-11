import {
  decodeEnumProperties,
  encodeEnumProperties,
  loadAssociationsFromContent,
  loadSchemaFromContent,
  setTraitPerspectives,
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
  const propertyCodec = {
    encode: (properties: Parameters<typeof encodeEnumProperties>[0]) =>
      encodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
    decode: (properties: Parameters<typeof decodeEnumProperties>[0]) =>
      decodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
  };
  const memberPerspectives = () =>
    setTraitPerspectives(loadAssociationsFromContent(contentDir));
  const cache = await loadConfiguredCache(config.cache, dbPath, {
    propertyCodec,
    memberPerspectives,
  });

  const graph = openTomeGraphServices({ store, cache });
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
