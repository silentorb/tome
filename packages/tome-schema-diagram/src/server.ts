import type { ServerPageBlockHost } from "tome-interfaces/page-block/server";
import { buildErDiagramMermaid } from "./build-mermaid";
import { parseSchemaDiagramConfig } from "./config";
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
      const action = typeof record.action === "string" ? record.action : "mermaid";
      const blockData = record.data ?? {};

      const snapshot = await loadSchemaDiagramSnapshot(ctx.services.schemaQuery);
      if (!snapshot) {
        return { ok: false, error: "schema query unavailable" };
      }

      if (action === "snapshot") {
        return { ok: true, snapshot };
      }

      const config = parseSchemaDiagramConfig(blockData);
      const diagram = buildErDiagramMermaid(snapshot, config);
      return { ok: true, ...diagram };
    },
  });
}

export { IMPLEMENTATION_ID };
