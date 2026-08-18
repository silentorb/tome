import type { ExtensionGraphMutateServices } from "tome-interfaces/extension-services/graph-mutate";
import type { ExtensionGraphQueryServices } from "tome-interfaces/extension-services/graph-query";
import type { ExtensionSqlQueryServices } from "tome-interfaces/extension-services/sql-query";
import type { DependsConstraint } from "tome-sequencing-interfaces";
import type { GraphParameterValue } from "tome-query/parameters";
import { arrangeTimeline, loadDependsEdges, runEventQuery } from "./arrange";
import { parseSequencingBlockData } from "./config";
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
  sqlQuery: ExtensionSqlQueryServices;
  contentDir: string;
  parameters?: Record<string, GraphParameterValue>;
}): Promise<string[]> {
  const parsed = parseSequencingBlockData(input.blockData);
  const rows = await runEventQuery({
    sqlQuery: input.sqlQuery,
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

export async function mutateTimelineDepends(input: {
  action: DependsMutationAction;
  pageNodeId: string;
  prerequisiteId: string;
  dependentId: string;
  blockData: unknown;
  sqlQuery: ExtensionSqlQueryServices;
  graphQuery: ExtensionGraphQueryServices;
  graphMutate: ExtensionGraphMutateServices;
  contentDir?: string;
  parameters?: Record<string, GraphParameterValue>;
}): Promise<DependsMutationResult> {
  if (input.prerequisiteId === input.dependentId) {
    return { ok: false, error: "An event cannot depend on itself" };
  }

  const contentDir = input.contentDir ?? contentDirFromEnv();
  const config = loadTableSequencingConfig(input.pageNodeId, contentDir);
  if (!config) {
    return { ok: false, error: `No sequencing.json entry for table "${input.pageNodeId}"` };
  }

  const type = config.dependsAssociation;
  if (input.action === "addDepends") {
    const error = await Promise.resolve(
      input.graphMutate.linkOutgoing({
        sourceId: input.prerequisiteId,
        targetId: input.dependentId,
        type,
      }),
    );
    if (error) {
      return { ok: false, error };
    }
  } else {
    const error = await Promise.resolve(
      input.graphMutate.unlinkOutgoing(input.prerequisiteId, input.dependentId, type),
    );
    if (error) {
      return { ok: false, error };
    }
  }

  try {
    const layout = await arrangeTimeline({
      pageNodeId: input.pageNodeId,
      blockData: input.blockData,
      sqlQuery: input.sqlQuery,
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
        sqlQuery: input.sqlQuery,
        contentDir,
        parameters: input.parameters,
      });
    } catch {
      /* keep the mutated endpoints so the popup can still list the edge */
    }
    const depends = await loadDependsEdges(input.graphQuery, eventIds, type);
    return { ok: false, error: message, depends };
  }
}
