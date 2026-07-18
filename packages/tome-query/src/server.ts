import type { ServerPageBlockHost } from "tome-interfaces/page-block/server";
import { IMPLEMENTATION_ID, parseQueryBlockData } from "./config";
import { executeQueryBlock } from "./render";

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
      const parsed = parseQueryBlockData(data);
      try {
        const table = await executeQueryBlock(ctx.services.sqlQuery, parsed.reactFlow);
        return { ok: true, ...table };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  });
}

export { IMPLEMENTATION_ID };
