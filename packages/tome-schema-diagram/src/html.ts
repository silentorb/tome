import type { HtmlPageBlockHost } from "tome-interfaces/page-block/html";
import {
  renderSchemaDiagramDeferred,
  renderSchemaDiagramEditorShell,
} from "./render";

const IMPLEMENTATION_ID = "schema-diagram";

export function register(host: HtmlPageBlockHost): void {
  host.registerPageBlockRenderer({
    implementationId: IMPLEMENTATION_ID,
    async renderHtml(ctx, data) {
      if (ctx.renderMode === "static") {
        return renderSchemaDiagramDeferred(ctx.component.label);
      }
      return renderSchemaDiagramEditorShell(ctx.services?.schemaQuery, data, ctx.component.label);
    },
  });
}

export { IMPLEMENTATION_ID };
