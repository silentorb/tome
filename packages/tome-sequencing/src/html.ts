import type { HtmlPageBlockHost } from "tome-interfaces/page-block/html";
import { IMPLEMENTATION_ID, parseSequencingBlockData } from "./config";
import { arrangeTimeline } from "./arrange";
import { sequencingNodePageHref } from "./node-links";
import { renderTimelineStaticHtml } from "./static-svg";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function register(host: HtmlPageBlockHost): void {
  host.registerPageBlockRenderer({
    implementationId: IMPLEMENTATION_ID,
    async renderHtml(ctx, data) {
      parseSequencingBlockData(data);
      if (!ctx.services?.sqlQuery || !ctx.nodeId) {
        return `<figure class="tome-sequencing-block"><p>Timeline requires editor host services.</p></figure>`;
      }
      try {
        const layout = await arrangeTimeline({
          pageNodeId: ctx.nodeId,
          blockData: data,
          sqlQuery: ctx.services.sqlQuery,
          graphQuery: ctx.services.graphQuery,
          contentDir: ctx.contentDir,
        });
        return renderTimelineStaticHtml(layout, {
          nodePageHref: ctx.services.nodePageHref ?? sequencingNodePageHref,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return `<figure class="tome-sequencing-block"><p>Timeline failed: ${escapeHtml(message)}</p></figure>`;
      }
    },
  });
}

export { IMPLEMENTATION_ID };
