import type { ServerPageBlockHost } from "tome-interfaces/page-block/server";
import { renderSpatialGraph } from "./render";

const IMPLEMENTATION_ID = "spatial-graph";

export function register(host: ServerPageBlockHost): void {
  host.registerPageBlockHandler({
    implementationId: IMPLEMENTATION_ID,
    async invoke(ctx, input) {
      const record =
        input && typeof input === "object" && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : {};
      const action = typeof record.action === "string" ? record.action : "svg";
      const typeId = ctx.nodeId;
      if (!typeId) {
        return { ok: false, error: "missing nodeId" };
      }

      if (action === "elements") {
        const { parseSpatialGraphConfig } = await import("./config");
        const { selectSpatialGraph } = await import("./select-nodes");
        const { buildSpatialGraphElements } = await import("./build-elements");
        const config = parseSpatialGraphConfig(record.data ?? {});
        const selection = await selectSpatialGraph(ctx.services.graphQuery, typeId, config);
        const elements = buildSpatialGraphElements(selection.nodes, selection.edges, config);
        return { ok: true, elements, nodeCount: selection.nodes.length };
      }

      const result = await renderSpatialGraph(ctx.services.graphQuery, typeId, record.data ?? {});
      return {
        ok: true,
        svg: result.svg,
        html: result.html,
        nodeCount: result.nodeCount,
        edgeCount: result.edgeCount,
      };
    },
  });
}

export { IMPLEMENTATION_ID };
