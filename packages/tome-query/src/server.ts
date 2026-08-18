import type { ServerPageBlockHost } from "tome-interfaces/page-block/server";
import { IMPLEMENTATION_ID, parseQueryBlockData } from "./config";
import type { GraphParameterValue } from "./parameters";
import { executeQueryBlock } from "./render";

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
      const action = typeof record.action === "string" ? record.action : "execute";
      if (action !== "execute") {
        throw new Error(`Unknown tome-query action "${action}"`);
      }

      const data = "data" in record ? record.data : record;
      const parameters = parseParameterOverrides(record.parameters);
      const parsed = parseQueryBlockData(data);
      try {
        const table = await executeQueryBlock(
          ctx.services.sqlQuery,
          parsed.reactFlow,
          parameters,
        );
        return { ok: true, ...table };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  });
}

export { IMPLEMENTATION_ID };
