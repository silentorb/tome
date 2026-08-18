import type { ServerPageBlockHost } from "tome-interfaces/page-block/server";
import { IMPLEMENTATION_ID, parseSequencingBlockData } from "./config";
import { arrangeTimeline } from "./arrange";
import { mutateTimelineDepends, type DependsMutationAction } from "./depends";
import { isSequenceEndpoint } from "./depends-endpoints";
import type { GraphParameterValue } from "tome-query/parameters";
import type { SequenceEndpoint } from "tome-sequencing-interfaces";

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

function parseDependsMutationInput(record: Record<string, unknown>): {
  prerequisiteId: string;
  dependentId: string;
  from: SequenceEndpoint;
  to: SequenceEndpoint;
} | null {
  const prerequisiteId =
    typeof record.prerequisiteId === "string" ? record.prerequisiteId : "";
  const dependentId = typeof record.dependentId === "string" ? record.dependentId : "";
  const from = record.from;
  const to = record.to;
  if (!prerequisiteId || !dependentId) return null;
  if (!isSequenceEndpoint(from) || !isSequenceEndpoint(to)) return null;
  return { prerequisiteId, dependentId, from, to };
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
      if (
        action !== "arrange" &&
        action !== "execute" &&
        action !== "addDepends" &&
        action !== "removeDepends"
      ) {
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
      const parameters = parseParameterOverrides(record.parameters);

      if (!ctx.services.sqlQuery) {
        return { ok: false, error: "sqlQuery host service is not available" };
      }

      if (action === "addDepends" || action === "removeDepends") {
        const endpoints = parseDependsMutationInput(record);
        if (!endpoints) {
          return {
            ok: false,
            error: "prerequisiteId, dependentId, from, and to are required",
          };
        }
        if (!ctx.services.graphQuery) {
          return { ok: false, error: "graphQuery host service is not available" };
        }
        if (!ctx.services.graphMutate) {
          return { ok: false, error: "graphMutate host service is not available" };
        }
        try {
          parseSequencingBlockData(data);
          return mutateTimelineDepends({
            action: action as DependsMutationAction,
            pageNodeId,
            prerequisiteId: endpoints.prerequisiteId,
            dependentId: endpoints.dependentId,
            from: endpoints.from,
            to: endpoints.to,
            blockData: data,
            sqlQuery: ctx.services.sqlQuery,
            graphQuery: ctx.services.graphQuery,
            graphMutate: ctx.services.graphMutate,
            parameters,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { ok: false, error: message };
        }
      }

      try {
        parseSequencingBlockData(data);
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
