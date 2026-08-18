import type { ServerPageBlockHost } from "tome-interfaces/page-block/server";
import { IMPLEMENTATION_ID, parseSequencingBlockData } from "./config";
import { arrangeTimeline } from "./arrange";
import type { GraphParameterValue } from "tome-query/parameters";

function parseParameterOverrides(raw: unknown): Record<string, GraphParameterValue> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, GraphParameterValue> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    }
  }
  return out;
}

export function register(host: ServerPageBlockHost): void {
  host.registerPageBlockHandler({
    implementationId: IMPLEMENTATION_ID,
    async invoke(ctx, input) {
      const record =
        input && typeof input === "object" && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : {};
      const action = typeof record.action === "string" ? record.action : "arrange";
      if (action !== "arrange" && action !== "execute") {
        throw new Error(`Unknown tome-sequencing action "${action}"`);
      }

      const pageNodeId =
        (typeof record.nodeId === "string" && record.nodeId) ||
        ctx.nodeId ||
        "";
      if (!pageNodeId) {
        return { ok: false, error: "page nodeId is required" };
      }

      const data = "data" in record ? record.data : record;
      parseSequencingBlockData(data);
      const parameters = parseParameterOverrides(record.parameters);

      if (!ctx.services.sqlQuery) {
        return { ok: false, error: "sqlQuery host service is not available" };
      }

      try {
        const layout = await arrangeTimeline({
          pageNodeId,
          blockData: data,
          sqlQuery: ctx.services.sqlQuery,
          graphQuery: ctx.services.graphQuery,
          parameters,
        });
        return { ok: true, layout };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  });
}

export { IMPLEMENTATION_ID };
