import type { HtmlPageBlockHost } from "tome-interfaces/page-block/html";
import { renderSpatialGraph, renderSpatialGraphEmptyState } from "./render";

const IMPLEMENTATION_ID = "spatial-graph";

export function register(host: HtmlPageBlockHost): void {
  host.registerPageBlockRenderer({
    implementationId: IMPLEMENTATION_ID,
    async renderHtml(ctx, data) {
      const graphQuery = ctx.services?.graphQuery;
      if (!graphQuery) {
        return renderSpatialGraphEmptyState(ctx.component.label);
      }
      const result = await renderSpatialGraph(graphQuery, ctx.nodeId, data);
      return result.html;
    },
  });
}

export { IMPLEMENTATION_ID };
