import type { HtmlPageBlockHost } from "tome-interfaces/page-block/html";
import { renderSchemaDiagramHtml } from "./render";

const IMPLEMENTATION_ID = "schema-diagram";

export function register(host: HtmlPageBlockHost): void {
  host.registerPageBlockRenderer({
    implementationId: IMPLEMENTATION_ID,
    async renderHtml(ctx, data) {
      return renderSchemaDiagramHtml(ctx.services?.schemaQuery, data, ctx.component.label);
    },
  });
}

export { IMPLEMENTATION_ID };
