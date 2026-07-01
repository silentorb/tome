import type { ServerPageBlockHost } from "tome-interfaces/page-block/server";
import { parseSchemaDiagramConfig } from "./config";
import { renderSchemaDiagramSvg } from "./render-svg";
import { loadSchemaDiagramSnapshot } from "./render";

const IMPLEMENTATION_ID = "schema-diagram";

export function register(host: ServerPageBlockHost): void {
  host.registerPageBlockHandler({
    implementationId: IMPLEMENTATION_ID,
    async invoke(ctx, input) {
      const record =
        input && typeof input === "object" && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : {};
      const action = typeof record.action === "string" ? record.action : "svg";
      const blockData = record.data ?? {};

      const snapshot = await loadSchemaDiagramSnapshot(ctx.services.schemaQuery);
      if (!snapshot) {
        return { ok: false, error: "schema query unavailable" };
      }

      if (action === "snapshot") {
        return { ok: true, snapshot };
      }

      if (action === "mermaid") {
        return {
          ok: false,
          error: "mermaid action removed; use action svg or graph",
        };
      }

      const config = parseSchemaDiagramConfig(blockData);
      const diagram = await renderSchemaDiagramSvg(snapshot, config);
      if (!diagram) {
        return { ok: false, error: "no diagram entities" };
      }
      return { ok: true, ...diagram };
    },
  });
}

export { IMPLEMENTATION_ID };
