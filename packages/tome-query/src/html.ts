import type { HtmlPageBlockHost } from "tome-interfaces/page-block/html";
import { loadSchemaFromContent } from "tome-flatfile/schema-load";
import { IMPLEMENTATION_ID, parseQueryBlockData } from "./config";
import {
  executeQueryBlock,
  renderQueryPlaceholderHtml,
  renderQueryTableHtml,
} from "./render";

export function register(host: HtmlPageBlockHost): void {
  host.registerPageBlockRenderer({
    implementationId: IMPLEMENTATION_ID,
    async renderHtml(ctx, data) {
      const parsed = parseQueryBlockData(data);
      if (!ctx.services?.executeImp) {
        return renderQueryPlaceholderHtml("Query results require the editor or static-site host.");
      }
      try {
        const schema = ctx.contentDir ? loadSchemaFromContent(ctx.contentDir) : undefined;
        const table = await executeQueryBlock(
          ctx.services.executeImp,
          parsed.reactFlow,
          undefined,
          schema,
          { pageNodeId: ctx.nodeId, lookup: ctx.services.corpusQuery },
        );
        const nodePageHref = ctx.services.nodePageHref;
        return renderQueryTableHtml(table, nodePageHref);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return renderQueryPlaceholderHtml(`Query failed: ${message}`);
      }
    },
  });
}

export { IMPLEMENTATION_ID };
