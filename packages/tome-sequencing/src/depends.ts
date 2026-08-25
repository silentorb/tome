import type { ExtensionGraphMutateServices } from "tome-interfaces/extension-services/graph-mutate";
import type { ExtensionGraphQueryServices } from "tome-interfaces/extension-services/graph-query";
import type { ExtensionExecuteImpServices } from "tome-interfaces/extension-services/execute-imp";
import type { DependsConstraint, SequenceEndpoint } from "tome-sequencing-interfaces";
import type { GraphParameterValue } from "tome-query/parameters";
import { projectionType } from "tome-imp-sql";
import { arrangeTimeline, loadDependsEdges, runEventQuery } from "./arrange";
import { parseSequencingBlockData } from "./config";
import {
  endpointsProperty,
  isSequenceEndpoint,
  parseEndpointPairs,
} from "./depends-endpoints";
import { loadTableSequencingConfig } from "./sequencing-file";
import type { TimelineLayout } from "./layout";

export type DependsMutationAction = "addDepends" | "removeDepends";

export type DependsMutationResult =
  | { ok: true; layout: TimelineLayout }
  | { ok: false; error: string; depends?: DependsConstraint[] };

function contentDirFromEnv(): string {
  const fromEnv = process.env.TOME_CONTENT_PATH;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  throw new Error("TOME_CONTENT_PATH is required to load sequencing.json");
}

async function eventIdsForPage(input: {
  pageNodeId: string;
  blockData: unknown;
  executeImp: ExtensionExecuteImpServices;
  contentDir: string;
  parameters?: Record<string, GraphParameterValue>;
}): Promise<string[]> {
  const parsed = parseSequencingBlockData(input.blockData);
  const rows = await runEventQuery({
    executeImp: input.executeImp,
    reactFlow: parsed.reactFlow,
    pageNodeId: input.pageNodeId,
    parameters: input.parameters,
    contentDir: input.contentDir,
  });
  const ids: string[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : null;
    if (id) ids.push(id);
  }
  return ids;
}

async function findDirectedDependsRow(input: {
  graphQuery: ExtensionGraphQueryServices;
  prerequisiteId: string;
  dependentId: string;
  association: string;
}): Promise<{ properties: Record<string, unknown> } | null> {
  const type0 = projectionType(input.association, 0);
  const edges = await Promise.resolve(
    input.graphQuery.listEdges({
      nodeIds: [input.prerequisiteId, input.dependentId],
      types: [type0],
    }),
  );
  const match = edges.find(
    (edge) => edge.sourceId === input.prerequisiteId && edge.targetId === input.dependentId,
  );
  if (!match) return null;
  const properties =
    match.properties && typeof match.properties === "object" && !Array.isArray(match.properties)
      ? match.properties
      : {};
  return { properties };
}

export async function mutateTimelineDepends(input: {
  action: DependsMutationAction;
  pageNodeId: string;
  prerequisiteId: string;
  dependentId: string;
  from: SequenceEndpoint;
  to: SequenceEndpoint;
  blockData: unknown;
  executeImp: ExtensionExecuteImpServices;
  graphQuery: ExtensionGraphQueryServices;
  graphMutate: ExtensionGraphMutateServices;
  contentDir?: string;
  parameters?: Record<string, GraphParameterValue>;
}): Promise<DependsMutationResult> {
  if (input.prerequisiteId === input.dependentId) {
    return { ok: false, error: "An event cannot depend on itself" };
  }
  if (!isSequenceEndpoint(input.from) || !isSequenceEndpoint(input.to)) {
    return { ok: false, error: "Depends endpoints must be start or end" };
  }

  const contentDir = input.contentDir ?? contentDirFromEnv();
  const config = loadTableSequencingConfig(input.pageNodeId, contentDir);
  if (!config) {
    return { ok: false, error: `No sequencing.json entry for table "${input.pageNodeId}"` };
  }

  const type = config.dependsAssociation;
  const existing = await findDirectedDependsRow({
    graphQuery: input.graphQuery,
    prerequisiteId: input.prerequisiteId,
    dependentId: input.dependentId,
    association: type,
  });

  if (input.action === "addDepends") {
    if (!existing) {
      const error = await Promise.resolve(
        input.graphMutate.linkOutgoing({
          sourceId: input.prerequisiteId,
          targetId: input.dependentId,
          type,
          properties: endpointsProperty([{ from: input.from, to: input.to }]),
        }),
      );
      if (error) {
        return { ok: false, error };
      }
    } else {
      const pairs = parseEndpointPairs(existing.properties);
      if (!pairs) {
        return { ok: false, error: "Existing depends edge is missing start/end endpoints" };
      }
      if (pairs.some((pair) => pair.from === input.from && pair.to === input.to)) {
        return { ok: false, error: "This dependency already exists" };
      }
      const error = await Promise.resolve(
        input.graphMutate.replaceOutgoingProperties(input.prerequisiteId, input.dependentId, type, {
          ...existing.properties,
          ...endpointsProperty([...pairs, { from: input.from, to: input.to }]),
        }),
      );
      if (error) {
        return { ok: false, error };
      }
    }
  } else if (!existing) {
    const error = await Promise.resolve(
      input.graphMutate.unlinkOutgoing(input.prerequisiteId, input.dependentId, type),
    );
    if (error) {
      return { ok: false, error };
    }
  } else {
    const pairs = parseEndpointPairs(existing.properties);
    if (!pairs) {
      return { ok: false, error: "Existing depends edge is missing start/end endpoints" };
    }
    const remaining = pairs.filter((pair) => pair.from !== input.from || pair.to !== input.to);
    if (remaining.length === pairs.length) {
      return { ok: false, error: "not_found" };
    }
    if (remaining.length === 0) {
      const error = await Promise.resolve(
        input.graphMutate.unlinkOutgoing(input.prerequisiteId, input.dependentId, type),
      );
      if (error) {
        return { ok: false, error };
      }
    } else {
      const error = await Promise.resolve(
        input.graphMutate.replaceOutgoingProperties(input.prerequisiteId, input.dependentId, type, {
          ...existing.properties,
          ...endpointsProperty(remaining),
        }),
      );
      if (error) {
        return { ok: false, error };
      }
    }
  }

  try {
    const layout = await arrangeTimeline({
      pageNodeId: input.pageNodeId,
      blockData: input.blockData,
      executeImp: input.executeImp,
      graphQuery: input.graphQuery,
      contentDir,
      parameters: input.parameters,
    });
    return { ok: true, layout };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    let eventIds = [input.prerequisiteId, input.dependentId];
    try {
      eventIds = await eventIdsForPage({
        pageNodeId: input.pageNodeId,
        blockData: input.blockData,
        executeImp: input.executeImp,
        contentDir,
        parameters: input.parameters,
      });
    } catch {
      /* keep the mutated endpoints so the popup can still list the edge */
    }
    try {
      const depends = await loadDependsEdges(input.graphQuery, eventIds, type);
      return { ok: false, error: message, depends };
    } catch {
      return { ok: false, error: message };
    }
  }
}
