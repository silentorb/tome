import type { ServerPageBlockHost } from "tome-interfaces/page-block/server";
import { IMPLEMENTATION_ID, parseNodeFilterBlockData, summarizeNodeFilter } from "./config";

export function register(host: ServerPageBlockHost): void {
  host.registerPageBlockHandler({
    implementationId: IMPLEMENTATION_ID,
    async invoke(_ctx, input) {
      const record =
        input && typeof input === "object" && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : {};
      const graph = parseNodeFilterBlockData(record.data ?? record);
      return {
        ok: true,
        summary: summarizeNodeFilter(graph),
        nodeCount: Object.keys(graph.nodes).length,
        edgeCount: Object.keys(graph.edges).length,
      };
    },
  });
}

export { IMPLEMENTATION_ID };
