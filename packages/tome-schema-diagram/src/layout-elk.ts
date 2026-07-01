import ELK from "elkjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ElkGraph } from "./build-elk-graph";

let elkInstance: InstanceType<typeof ELK> | null = null;

function getElk(): InstanceType<typeof ELK> {
  if (!elkInstance) {
    const workerPath = join(
      dirname(fileURLToPath(import.meta.resolve("elkjs/lib/elk-worker.min.js"))),
      "elk-worker.min.js",
    );
    elkInstance = new ELK({ workerUrl: workerPath });
  }
  return elkInstance;
}

export async function layoutElkGraph(graph: ElkGraph): Promise<ElkGraph> {
  return (await getElk().layout(graph)) as ElkGraph;
}
