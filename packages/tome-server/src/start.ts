import { openTomeGraphServices } from "./graph-services";
import { loadServerConfig, resolveServerConfigPath, startConfiguredServices } from "./load-services";
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

  const graph = openTomeGraphServices(dbPath, contentPath);
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
